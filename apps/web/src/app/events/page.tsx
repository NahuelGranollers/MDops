import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { OpsAgenda } from "@/components/ops-agenda";

export default function EventsPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="agenda-page"><div className="event-row skeleton-card" /></div>}>
        <OpsAgenda />
      </Suspense>
    </AppShell>
  );
}
