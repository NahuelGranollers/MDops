import type { NotificationType, Prisma } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db.js";
import { logSession } from "../session-log.js";
import { sendSmtpMail } from "./smtp.js";

type NotificationInput = {
  tenantId: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityId?: string | null;
};

type NotificationDb = Prisma.TransactionClient | typeof prisma;

type EmailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
  fromName: string;
  replyTo?: string;
};

type EventEmailDetails = Prisma.EventGetPayload<{
  include: {
    logistics: true;
    segments: true;
    assignments: {
      include: {
        segment: true;
        user: { select: { name: true; email: true } };
      };
    };
  };
}>;

type AvailabilityEmailDetails = Prisma.AvailabilityRequestGetPayload<{
  include: {
    user: { select: { name: true; email: true } };
  };
}>;

type NotificationContexts = {
  events: Map<string, EventEmailDetails>;
  availability: Map<string, AvailabilityEmailDetails>;
};

type NotificationContext = {
  event?: EventEmailDetails;
  availability?: AvailabilityEmailDetails;
};

export async function createNotification(data: NotificationInput, db: NotificationDb = prisma) {
  const notification = await db.notification.create({ data });
  queueNotificationEmails([data]);
  return notification;
}

export async function createNotifications(data: NotificationInput[], db: NotificationDb = prisma) {
  if (!data.length) return { count: 0 };
  const result = await db.notification.createMany({ data });
  queueNotificationEmails(data);
  return result;
}

export function queueNotificationEmails(notifications: NotificationInput[]) {
  if (!notifications.length) return;
  void sendNotificationEmails(notifications).catch((error) => {
    logSession({
      type: "email_error",
      message: "No se han podido enviar notificaciones por correo",
      data: { error: error instanceof Error ? error.message : String(error), count: notifications.length }
    });
  });
}

export async function sendTestEmail(to: string, name?: string | null) {
  const config = getEmailConfig();
  if (!config.configured) {
    throw new Error(`Correo no configurado. Faltan: ${config.missing.join(", ") || "configuración SMTP"}`);
  }
  if (!isDeliverableEmail(to)) {
    throw new Error("Usa una direccion de correo real; las direcciones .local no reciben emails.");
  }

  const testText = [
    `Hola${name ? ` ${name}` : ""}.`,
    "",
    "El correo de MD Ops está configurado correctamente.",
    "",
    `Enviado desde ${env.PUBLIC_APP_URL}`
  ].join("\n");

  await sendSmtpMail(config.transport, {
    from: config.from,
    fromName: config.fromName,
    replyTo: config.replyTo,
    to,
    subject: "Prueba de correo MD Ops",
    text: testText,
    html: testEmailHtml(name)
  });

  logSession({ type: "email_test_sent", message: "Correo de prueba enviado", data: { to } });
}

export function getEmailNotificationStatus() {
  const config = getEmailConfig();
  return {
    enabled: env.EMAIL_NOTIFICATIONS_ENABLED,
    configured: config.configured,
    missing: config.missing,
    host: env.SMTP_HOST ?? null,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    from: env.SMTP_FROM ?? null,
    fromName: env.SMTP_FROM_NAME,
    replyTo: env.SMTP_REPLY_TO ?? null
  };
}

async function sendNotificationEmails(notifications: NotificationInput[]) {
  const config = getEmailConfig();
  if (!config.configured) {
    logSession({ type: "email_skipped", message: "Correo no configurado", data: { missing: config.missing, count: notifications.length } });
    return;
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: Array.from(new Set(notifications.map((item) => item.userId))) },
      deletedAt: null,
      isActive: true
    },
    select: { id: true, email: true, notificationEmail: true, name: true }
  });
  const usersById = new Map(users.map((user) => [user.id, user]));
  const contexts = await loadNotificationContexts(notifications);

  for (const notification of notifications) {
    const user = usersById.get(notification.userId);
    if (!user) {
      logSession({
        type: "email_skipped",
        tenantId: notification.tenantId,
        actorId: notification.userId,
        message: "Destinatario no encontrado en BD",
        data: { notificationType: notification.type, email: null }
      });
      continue;
    }
    const targetEmail = (user.notificationEmail && isDeliverableEmail(user.notificationEmail)) ? user.notificationEmail : user.email;
    if (!targetEmail || !isDeliverableEmail(targetEmail)) {
      logSession({
        type: "email_skipped",
        tenantId: notification.tenantId,
        actorId: notification.userId,
        message: "Destinatario sin email real",
        data: { notificationType: notification.type, email: targetEmail ?? null }
      });
      continue;
    }

    try {
      const context = notificationContext(notification, contexts);
      await sendSmtpMail(config.transport, {
        from: config.from,
        fromName: config.fromName,
        replyTo: config.replyTo,
        to: targetEmail,
        subject: `[MD Ops] ${notification.title}`,
        text: notificationEmailText(notification, user.name, context),
        html: notificationEmailHtml(notification, user.name, context)
      });
      logSession({
        type: "email_sent",
        tenantId: notification.tenantId,
        actorId: notification.userId,
        message: notification.title,
        data: { notificationType: notification.type, to: targetEmail, entityId: notification.entityId ?? null }
      });
    } catch (error) {
      logSession({
        type: "email_error",
        tenantId: notification.tenantId,
        actorId: notification.userId,
        message: notification.title,
        data: { notificationType: notification.type, to: targetEmail, error: error instanceof Error ? error.message : String(error) }
      });
    }
  }
}

