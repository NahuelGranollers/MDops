export type AssignmentWindow = {
  eventId: string;
  title: string;
  userId: string;
  userName?: string | null;
  startsAt: Date;
  endsAt: Date;
};

export type RestConflict = {
  userId: string;
  eventAId: string;
  eventBId: string;
  eventATitle: string;
  eventBTitle: string;
  userName?: string | null;
  eventAStartsAt: Date;
  eventAEndsAt: Date;
  eventBStartsAt: Date;
  eventBEndsAt: Date;
  restMinutes: number;
  requiredMinutes: number;
};

export function detectRestConflicts(windows: AssignmentWindow[], minRestHours: number): RestConflict[] {
  const requiredMinutes = minRestHours * 60;
  const byUser = new Map<string, AssignmentWindow[]>();
  for (const window of windows) {
    const list = byUser.get(window.userId) ?? [];
    list.push(window);
    byUser.set(window.userId, list);
  }
  const conflicts: RestConflict[] = [];
  for (const [userId, list] of byUser.entries()) {
    const sorted = list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    for (let index = 0; index < sorted.length - 1; index += 1) {
      const current = sorted[index]!;
      const next = sorted[index + 1]!;
      if (current.eventId === next.eventId) continue;
      const restMinutes = Math.floor((next.startsAt.getTime() - current.endsAt.getTime()) / 60000);
      if (restMinutes >= 0 && restMinutes < requiredMinutes) {
        conflicts.push({
          userId,
          eventAId: current.eventId,
          eventBId: next.eventId,
          eventATitle: current.title,
          eventBTitle: next.title,
          userName: current.userName ?? next.userName,
          eventAStartsAt: current.startsAt,
          eventAEndsAt: current.endsAt,
          eventBStartsAt: next.startsAt,
          eventBEndsAt: next.endsAt,
          restMinutes,
          requiredMinutes
        });
      }
    }
  }
  return conflicts;
}
