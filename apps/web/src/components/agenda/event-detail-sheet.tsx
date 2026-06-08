"use client";

import { Clock, Copy, FileText, MapPin, Truck, Upload, UserRound, X } from "lucide-react";
import { useState } from "react";
import { api, assetUrl } from "@/lib/api";
import { calculateOvertime } from "@/lib/overtime";
import { StatusBadge } from "@/components/status-badge";
import { UserAvatar } from "@/components/user-avatar";
import { assignmentNames, dateLabel, roleLabels, segmentClassName, segmentLabels, segmentTypes, sortSegmentsByOpsOrder, timeLabel, type SegmentType } from "@/components/agenda/agenda-utils";

export function EventDetailSheet({
  event,
  onClose,
  onEdit,
  onDuplicate,
  onCancel,
  onUploaded,
  isAdmin
}: {
  event: any;
  onClose: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onCancel: () => void;
  onUploaded: () => void;
  isAdmin: boolean;
}) {
  const [attachments, setAttachments] = useState<any[]>(event.attachments ?? []);
  const [uploading, setUploading] = useState(false);

  async function uploadPdf(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const attachment = await api<any>(`/events/${event.id}/attachments?kind=albaran`, { method: "POST", body: formData });
      setAttachments((current) => [...current, attachment]);
      onUploaded();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true">
      <aside className="sheet detail-sheet">
        <div className="sheet-head">
          <div><StatusBadge value={event.status} /><h2>{event.venueName || event.title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <section className="detail-summary">
          <div><Clock size={17} /><span>{dateLabel(event.startsAt)} - {timeLabel(event.startsAt)}-{timeLabel(event.endsAt)}</span></div>
          <div><MapPin size={17} /><span>{event.city}{event.venueAddress ? ` - ${event.venueAddress}` : ""}</span></div>
          <div><UserRound size={17} /><span>{assignmentNames(event) || "Sin asignar"}</span></div>
        </section>

        {isAdmin && (
          <div className="detail-actions">
            <button className="button" onClick={onEdit}>Editar bolo</button>
            <button className="button secondary" onClick={onDuplicate}><Copy size={16} />Duplicar</button>
            <button className="button subtle-danger" onClick={onCancel}>Cancelar bolo</button>
          </div>
        )}

        <details className="advanced-block" open>
          <summary>Horarios</summary>
          <div className="detail-list">
            {sortSegmentsByOpsOrder(event.segments?.length ? event.segments : [{ id: "main", type: "bolo", startsAt: event.startsAt, endsAt: event.endsAt }]).map((segment: any) => (
              <div className={`detail-line ${segmentClassName(segment.type)}`} key={segment.id ?? segment.type}>
                <strong>{segmentLabels[segment.type as keyof typeof segmentLabels] ?? segment.type}</strong>
                <span>{dateLabel(segment.startsAt)} - {timeLabel(segment.startsAt)}-{timeLabel(segment.endsAt)}</span>
                {segment.notes && <span className="muted">{segment.notes}</span>}
              </div>
            ))}
          </div>
        </details>

        <details className="advanced-block" open>
          <summary>Notas y logística</summary>
          <div className="detail-notes">
            {event.gearNotes && <p><strong>Qué hay que llevar:</strong> {event.gearNotes}</p>}
            {event.hotelName && <p><strong>Hotel:</strong> {event.hotelName}</p>}
            {event.visibleNotes && <p><strong>Notas:</strong> {event.visibleNotes}</p>}
            {event.internalNotes && isAdmin && <p><strong>Interno:</strong> {event.internalNotes}</p>}
            {!event.gearNotes && !event.hotelName && !event.visibleNotes && !event.internalNotes && <p className="muted">Sin detalles adicionales.</p>}
          </div>
        </details>

        <details className="advanced-block" open>
          <summary>PDFs</summary>
          <div className="attachment-list">
            {isAdmin && (
              <label className={`button secondary upload-button ${uploading ? "disabled" : ""}`}>
                <Upload size={16} />{uploading ? "Subiendo" : "Subir albarán PDF"}
                <input type="file" accept="application/pdf" hidden disabled={uploading} onChange={(event) => uploadPdf(event.target.files?.[0] ?? null)} />
              </label>
            )}
            {attachments.map((attachment) => (
              <a className="attachment-link" href={assetUrl(attachment.storagePath) ?? "#"} target="_blank" rel="noreferrer" key={attachment.id}>
                <FileText size={16} />
                <span>{attachment.filename}</span>
              </a>
            ))}
            {attachments.length === 0 && <p className="muted">Sin PDFs adjuntos.</p>}
          </div>
        </details>

        <details className="advanced-block">
          <summary>Equipo</summary>
          <div className="list compact-list">
            {[...(event.assignments ?? [])].sort((a: any, b: any) => {
              const aSegment = (a.segment?.type ?? "bolo") as SegmentType;
              const bSegment = (b.segment?.type ?? "bolo") as SegmentType;
              return segmentTypes.indexOf(aSegment) - segmentTypes.indexOf(bSegment);
            }).map((assignment: any) => {
              const showDate = assignment.departureAt && new Date(assignment.departureAt).toDateString() !== new Date(event.startsAt).toDateString();
              const segmentType = assignment.segment?.type ?? "bolo";
              return (
                <div key={assignment.id} className={`assignment-line personal-line ${segmentClassName(segmentType)}`}>
                  <span className="assigned-person-name"><UserAvatar user={assignment.user ?? { name: assignment.externalName ?? "Freelance" }} size="sm" />{assignment.user?.name ?? assignment.externalName ?? "Freelance"}</span>
                  <span className={`badge phase-badge ${segmentClassName(segmentType)}`}>{segmentLabels[segmentType as keyof typeof segmentLabels] ?? segmentType}</span>
                  <span className="badge">{roleLabels[assignment.role] ?? assignment.role}</span>
                  <span className="muted">
                    {!assignment.userId && assignment.externalPhone ? `${assignment.externalPhone}` : ""}
                    {assignment.departureAt ? ` - ${showDate ? dateLabel(assignment.departureAt) : ""} ${timeLabel(assignment.departureAt)}` : ""}
                    {assignment.departureAt && assignment.arrivalAt && (() => {
                      const stats = calculateOvertime(new Date(assignment.departureAt), new Date(assignment.arrivalAt));
                      return <span className="overtime-pill">({stats.totalHours}h)</span>;
                    })()}
                  </span>
                </div>
              );
            })}
          </div>
        </details>
      </aside>
    </div>
  );
}