async function loadNotificationContexts(notifications: NotificationInput[]): Promise<NotificationContexts> {
  const eventIds = Array.from(new Set(notifications
    .filter((notification) => notification.entityId && !isAvailabilityNotification(notification))
    .map((notification) => notification.entityId!)));
  const availabilityIds = Array.from(new Set(notifications
    .filter((notification) => notification.entityId && isAvailabilityNotification(notification))
    .map((notification) => notification.entityId!)));

  const [events, availability] = await Promise.all([
    eventIds.length
      ? prisma.event.findMany({
        where: { id: { in: eventIds } },
        include: {
          logistics: true,
          segments: { orderBy: { startsAt: "asc" } },
          assignments: {
            orderBy: { createdAt: "asc" },
            include: {
              segment: true,
              user: { select: { name: true, email: true } }
            }
          }
        }
      })
      : Promise.resolve([]),
    availabilityIds.length
      ? prisma.availabilityRequest.findMany({
        where: { id: { in: availabilityIds } },
        include: { user: { select: { name: true, email: true } } }
      })
      : Promise.resolve([])
  ]);

  return {
    events: new Map(events.map((event) => [event.id, event])),
    availability: new Map(availability.map((item) => [item.id, item]))
  };
}

function notificationContext(notification: NotificationInput, contexts: NotificationContexts): NotificationContext {
  if (!notification.entityId) return {};
  if (isAvailabilityNotification(notification)) {
    const availability = contexts.availability.get(notification.entityId);
    return availability?.tenantId === notification.tenantId ? { availability } : {};
  }
  const event = contexts.events.get(notification.entityId);
  return event?.tenantId === notification.tenantId ? { event } : {};
}

function isAvailabilityNotification(notification: NotificationInput) {
  return notification.type === "availability_resolution";
}

function notificationEmailText(notification: NotificationInput, userName: string, context: NotificationContext = {}) {
  const lines = [
    `Hola ${userName}.`,
    "",
    notification.title,
    "",
    notification.body
  ];

  if (context.event) lines.push("", ...eventTextSummary(context.event));
  if (context.availability) lines.push("", ...availabilityTextSummary(context.availability));

  const link = notificationLink(notification);
  if (link) lines.push("", link);

  lines.push("", "MD Ops");
  return lines.join("\n");
}

function notificationLink(notification: NotificationInput) {
  const base = env.PUBLIC_APP_URL.replace(/\/+$/, "");
  if (!base) return null;
  if (!notification.entityId) return base;
  if (notification.type === "availability_resolution") return `${base}/availability`;
  return `${base}/events?event=${encodeURIComponent(notification.entityId)}`;
}

function notificationEmailHtml(notification: NotificationInput, userName: string, context: NotificationContext = {}) {
  const link = notificationLink(notification);
  const tone = toneFor(notification.type);
  const details = [
    context.event ? eventDetailsHtml(context.event) : "",
    context.availability ? availabilityDetailsHtml(context.availability) : ""
  ].filter(Boolean).join("");
  const cta = link ? `
    <a href="${escapeHtml(link)}" style="display:inline-block;background:${tone.accent};color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-weight:800;">
      ${escapeHtml(ctaLabel(notification))}
    </a>
  ` : "";

  return emailShell({
    preheader: `${notification.title}. ${notification.body}`,
    body: `
      <div style="padding:24px 24px 18px;background:${tone.soft};border:1px solid ${tone.border};border-radius:12px;">
        <div style="margin:0 0 14px;">
          <span style="display:inline-block;background:#ffffff;color:${tone.accent};border:1px solid ${tone.border};border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;">
            ${escapeHtml(typeLabel(notification.type))}
          </span>
        </div>
        <h1 style="margin:0;color:#142026;font-size:28px;line-height:1.16;letter-spacing:0;">${escapeHtml(notification.title)}</h1>
        <p style="margin:12px 0 0;color:#34434d;font-size:16px;line-height:1.55;">${escapeHtml(notification.body)}</p>
      </div>
      <div style="padding:18px 2px 0;color:#34434d;font-size:15px;line-height:1.55;">
        Hola ${escapeHtml(userName)}, tienes un nuevo aviso operativo en MD Ops.
      </div>
      ${details}
      ${cta ? `<div style="padding-top:22px;">${cta}</div>` : ""}
    `
  });
}

