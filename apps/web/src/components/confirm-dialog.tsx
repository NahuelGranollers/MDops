"use client";

import { X } from "lucide-react";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Volver",
  loading = false,
  destructive = false,
  onConfirm,
  onClose
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="sheet-backdrop dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !loading) onClose();
    }}>
      <section className="dialog-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="sheet-head">
          <div>
            <span className="eyebrow">Confirmación</span>
            <h2 id="confirm-title">{title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={loading} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <p className="dialog-copy">{description}</p>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={loading}>{cancelLabel}</button>
          <button type="button" className={`button ${destructive ? "danger" : ""}`} onClick={onConfirm} disabled={loading}>
            {loading ? <><span className="spinner" />Procesando</> : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
