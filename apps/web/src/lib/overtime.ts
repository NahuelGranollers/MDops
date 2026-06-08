const HOLIDAYS_2026 = [
  "2026-01-01", // Año Nuevo
  "2026-01-06", // Reyes
  "2026-04-03", // Viernes Santo
  "2026-04-06", // Lunes de Pascua
  "2026-05-01", // Fiesta del Trabajo
  "2026-05-25", // Lunes de Pascua Granada
  "2026-06-24", // San Juan
  "2026-08-15", // Asunción
  "2026-09-11", // Diada
  "2026-09-24", // La Mercè (Barcelona)
  "2026-10-12", // Fiesta Nacional
  "2026-11-01", // Todos los Santos
  "2026-12-06", // Constitución
  "2026-12-08", // Inmaculada
  "2026-12-25", // Navidad
  "2026-12-26", // San Esteban
];

export function isHoliday(date: Date) {
  const day = date.getDay();
  if (day === 0 || day === 6) return true; // Fin de semana
  const iso = date.toISOString().slice(0, 10);
  return HOLIDAYS_2026.includes(iso);
}

export type OvertimeResult = {
  totalHours: number;
  standardHours: number;
  extraHours: number; // Regular overtime
  nocturnalHours: number; // Hours between 22-07
  holidayHours: number; // All hours on holidays/weekends
  equivalentHours: number; // Total weighted hours (1.5x for extra/nocturnal/holiday)
  hasAlert: boolean;
};

export function calculateOvertime(startsAt: Date, endsAt: Date): OvertimeResult {
  let standardMinutes = 0;
  let extraMinutes = 0;
  let nocturnalMinutes = 0;
  let holidayMinutes = 0;
  let equivalentMinutes = 0;

  const current = new Date(startsAt);
  const step = 1; // 1 minute precision

  while (current < endsAt) {
    const hour = current.getHours();
    const holiday = isHoliday(current);
    
    if (holiday) {
      holidayMinutes += step;
      equivalentMinutes += step * 1.5;
    } else {
      const isWorkHours = hour >= 9 && hour < 18;
      const isLunchBreak = hour === 14;

      if (isWorkHours && !isLunchBreak) {
        standardMinutes += step;
        equivalentMinutes += step;
      } else {
        const isNocturnal = hour >= 22 || hour < 7;
        if (isNocturnal) {
          nocturnalMinutes += step;
        } else {
          extraMinutes += step;
        }
        equivalentMinutes += step * 1.5;
      }
    }

    current.setMinutes(current.getMinutes() + step);
  }

  const totalMinutes = (endsAt.getTime() - startsAt.getTime()) / (1000 * 60);

  return {
    totalHours: Number((totalMinutes / 60).toFixed(2)),
    standardHours: Number((standardMinutes / 60).toFixed(2)),
    extraHours: Number((extraMinutes / 60).toFixed(2)),
    nocturnalHours: Number((nocturnalMinutes / 60).toFixed(2)),
    holidayHours: Number((holidayMinutes / 60).toFixed(2)),
    equivalentHours: Number((equivalentMinutes / 60).toFixed(2)),
    hasAlert: extraMinutes > 0 || nocturnalMinutes > 0 || holidayMinutes > 0
  };
}
