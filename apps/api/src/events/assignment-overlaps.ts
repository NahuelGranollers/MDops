export type AssignmentOverlapWindow = {
  userId: string;
  segmentType?: string | null;
  startsAt: Date;
  endsAt: Date;
};

export function windowsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
  return aStart < bEnd && bStart < aEnd;
}

export function allowsSameEventAssignmentOverlap(left: AssignmentOverlapWindow, right: AssignmentOverlapWindow) {
  return left.userId === right.userId && windowsOverlap(left.startsAt, left.endsAt, right.startsAt, right.endsAt);
}
