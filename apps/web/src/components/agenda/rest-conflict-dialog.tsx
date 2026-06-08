"use client";

import { AlertTriangle, Clock, X } from "lucide-react";

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours <= 0) return `${rest} min`;
  if (rest === 0) return `${hours} h`;
  return `${hours} h ${rest} min`;
}

function dateTimeLabel(value: string | Date | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });
}

export function RestConflictDialog({
  open,
  title,
  description,
  conflicts,
  confirmLabel,
  loading = false,
  onConfirm,
  onClose
}: {
  open: boolean;
  title: string;
  description: string;
  conflicts: any[];
  confirmLabel?: string;
  loading?: boolean;
  onConfirm?: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="sheet-backdrop dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="rest-conflict-title" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) onClose();
    }}>
      <section className="dialog-card rest-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <span className="eyebrow">Descanso mínimo</span>
            <h2 id="rest-conflict-title">{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={loading} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <p className="dialog-copy">{description}</p>
        <div className="rest-conflict-list">
          {conflicts.map((conflict, index) => (
            <article className="rest-conflict-item" key={`${conflict.userId}-${conflict.eventAId}-${conflict.eventBId}-${index}`}>
              <div className="rest-conflict-icon"><AlertTriangle size={18} /></div>
              <div>
                <strong>{conflict.userName ?? "Persona asignada"}</strong>
                <p>{conflict.eventATitle} - {conflict.eventBTitle}</p>
                <span><Clock size={14} /> Descanso real: {minutesLabel(Number(conflict.restMinutes ?? 0))} de {minutesLabel(Number(conflict.requiredMinutes ?? 600))}</span>
                <small>{dateTimeLabel(conflict.eventAEndsAt)} - {dateTimeLabel(conflict.eventBStartsAt)}</small>
              </div>
            </article>
          ))}
        </div>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={loading}>{onConfirm ? "Volver a revisar" : "Entendido"}</button>
          {onConfirm && (
            <button type="button" className="button warning-action" onClick={onConfirm} disabled={loading}>
              {loading ? <><span className="spinner" />Guardando</> : confirmLabel ?? "Guardar igualmente"}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
