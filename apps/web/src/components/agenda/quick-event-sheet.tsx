"use client";

import { Check, ChevronLeft, ChevronRight, MoreHorizontal, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "@/lib/i18n/context";
import { TimePicker } from "@/components/ui";
import { calculateOvertime } from "@/lib/overtime";
import { BrowserAPI } from "@/lib/browser-api";
import { UserAvatar } from "@/components/user-avatar";
import {
  activeSegment,
  enabledSegments,
  makeWindow,
  roles,
  segmentClassName,
  segmentLabels,
  segmentTypes,
  smartSegmentsForBolo,
  sortSegmentsByOpsOrder,
  type AssignmentDraft,
  type QuickDraft,
  type ScheduleSegmentDraft,
  type SegmentType
} from "@/components/agenda/agenda-utils";

type PeopleSignal = { userId: string; unavailable: boolean; restConflict: boolean; assignmentConflict?: boolean };
type FreelanceContact = { id: string; name: string; phone?: string | null };
type Step = "horarios" | "equipo" | "detalles";

function usePresets() {
  const { t } = useTranslation();
  return [
    { label: t("quickEvent.presetSolo"), types: ["bolo" as SegmentType] },
    { label: t("quickEvent.presetBoloMontaje"), types: ["bolo" as SegmentType, "montaje" as SegmentType] },
    { label: t("quickEvent.presetBoloDesmontaje"), types: ["bolo" as SegmentType, "desmontaje" as SegmentType] },
    { label: t("quickEvent.presetFull"), types: ["bolo" as SegmentType, "montaje" as SegmentType, "prueba" as SegmentType, "desmontaje" as SegmentType] }
  ];
}

type QuickCreateSheetProps = {
  title: string;
  draft: QuickDraft;
  setDraft: React.Dispatch<React.SetStateAction<QuickDraft>>;
  users: any[];
  freelancers: FreelanceContact[];
  signals: PeopleSignal[];
  minRestHours: number;
  onClose: () => void;
  onDiscard: () => void;
  onSubmit: (event: React.FormEvent) => void;
  updateAssignment: (userId: string) => void;
  addSegmentAssignment: (userId: string, segmentType: SegmentType) => void;
  addFreelanceAssignment: (name: string, phone: string, saveFreelance?: boolean) => void;
  removeAssignment: (id: string) => void;
  patchAssignment: (id: string, update: Partial<AssignmentDraft>) => void;
  saving: boolean;
  conflicts: any[];
};

export function QuickCreateSheet(props: QuickCreateSheetProps) {
  const {
    title,
    draft,
    setDraft,
    users,
    freelancers,
    signals,
    minRestHours,
    onClose,
    onDiscard,
    onSubmit,
    updateAssignment,
    addSegmentAssignment,
    removeAssignment,
    patchAssignment,
    saving,
    conflicts
  } = props;
  const { t } = useTranslation();
  const schedulePresets = usePresets();
  const [step, setStep] = useState<Step>("horarios");
  const enabled = enabledSegments(draft);
  const active = activeSegment(draft);
  const activeType = active?.type ?? "bolo";
  const canContinueSchedule = Boolean(draft.venueName.trim() && enabled.length > 0);
  const coreTeamCount = draft.assignments.filter((assignment) => (assignment.segmentType ?? "bolo") === "bolo").length;
  const canSave = Boolean(draft.venueName.trim() && enabled.length > 0 && coreTeamCount > 0);
  const restWarningCount = new Set(draft.assignments
    .filter((assignment) => assignment.userId && signals.find((signal) => signal.userId === assignment.userId)?.restConflict)
    .map((assignment) => assignment.userId)
  ).size;

  function patch(update: Partial<QuickDraft>) {
    setDraft((current) => ({
      ...current,
      ...update
    }));
  }

  function patchSegment(type: SegmentType, update: Partial<ScheduleSegmentDraft>) {
    setDraft((current) => {
      const previousBolo = current.segments.find((segment) => segment.type === "bolo") ?? current.segments[0]!;
      const previousSmart = smartSegmentsForBolo(previousBolo);
      const followedTypes = new Set<SegmentType>();
      const segments = current.segments.map((segment) => {
        if (segment.type !== type) return segment;
        const next = { ...segment, ...update };
        if (type === "bolo") next.enabled = true;
        return next;
      });
      const syncedSegments = type === "bolo" ? syncSmartSegments(current.segments, segments, previousSmart, followedTypes) : segments;
      const changed = segments.find((segment) => segment.type === type)!;
      return {
        ...current,
        date: type === "bolo" ? changed.date : current.date,
        start: type === "bolo" ? changed.start : current.start,
        end: type === "bolo" ? changed.end : current.end,
        activeSegmentType: changed.enabled ? type : "bolo",
        segments: syncedSegments,
        assignments: current.assignments.map((assignment) => {
          const assignmentType = (assignment.segmentType ?? "bolo") as SegmentType;
          if (assignmentType !== type && !followedTypes.has(assignmentType)) return assignment;
          const assignmentSegment = syncedSegments.find((segment) => segment.type === assignmentType) ?? changed;
          return { ...assignment, date: assignmentSegment.date, departure: assignmentSegment.start, arrival: assignmentSegment.end };
        })
      };
    });
  }

  function applySchedulePreset(types: SegmentType[]) {
    const enabledTypes = new Set<SegmentType>(types);
    setDraft((current) => {
      const bolo = current.segments.find((segment) => segment.type === "bolo") ?? current.segments[0]!;
      const smartSegments = smartSegmentsForBolo(bolo);
      return {
        ...current,
        activeSegmentType: enabledTypes.has(current.activeSegmentType) ? current.activeSegmentType : "bolo",
        segments: current.segments.map((segment) => {
          const smartSegment = smartSegments.find((item) => item.type === segment.type);
          const enabled = segment.type === "bolo" || enabledTypes.has(segment.type);
          if (segment.type === "bolo" || (segment.enabled && enabled)) return { ...segment, enabled };
          return {
            ...(smartSegment ?? segment),
            enabled,
            notes: segment.notes
          };
        }),
        assignments: current.assignments.filter((assignment) => enabledTypes.has((assignment.segmentType ?? "bolo") as SegmentType))
      };
    });
  }

  function setActiveSegmentType(type: SegmentType) {
    setDraft((current) => ({ ...current, activeSegmentType: type }));
  }

  function patchAssignmentSegment(id: string, type: SegmentType) {
    const segment = draft.segments.find((item) => item.type === type);
    patchAssignment(id, {
      segmentType: type,
      date: segment?.date ?? draft.date,
      departure: segment?.start ?? draft.start,
      arrival: segment?.end ?? draft.end
    });
  }

  const stepIndex = step === "horarios" ? 0 : step === "equipo" ? 1 : 2;

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <form className="sheet quick-sheet" onSubmit={onSubmit}>
        <div className="sheet-head">
          <div><span className="eyebrow">{t("quickEvent.quickCreate")}</span><h2>{title}</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={t("common.close")}><X size={18} /></button>
        </div>

        <div className="quick-steps" aria-label={t("quickEvent.stepSchedule")}>
          {([t("quickEvent.stepSchedule"), t("quickEvent.stepTeam"), t("quickEvent.stepDetails")] as const).map((label, index) => (
            <button key={label} type="button" className={stepIndex === index ? "active" : ""} onClick={() => setStep(index === 0 ? "horarios" : index === 1 ? "equipo" : "detalles")}>
              <span>{index + 1}</span>{label}
            </button>
          ))}
        </div>

        <div className="sheet-body scrollbar-hide">
          {step === "horarios" && (
            <div className="step-panel">
              <label className="field">{t("quickEvent.venue")}<input className="input large-input" value={draft.venueName} onChange={(event) => patch({ venueName: event.target.value, venueAddress: event.target.value ? `${event.target.value}, ${draft.city}` : "" })} placeholder={t("quickEvent.venuePlaceholder")} required /></label>
              <div className="quick-grid two">
                <label className="field">{t("quickEvent.city")}<input className="input" value={draft.city} onChange={(event) => patch({ city: event.target.value })} required /></label>
                <label className="field">{t("quickEvent.address")}<input className="input" value={draft.venueAddress} onChange={(event) => patch({ venueAddress: event.target.value })} placeholder={t("quickEvent.addressPlaceholder")} /></label>
              </div>
              <ScheduleEditor draft={draft} activeType={activeType} patchSegment={patchSegment} setActiveSegmentType={setActiveSegmentType} applySchedulePreset={applySchedulePreset} />
            </div>
          )}

          {step === "equipo" && (
            <div className="step-panel">
              <section className="segment-picker">
                <div className="between"><strong>{t("quickEvent.activeSegment")}</strong><span className="muted">{enabled.length} {t("quickEvent.slots")}</span></div>
                <div className="segmented wrap">
                  {sortSegmentsByOpsOrder(enabled).map((segment) => (
                    <button key={segment.type} type="button" className={`${activeType === segment.type ? "active" : ""} ${segmentClassName(segment.type)}`} onClick={() => setActiveSegmentType(segment.type)}>
                      {segmentLabels[segment.type]}
                    </button>
                  ))}
                </div>
              </section>
              <AssignmentCoverage assignments={draft.assignments} segments={draft.segments} />
              <PeoplePicker
                users={users}
                freelancers={freelancers}
                assignments={draft.assignments}
                activeSegmentType={activeType}
                signals={signals}
                minRestHours={minRestHours}
                onToggle={updateAssignment}
                onAddFreelance={props.addFreelanceAssignment}
              />
              {restWarningCount > 0 && (
                <div className="conflict-box rest-inline-warning">
                  {t("quickEvent.restWarning", { count: restWarningCount, hours: minRestHours })}
                </div>
              )}
              {draft.assignments.length > 0 && (
                <AssignmentLogisticsList
                  assignments={draft.assignments}
                  users={users}
                  signals={signals}
                  minRestHours={minRestHours}
                  segments={draft.segments}
                  addSegmentAssignment={addSegmentAssignment}
                  removeAssignment={removeAssignment}
                  patchAssignment={patchAssignment}
                  patchAssignmentSegment={patchAssignmentSegment}
                />
              )}
            </div>
          )}

          {step === "detalles" && (
            <div className="step-panel">

              <details className="advanced-block" open>
                <summary><MoreHorizontal size={17} />{t("quickEvent.eventDetails")}</summary>
                <div className="grid">
                  <label className="field">{t("quickEvent.gearNotes")}<textarea className="textarea" value={draft.gearNotes} onChange={(event) => patch({ gearNotes: event.target.value })} placeholder={t("quickEvent.gearPlaceholder")} /></label>
                  <label className="field">{t("quickEvent.hotel")}<input className="input" value={draft.hotelName} onChange={(event) => patch({ hotelName: event.target.value })} /></label>
                  <label className="field">{t("quickEvent.visibleNotes")}<textarea className="textarea" value={draft.visibleNotes} onChange={(event) => patch({ visibleNotes: event.target.value })} /></label>
                  <label className="field">{t("quickEvent.internalNotes")}<textarea className="textarea" value={draft.internalNotes} onChange={(event) => patch({ internalNotes: event.target.value })} /></label>
                  <label className="field">{t("quickEvent.tags")}<input className="input" value={draft.tags} onChange={(event) => patch({ tags: event.target.value })} placeholder={t("quickEvent.tagsPlaceholder")} /></label>
                </div>
              </details>
            </div>
          )}

          {conflicts.length > 0 && <div className="conflict-box">{t("quickEvent.conflictWarning", { count: conflicts.length })}</div>}
        </div>

        <div className="sheet-actions">
          <button type="button" className="button secondary" onClick={step === "horarios" ? onDiscard : () => setStep(step === "detalles" ? "equipo" : "horarios")}>
            {step === "horarios" ? t("quickEvent.cancel") : <><ChevronLeft size={16} />{t("quickEvent.back")}</>}
          </button>
          {step === "horarios" && <button type="button" className="button" disabled={!canContinueSchedule} onClick={() => setStep("equipo")}>{t("quickEvent.team")}<ChevronRight size={16} /></button>}
          {step === "equipo" && <button type="button" className="button secondary" disabled={draft.assignments.length === 0} onClick={() => setStep("detalles")}>{t("quickEvent.detailsOptional")}<ChevronRight size={16} /></button>}
          {step === "equipo" && <button className="button" disabled={saving || !canSave}>{saving ? <><span className="spinner" />{t("quickEvent.saving")}</> : t("quickEvent.saveEvent")}</button>}
          {step === "detalles" && <button className="button" disabled={saving || !canSave}>{saving ? <><span className="spinner" />{t("quickEvent.saving")}</> : t("quickEvent.saveEvent")}</button>}
        </div>
      </form>
    </div>
  );
}

