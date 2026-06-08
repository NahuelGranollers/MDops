"use client";

import { useState } from "react";
import { Clock } from "lucide-react";

export function TimePicker({ value, onChange, label, up }: { value: string; onChange: (val: string) => void; label?: string; up?: boolean }) {
  const [open, setOpen] = useState(false);
  const [hours = "00", minutes = "00"] = value.split(":");
  
  const hourOptions = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
  const minuteOptions = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

  return (
    <div className={`time-picker-root ${up ? "up" : ""}`}>
      {label && <span className="field-label">{label}</span>}
      <button type="button" className="input time-display-btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Clock size={16} className="muted" />
        <span>{value}</span>
      </button>
      
      {open && (
        <>
          <div className="time-picker-overlay" onClick={() => setOpen(false)} />
          <div className="time-picker-dropdown">
            <div className="time-column scrollbar-hide">
              {hourOptions.map((h) => (
                <button
                  key={h}
                  type="button"
                  className={`time-option ${h === hours ? "selected" : ""}`}
                  onClick={() => {
                    onChange(`${h}:${minutes}`);
                  }}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="time-column scrollbar-hide">
              {minuteOptions.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`time-option ${m === minutes ? "selected" : ""}`}
                  onClick={() => {
                    onChange(`${hours}:${m}`);
                    setOpen(false);
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