function testEmailHtml(name?: string | null) {
  return emailShell({
    preheader: "El correo de MD Ops está configurado correctamente.",
    body: `
      <div style="padding:24px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;">
        <span style="display:inline-block;background:#ffffff;color:#047857;border:1px solid #a7f3d0;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;">Prueba SMTP</span>
        <h1 style="margin:14px 0 0;color:#142026;font-size:28px;line-height:1.16;letter-spacing:0;">Correo configurado</h1>
        <p style="margin:12px 0 0;color:#34434d;font-size:16px;line-height:1.55;">Hola${name ? ` ${escapeHtml(name)}` : ""}. MD Ops ya puede enviar avisos con formato HTML y resumen operativo.</p>
      </div>
      <div style="padding-top:22px;">
        <a href="${escapeHtml(env.PUBLIC_APP_URL)}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;border-radius:8px;padding:12px 18px;font-weight:800;">Abrir MD Ops</a>
      </div>
    `
  });
}

function emailShell(input: { preheader: string; body: string }) {
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>MD Ops</title>
  </head>
  <body style="margin:0;background:#eef3f4;color:#142026;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(input.preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f4;margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #dce3e8;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:18px 24px;border-bottom:1px solid #dce3e8;background:#ffffff;">
                <div style="font-size:18px;font-weight:900;color:#0b5f59;">MD Ops</div>
                <div style="font-size:12px;color:#66727c;margin-top:2px;">Aviso operativo</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px;">
                ${input.body}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px;border-top:1px solid #dce3e8;background:#f8fafb;color:#66727c;font-size:12px;line-height:1.45;">
                Recibes este email porque tienes avisos activos en MD Ops. Puedes abrir la app para ver el detalle actualizado.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function eventDetailsHtml(event: EventEmailDetails) {
  const rows = detailRows([
    ["Bolo", event.title],
    ["Local", event.venueName],
    ["Ciudad", event.city],
    ["Dirección", event.venueAddress],
    ["Estado", statusLabel(event.status)],
    ["Inicio", formatDateTime(event.startsAt)],
    ["Fin", formatDateTime(event.endsAt)],
    ["Duración", durationLabel(event.startsAt, event.endsAt)]
  ]);
  const tags = event.tags.length ? `<div style="padding-top:12px;">${chips(event.tags)}</div>` : "";
  const notes = [event.visibleNotes ? ["Notas", event.visibleNotes] : null, event.gearNotes ? ["Material", event.gearNotes] : null].filter(Boolean) as Array<[string, string]>;

  return [
    card("Resumen del bolo", `${rows}${tags}`),
    segmentsHtml(event),
    logisticsHtml(event),
    assignmentsHtml(event),
    notes.length ? card("Notas visibles", detailRows(notes)) : ""
  ].filter(Boolean).join("");
}

function availabilityDetailsHtml(item: AvailabilityEmailDetails) {
  return card("Indisponibilidad", detailRows([
    ["Persona", item.user.name],
    ["Estado", availabilityStatusLabel(item.status)],
    ["Desde", formatDateTime(item.startsAt)],
    ["Hasta", formatDateTime(item.endsAt)],
    ["Duración", durationLabel(item.startsAt, item.endsAt)],
    ["Motivo", item.reason]
  ]));
}

function segmentsHtml(event: EventEmailDetails) {
  if (!event.segments.length) return "";
  const items = event.segments.map((segment) => `
    <div style="border:1px solid #dce3e8;border-radius:10px;padding:12px;margin-top:10px;background:#ffffff;">
      <div style="font-size:12px;font-weight:900;color:#0f766e;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(segmentLabel(segment.type))}</div>
      <div style="margin-top:4px;color:#142026;font-size:15px;font-weight:800;">${escapeHtml(formatDateTimeRange(segment.startsAt, segment.endsAt))}</div>
      ${segment.notes ? `<div style="margin-top:6px;color:#66727c;font-size:13px;line-height:1.45;">${escapeHtml(segment.notes)}</div>` : ""}
    </div>
  `).join("");
  return card("Horario operativo", items);
}

function logisticsHtml(event: EventEmailDetails) {
  if (!event.logistics) return "";
  const logistics = event.logistics;
  const rows = detailRows([
    ["Salida", logistics.departureAt ? formatDateTime(logistics.departureAt) : null],
    ["Llegada", logistics.arrivalAt ? formatDateTime(logistics.arrivalAt) : null],
    ["Contacto", logistics.contactName],
    ["Teléfono contacto", logistics.contactPhone],
    ["Teléfono sala", logistics.venuePhone],
    ["Presupuesto", typeof logistics.budgetCents === "number" ? formatMoney(logistics.budgetCents) : null]
  ]);
  return rows ? card("Logística", rows) : "";
}

function assignmentsHtml(event: EventEmailDetails) {
  if (!event.assignments.length) return "";
  const items = event.assignments.map((assignment) => {
    const name = assignment.user?.name ?? assignment.externalName ?? "Sin asignar";
    const parts = [
      roleLabel(assignment.role),
      assignment.segment?.type ? segmentLabel(assignment.segment.type) : null
    ].filter(Boolean);
    const timing = [assignment.departureAt ? `Salida ${formatShortDateTime(assignment.departureAt)}` : null, assignment.arrivalAt ? `Llegada ${formatShortDateTime(assignment.arrivalAt)}` : null].filter(Boolean).join(" · ");
    return `
      <div style="border:1px solid #dce3e8;border-radius:10px;padding:12px;margin-top:10px;background:#ffffff;">
        <div style="color:#142026;font-weight:900;font-size:15px;">${escapeHtml(name)}</div>
        <div style="margin-top:5px;color:#66727c;font-size:13px;line-height:1.45;">${escapeHtml(parts.join(" · "))}</div>
        ${timing ? `<div style="margin-top:5px;color:#34434d;font-size:13px;line-height:1.45;">${escapeHtml(timing)}</div>` : ""}
        ${assignment.logisticsNotes ? `<div style="margin-top:6px;color:#66727c;font-size:13px;line-height:1.45;">${escapeHtml(assignment.logisticsNotes)}</div>` : ""}
      </div>
    `;
  }).join("");
  return card("Equipo asignado", items);
}

function card(title: string, body: string) {
  if (!body.trim()) return "";
  return `
    <div style="padding-top:20px;">
      <h2 style="margin:0 0 10px;color:#142026;font-size:18px;line-height:1.25;letter-spacing:0;">${escapeHtml(title)}</h2>
      <div style="background:#f8fafb;border:1px solid #dce3e8;border-radius:12px;padding:14px;">
        ${body}
      </div>
    </div>
  `;
}

function detailRows(rows: Array<[string, string | number | null | undefined]>) {
  const filtered = rows.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
  if (!filtered.length) return "";
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      ${filtered.map(([label, value], index) => `
        <tr>
          <td style="padding:${index === 0 ? "0" : "10px"} 12px 10px 0;border-bottom:${index === filtered.length - 1 ? "0" : "1px solid #dce3e8"};color:#66727c;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;width:132px;vertical-align:top;">${escapeHtml(label)}</td>
          <td style="padding:${index === 0 ? "0" : "10px"} 0 10px;border-bottom:${index === filtered.length - 1 ? "0" : "1px solid #dce3e8"};color:#142026;font-size:14px;line-height:1.45;vertical-align:top;">${escapeHtml(String(value))}</td>
        </tr>
      `).join("")}
    </table>
  `;
}

function chips(items: string[]) {
  return items.map((item) => `<span style="display:inline-block;margin:0 6px 6px 0;border:1px solid #b8e4df;background:#ecfdf9;color:#0b5f59;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800;">${escapeHtml(item)}</span>`).join("");
}

function eventTextSummary(event: EventEmailDetails) {
  const lines = [
    `Bolo: ${event.title}`,
    `Local: ${event.venueName}`,
    `Ciudad: ${event.city}`,
    `Inicio: ${formatDateTime(event.startsAt)}`,
    `Fin: ${formatDateTime(event.endsAt)}`
  ];
  if (event.venueAddress) lines.push(`Dirección: ${event.venueAddress}`);
  if (event.logistics?.departureAt) lines.push(`Salida: ${formatDateTime(event.logistics.departureAt)}`);
  if (event.assignments.length) {
    lines.push("Equipo:");
    for (const assignment of event.assignments) {
      lines.push(`- ${assignment.user?.name ?? assignment.externalName ?? "Sin asignar"} (${roleLabel(assignment.role)})`);
    }
  }
  return lines;
}

function availabilityTextSummary(item: AvailabilityEmailDetails) {
  const lines = [
    `Persona: ${item.user.name}`,
    `Estado: ${availabilityStatusLabel(item.status)}`,
    `Desde: ${formatDateTime(item.startsAt)}`,
    `Hasta: ${formatDateTime(item.endsAt)}`
  ];
  if (item.reason) lines.push(`Motivo: ${item.reason}`);
  return lines;
}

function toneFor(type: NotificationType) {
  if (type === "conflict") return { accent: "#b54708", soft: "#fff7ed", border: "#fed7aa" };
  if (type === "cancellation") return { accent: "#b42318", soft: "#fff1f2", border: "#fecdd3" };
  if (type === "availability_resolution") return { accent: "#047857", soft: "#ecfdf5", border: "#a7f3d0" };
  if (type === "logistics_change" || type === "schedule_change") return { accent: "#2563eb", soft: "#eff6ff", border: "#bfdbfe" };
  return { accent: "#0f766e", soft: "#ecfdf9", border: "#b8e4df" };
}

function typeLabel(type: NotificationType) {
  const labels: Record<NotificationType, string> = {
    assignment: "Asignación",
    schedule_change: "Horario",
    availability_resolution: "Disponibilidad",
    conflict: "Conflicto",
    logistics_change: "Logística",
    cancellation: "Cancelación",
    comment: "Comentario"
  };
  return labels[type] ?? "Aviso";
}

function ctaLabel(notification: NotificationInput) {
  if (notification.type === "availability_resolution") return "Abrir disponibilidad";
  if (notification.type === "conflict") return "Revisar conflicto";
  if (notification.type === "cancellation") return "Ver aviso";
  return "Abrir bolo";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    confirmed: "Confirmado",
    cancelled: "Cancelado",
    completed: "Completado"
  };
  return labels[status] ?? status;
}

function availabilityStatusLabel(status: string) {
  const labels: Record<string, string> = {
    pending: "Pendiente",
    approved: "Aprobada",
    rejected: "Rechazada",
    cancelled: "Cancelada"
  };
  return labels[status] ?? status;
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    technician: "Técnico",
    assembler: "Montaje",
    driver: "Transporte",
    pickup_teardown: "Recogida/desmontaje",
    support: "Apoyo",
    lead: "Responsable"
  };
  return labels[role] ?? role;
}

function segmentLabel(type: string) {
  const labels: Record<string, string> = {
    prueba: "Prueba",
    montaje: "Montaje",
    bolo: "Bolo",
    desmontaje: "Desmontaje"
  };
  return labels[type] ?? type;
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: env.DEFAULT_TIMEZONE,
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function formatShortDateTime(value: Date) {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: env.DEFAULT_TIMEZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function formatDateTimeRange(startsAt: Date, endsAt: Date) {
  return `${formatDateTime(startsAt)} - ${formatShortDateTime(endsAt)}`;
}

function durationLabel(startsAt: Date, endsAt: Date) {
  const minutes = Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  if (!rest) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char] ?? char));
}

function getEmailConfig(): { configured: true; missing: string[]; transport: EmailConfig; from: string; fromName: string; replyTo?: string } | { configured: false; missing: string[] } {
  if (!env.EMAIL_NOTIFICATIONS_ENABLED) return { configured: false, missing: ["EMAIL_NOTIFICATIONS_ENABLED"] };

  const missing: string[] = [];
  if (!env.SMTP_HOST) missing.push("SMTP_HOST");
  if (!env.SMTP_FROM) missing.push("SMTP_FROM");
  if ((env.SMTP_USER && !(env.SMTP_PASSWORD ?? env.SMTP_PASS)) || (!env.SMTP_USER && (env.SMTP_PASSWORD ?? env.SMTP_PASS))) {
    missing.push("SMTP_USER/SMTP_PASSWORD");
  }

  if (missing.length || !env.SMTP_HOST || !env.SMTP_FROM) return { configured: false, missing };

  const password = env.SMTP_PASSWORD ?? env.SMTP_PASS;
  const transport: EmailConfig = {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: env.SMTP_USER,
    password,
    from: env.SMTP_FROM,
    fromName: env.SMTP_FROM_NAME || "MD Ops",
    replyTo: env.SMTP_REPLY_TO
  };

  return {
    configured: true,
    missing: [],
    transport,
    from: transport.from,
    fromName: transport.fromName,
    replyTo: transport.replyTo
  };
}

function isDeliverableEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const domain = normalized.split("@")[1] ?? "";
  return Boolean(normalized.includes("@") && domain && !domain.endsWith(".local") && domain !== "localhost");
}
