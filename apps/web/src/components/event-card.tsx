import { Calendar, MapPin, Users } from "lucide-react";

export function EventCard({ event, admin = false }: { event: any; admin?: boolean }) {
  const starts = new Date(event.startsAt);
  const ends = new Date(event.endsAt);
  return (
    <article className="card event-item">
      <div className="between">
        <div>
          <strong>{event.title}</strong>
          <div className="muted">{event.city} · {event.venueName}</div>
        </div>
        <span className={`badge ${event.status}`}>{event.status}</span>
      </div>
      <div className="row muted">
        <span className="row"><Calendar size={16} />{starts.toLocaleDateString("es-ES")} {starts.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}-{ends.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}</span>
        {event.venueAddress && <a className="row" target="_blank" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.venueAddress)}`}><MapPin size={16} />Abrir mapa</a>}
      </div>
      {event.visibleNotes && <p>{event.visibleNotes}</p>}
      <div className="row">
        {event.assignments?.map((assignment: any) => (
          <span key={assignment.id} className="badge"><Users size={12} /> {admin ? assignment.user?.name : assignment.role} · {assignment.confirmationStatus}</span>
        ))}
      </div>
    </article>
  );
}