function sameSegmentTiming(left: ScheduleSegmentDraft | undefined, right: ScheduleSegmentDraft | undefined) {
  if (!left || !right) return false;
  return left.date === right.date && left.start === right.start && left.end === right.end;
}

function syncSmartSegments(
  previousSegments: ScheduleSegmentDraft[],
  nextSegments: ScheduleSegmentDraft[],
  previousSmart: ScheduleSegmentDraft[],
  followedTypes: Set<SegmentType>
) {
  const nextBolo = nextSegments.find((segment) => segment.type === "bolo") ?? nextSegments[0]!;
  const nextSmart = smartSegmentsForBolo(nextBolo);

  return nextSegments.map((segment) => {
    if (segment.type === "bolo") return segment;

    const previous = previousSegments.find((item) => item.type === segment.type);
    const previousSmartSegment = previousSmart.find((item) => item.type === segment.type);
    const nextSmartSegment = nextSmart.find((item) => item.type === segment.type);
    const shouldFollowBolo = !previous?.enabled || sameSegmentTiming(previous, previousSmartSegment);

    if (!shouldFollowBolo || !nextSmartSegment) return segment;
    followedTypes.add(segment.type);
    return {
      ...nextSmartSegment,
      enabled: segment.enabled,
      notes: segment.notes
    };
  });
}

function ScheduleEditor({
  draft,
  activeType,
  patchSegment,
  setActiveSegmentType,
  applySchedulePreset
}: {
  draft: QuickDraft;
  activeType: SegmentType;
  patchSegment: (type: SegmentType, update: Partial<ScheduleSegmentDraft>) => void;
  setActiveSegmentType: (type: SegmentType) => void;
  applySchedulePreset: (types: SegmentType[]) => void;
}) {
  const { t } = useTranslation();
  const schedulePresets = usePresets();
  const enabledTypes = new Set(draft.segments.filter((segment) => segment.enabled).map((segment) => segment.type));

  return (
    <section className="schedule-editor">
      <div className="preset-strip" aria-label={t("quickEvent.schedulePresets")}>
        {schedulePresets.map((preset) => {
          const active = preset.types.length === enabledTypes.size && preset.types.every((type) => enabledTypes.has(type));
          return (
            <button key={preset.label} type="button" className={active ? "active" : ""} onClick={() => applySchedulePreset(preset.types)}>
              {preset.label}
            </button>
          );
        })}
      </div>
      {segmentTypes.map((type) => {
        const segment = draft.segments.find((item) => item.type === type)!;
        return (
          <article className={`schedule-row ${segmentClassName(type)} ${segment.enabled ? "enabled" : ""} ${activeType === type ? "active" : ""}`} key={type}>
            <label className="segment-enable">
              <input
                type="checkbox"
                checked={segment.enabled}
                disabled={type === "bolo"}
                onChange={(event) => patchSegment(type, { enabled: event.target.checked })}
              />
              <span>{segmentLabels[type]}</span>
            </label>
            <div className="quick-grid three">
              <label className="field">{t("quickEvent.segmentDay")}<input className="input picker-input" type="date" value={segment.date} onClick={(e) => (e.currentTarget as any).showPicker?.()} onChange={(event) => patchSegment(type, { date: event.target.value, enabled: true })} /></label>
              <TimePicker label={t("quickEvent.segmentStart")} value={segment.start} onChange={(value) => patchSegment(type, { start: value, enabled: true })} />
              <TimePicker label={t("quickEvent.segmentEnd")} value={segment.end} onChange={(value) => patchSegment(type, { end: value, enabled: true })} />
            </div>
            {segment.enabled && (
              <div className="schedule-row-footer">
                <input className="input" value={segment.notes} onChange={(event) => patchSegment(type, { notes: event.target.value })} placeholder={t("quickEvent.segmentNote")} />
                <button type="button" className="button secondary" onClick={() => setActiveSegmentType(type)}>{t("quickEvent.assignTeam")}</button>
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

function AssignmentCoverage({ assignments, segments }: { assignments: AssignmentDraft[]; segments: ScheduleSegmentDraft[] }) {
  const { t } = useTranslation();
  const enabled = sortSegmentsByOpsOrder(segments.filter((segment) => segment.enabled));

  return (
    <section className="phase-coverage" aria-label={t("quickEvent.coverageLabel")}>
      {enabled.map((segment) => {
        const count = assignments.filter((assignment) => (assignment.segmentType ?? "bolo") === segment.type).length;
        return (
          <span key={segment.type} className={`phase-coverage-chip ${segmentClassName(segment.type)} ${count > 0 ? "covered" : ""}`}>
            {segmentLabels[segment.type]} <strong>{count}</strong>
          </span>
        );
      })}
    </section>
  );
}

function PeoplePicker({
  users,
  freelancers,
  assignments,
  activeSegmentType,
  signals,
  minRestHours,
  onToggle,
  onAddFreelance
}: {
  users: any[];
  freelancers: FreelanceContact[];
  assignments: AssignmentDraft[];
  activeSegmentType: SegmentType;
  signals: PeopleSignal[];
  minRestHours: number;
  onToggle: (userId: string) => void;
  onAddFreelance: (name: string, phone: string, saveFreelance?: boolean) => void;
}) {
  const { t } = useTranslation();
  const [freelanceName, setFreelanceName] = useState("");
  const [freelancePhone, setFreelancePhone] = useState("");
  const activeAssignments = useMemo(
    () => assignments.filter((item) => (item.segmentType ?? "bolo") === activeSegmentType),
    [activeSegmentType, assignments]
  );

  function submitFreelance() {
    if (!freelanceName.trim()) return;
    const saveRecurring = BrowserAPI.confirm(t("quickEvent.saveFreelancePrompt"));
    onAddFreelance(freelanceName, freelancePhone, saveRecurring);
    setFreelanceName("");
    setFreelancePhone("");
  }

  return (
    <section className="people-picker">
      <div className="between"><strong>{activeSegmentType === "bolo" ? t("quickEvent.mainTeam") : t("quickEvent.teamFor", { segment: segmentLabels[activeSegmentType] })}</strong><span className="muted">{activeAssignments.length}</span></div>
      <div className="people-grid">
        {users.map((user) => {
          const selected = activeAssignments.some((item) => item.userId === user.id);
          const signal = signals.find((item) => item.userId === user.id);
          const blocked = Boolean(signal?.assignmentConflict && !selected);
          return (
            <div key={user.id} className={`person-chip ${selected ? "selected" : ""} ${blocked ? "blocked" : ""}`}>
              <button type="button" onClick={() => onToggle(user.id)} disabled={blocked}>
                <span className="person-chip-name"><UserAvatar user={user} size="sm" />{user.name}</span>
                <span className="person-chip-right">
                  {signal?.unavailable && <span className="mini-dot danger" title={t("quickEvent.notAvailable")} />}
                  {signal?.assignmentConflict && <span className="mini-dot danger" title={t("quickEvent.busy")} />}
                  {signal?.restConflict && <span className="mini-dot warning" title={t("quickEvent.restLess", { hours: minRestHours })} />}
                  {selected && <Check size={15} />}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      {freelancers.length > 0 && (
        <div className="freelance-saved-list">
          {freelancers.map((freelance) => (
            <button key={freelance.id} type="button" className="badge" onClick={() => onAddFreelance(freelance.name, freelance.phone ?? "", false)}>
              {freelance.name}
            </button>
          ))}
        </div>
      )}
      <div className="freelance-row">
        <input className="input" value={freelanceName} onChange={(event) => setFreelanceName(event.target.value)} placeholder={t("quickEvent.freelance")} />
        <input className="input" value={freelancePhone} onChange={(event) => setFreelancePhone(event.target.value)} placeholder={t("quickEvent.contact")} />
        <button className="button secondary" type="button" onClick={submitFreelance} disabled={!freelanceName.trim()}><Plus size={15} />{t("quickEvent.add")}</button>
      </div>
    </section>
  );
}

function AssignmentLogisticsList({
  assignments,
  users,
  signals,
  minRestHours,
  segments,
  addSegmentAssignment,
  removeAssignment,
  patchAssignment,
  patchAssignmentSegment
}: {
  assignments: AssignmentDraft[];
  users: any[];
  signals: PeopleSignal[];
  minRestHours: number;
  segments: ScheduleSegmentDraft[];
  addSegmentAssignment: (userId: string, segmentType: SegmentType) => void;
  removeAssignment: (id: string) => void;
  patchAssignment: (id: string, update: Partial<AssignmentDraft>) => void;
  patchAssignmentSegment: (id: string, type: SegmentType) => void;
}) {
  const { t } = useTranslation();
  const groupedKeys = Array.from(new Set(assignments.map((assignment) => assignment.userId ? `user:${assignment.userId}` : `freelance:${assignment.id}`)));

  return (
    <section className="assigned-team">
      <div className="between"><strong>{t("quickEvent.assignedTasks")}</strong><span className="muted">{assignments.length}</span></div>
      <div className="assigned-list">
        {groupedKeys.map((key) => {
          const userId = key.startsWith("user:") ? key.slice(5) : null;
          const user = userId ? users.find((item) => item.id === userId) : null;
          const userAssignments = userId ? assignments.filter((assignment) => assignment.userId === userId) : assignments.filter((assignment) => `freelance:${assignment.id}` === key);
          const firstAssignment = userAssignments[0]!;
          const displayName = user?.name ?? firstAssignment.externalName ?? "Freelance";
          const signal = userId ? signals.find((item) => item.userId === userId) : undefined;
          const secondaryTypes = sortSegmentsByOpsOrder(segments)
            .filter((segment) => segment.type !== "bolo")
            .filter((segment) => !userAssignments.some((assignment) => (assignment.segmentType ?? "bolo") === segment.type))
            .map((segment) => segment.type);

          return (
            <article className="assigned-person" key={key}>
              <div className="assigned-person-head">
                <strong className="assigned-person-name"><UserAvatar user={user ?? { name: displayName }} size="sm" />{displayName}</strong>
                <div className="row compact">
                  {signal?.unavailable && <span className="badge rejected">{t("quickEvent.notAvailable")}</span>}
                  {signal?.assignmentConflict && <span className="badge rejected">{t("quickEvent.busy")}</span>}
                  {signal?.restConflict && <span className="badge pending">{t("quickEvent.restLess", { hours: minRestHours })}</span>}
                  {userId && secondaryTypes.map((type) => (
                    <button key={type} type="button" className={`button subtle mini-add-inline ${segmentClassName(type)}`} onClick={() => addSegmentAssignment(userId, type)}>
                      <Plus size={14} />{segmentLabels[type]}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="icon-button mini"
                    onClick={() => userAssignments.forEach((assignment) => removeAssignment(assignment.id))}
                    aria-label={t("quickEvent.removePerson", { name: user?.name ?? "..." })}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
              <div className="assigned-task-list">
                {[...userAssignments].sort((a, b) => {
                  const aSegment = (a.segmentType ?? "bolo") as SegmentType;
                  const bSegment = (b.segmentType ?? "bolo") as SegmentType;
                  return segmentTypes.indexOf(aSegment) - segmentTypes.indexOf(bSegment);
                }).map((assignment) => (
                  <AssignmentTask
                    assignment={assignment}
                    segments={segments}
                    key={assignment.id}
                    removeAssignment={removeAssignment}
                    patchAssignment={patchAssignment}
                    patchAssignmentSegment={patchAssignmentSegment}
                  />
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function AssignmentTask({
  assignment,
  segments,
  removeAssignment,
  patchAssignment,
  patchAssignmentSegment
}: {
  assignment: AssignmentDraft;
  segments: ScheduleSegmentDraft[];
  removeAssignment: (id: string) => void;
  patchAssignment: (id: string, update: Partial<AssignmentDraft>) => void;
  patchAssignmentSegment: (id: string, type: SegmentType) => void;
}) {
  const { t } = useTranslation();
  const window = makeWindow(assignment.date, assignment.departure, assignment.arrival);
  const stats = calculateOvertime(window.startsAt, window.endsAt);
  const segmentType = assignment.segmentType ?? "bolo";
  const selectableSegments = sortSegmentsByOpsOrder(segments.filter((segment) => segment.enabled || segment.type === segmentType));

  return (
    <details className={`person-logistics assignment-task ${segmentClassName(segmentType)}`} open={assignment.expanded} onToggle={(event) => patchAssignment(assignment.id, { expanded: (event.currentTarget as HTMLDetailsElement).open })}>
      <summary>
        <span>{segmentLabels[segmentType]} - {roles.find(([value]) => value === assignment.role)?.[1] ?? assignment.role}</span>
        <span className="muted">{assignment.departure} - {assignment.arrival}</span>
      </summary>
      <div className="mini-logistics">
        <div className="overtime-badge info">
          <span>{stats.totalHours.toFixed(2)}h</span>
        </div>
        <div className="person-meta flush">
          <select value={segmentType} onChange={(event) => patchAssignmentSegment(assignment.id, event.target.value as SegmentType)}>
            {selectableSegments.map((segment) => <option key={segment.type} value={segment.type}>{segmentLabels[segment.type]}</option>)}
          </select>
          <select value={assignment.role} onChange={(event) => patchAssignment(assignment.id, { role: event.target.value })}>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <button type="button" className="icon-button mini" onClick={() => removeAssignment(assignment.id)} aria-label={t("quickEvent.removeAssignment")}><X size={14} /></button>
        </div>
        {!assignment.userId && (
          <div className="quick-grid two">
            <input className="input" value={assignment.externalName ?? ""} onChange={(event) => patchAssignment(assignment.id, { externalName: event.target.value })} placeholder={t("quickEvent.freelanceName")} />
            <input className="input" value={assignment.externalPhone ?? ""} onChange={(event) => patchAssignment(assignment.id, { externalPhone: event.target.value })} placeholder={t("quickEvent.contact")} />
          </div>
        )}
        <label className="field">{t("quickEvent.segmentDay")}<input className="input picker-input" type="date" value={assignment.date} onClick={(e) => (e.currentTarget as any).showPicker?.()} onChange={(event) => patchAssignment(assignment.id, { date: event.target.value })} /></label>
        <div className="quick-grid two">
          <TimePicker label={t("quickEvent.segmentStart")} value={assignment.departure} onChange={(val) => patchAssignment(assignment.id, { departure: val })} up />
          <TimePicker label={t("quickEvent.segmentEnd")} value={assignment.arrival} onChange={(val) => patchAssignment(assignment.id, { arrival: val })} up />
        </div>
        <input className="input" value={assignment.logisticsNotes} onChange={(event) => patchAssignment(assignment.id, { logisticsNotes: event.target.value })} placeholder={t("quickEvent.personalNote")} />
      </div>
    </details>
  );
}
