// What staff see on Learn: visibility, required marking, search, filters and sort (brief 17.2; plan M2 assumptions 25 to 27).
import { requirementApplies } from '../packs';
import { personRequirementStatus } from '../requirements';
import type { Category, ModuleGroup, ModulePlacement } from '../schemas/engagement';
import type { Evidence, EvidenceSubmission } from '../schemas/evidence';
import type { Assignment, LearningEvent, Module } from '../schemas/learning';
import type { Requirement } from '../schemas/packs';
import type { Person, Site } from '../schemas/tenancy';
import { addDays } from '../dates';
import { findRanges, fold, searchTerms } from './text';

export type ModuleStatus = 'notStarted' | 'inProgress' | 'completed';
export type DueState = 'none' | 'dueSoon' | 'overdue';

export type CatalogueRow = {
  module: Module;
  required: boolean;
  category?: Category;
  groups: ModuleGroup[];
  minutes: number;
  status: ModuleStatus;
  /** The person has completed the module themselves (a moduleCompleted event), whatever Evidence says. */
  finished: boolean;
  dueAt?: string;
  dueState: DueState;
  lastActiveAt?: string;
};

export type CatalogueInput = {
  person: Person;
  site: Site;
  modules: readonly Module[];
  requirements: readonly Requirement[];
  evidence: readonly Evidence[];
  submissions: readonly EvidenceSubmission[];
  assignments: readonly Assignment[];
  events: readonly LearningEvent[];
  placements: readonly ModulePlacement[];
  categories: readonly Category[];
  groups: readonly ModuleGroup[];
  now: Date;
  amberWindowDays: number;
};

const time = (iso: string): number => new Date(iso).getTime();

export function learnCatalogue(input: CatalogueInput): CatalogueRow[] {
  const { person, site, now, amberWindowDays } = input;
  const mineEvidence = input.evidence.filter((e) => e.personId === person.id);
  const mineSubs = input.submissions.filter((s) => s.personId === person.id);
  const mineEvents = input.events.filter((e) => e.personId === person.id);
  const open = input.assignments.filter((a) => a.personId === person.id && a.status === 'open');
  const windowEnd = addDays(now, amberWindowDays).getTime();

  const rows: CatalogueRow[] = [];
  for (const module of input.modules) {
    if (module.status !== 'published') continue;
    const groups = input.groups.filter((g) => g.moduleIds.includes(module.id));
    const groupIds = new Set(groups.map((g) => g.id));

    const dueDates: number[] = [];
    let required = false;
    let currentEvidence = false;
    for (const a of open) {
      const hit = 'moduleId' in a.target ? a.target.moduleId === module.id : groupIds.has(a.target.groupId);
      if (!hit) continue;
      required = true;
      dueDates.push(time(a.dueAt));
    }
    for (const r of input.requirements) {
      if (!(module.requirementIds.includes(r.id) || r.satisfiedByModuleIds.includes(module.id))) continue;
      if (!requirementApplies(r, person, site)) continue;
      required = true;
      const s = personRequirementStatus(r, person, site, mineEvidence, mineSubs, now, amberWindowDays);
      if (s.status === 'current') currentEvidence = true;
      if ((s.status === 'overdue' || s.status === 'expiringSoon') && s.expiresAt) dueDates.push(time(s.expiresAt));
    }

    const placement = input.placements.find((p) => p.moduleId === module.id);
    if (placement && !required && !placement.availableToAll) continue;

    const moduleEvents = mineEvents.filter((e) => e.moduleId === module.id);
    let lastActiveAt: string | undefined;
    for (const e of moduleEvents)
      if (lastActiveAt === undefined || time(e.at) > time(lastActiveAt)) lastActiveAt = e.at;
    const finished = moduleEvents.some((e) => e.type === 'moduleCompleted');
    const status: ModuleStatus =
      finished || currentEvidence ? 'completed' : moduleEvents.length > 0 ? 'inProgress' : 'notStarted';

    const earliest = dueDates.length > 0 ? Math.min(...dueDates) : undefined;
    let dueState: DueState = 'none';
    if (earliest !== undefined) {
      if (earliest <= now.getTime()) dueState = 'overdue';
      else if (earliest <= windowEnd) dueState = 'dueSoon';
    }
    const category = placement?.categoryId ? input.categories.find((c) => c.id === placement.categoryId) : undefined;

    rows.push({
      module,
      required,
      ...(category ? { category } : {}),
      groups,
      minutes: module.estimatedMinutes,
      status,
      finished,
      ...(earliest !== undefined ? { dueAt: new Date(earliest).toISOString() } : {}),
      dueState,
      ...(lastActiveAt !== undefined ? { lastActiveAt } : {}),
    });
  }
  return rows;
}

export type CatalogueFilters = {
  categoryId?: string;
  groupId?: string;
  status?: ModuleStatus;
  requirement?: 'required' | 'optional';
  due?: boolean;
  underTenMinutes?: boolean;
};
export type CatalogueSort = 'due' | 'recent' | 'az';
export type Highlight = { field: 'title'; start: number; end: number };
export type SearchResult = { rows: CatalogueRow[]; count: number; highlights: Record<string, Highlight[]> };

const merge = (ranges: { start: number; end: number }[]): { start: number; end: number }[] => {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: { start: number; end: number }[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
};

// Required and due first, then other required, then optional. Modules the person has finished have nothing left to
// do, so they drop below the unfinished ones, still with required ahead of optional.
const partition = (r: CatalogueRow): number =>
  r.finished ? (r.required ? 3 : 4) : !r.required ? 2 : r.dueState !== 'none' ? 0 : 1;
const byTitle = (a: CatalogueRow, b: CatalogueRow): number => a.module.title.localeCompare(b.module.title, 'en-GB');
const missingLast = (a: string | undefined, b: string | undefined, dir: 1 | -1): number => {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return dir * (time(a) - time(b));
};

export function searchModules(
  rows: readonly CatalogueRow[],
  query: string,
  filters: CatalogueFilters,
  sort: CatalogueSort,
): SearchResult {
  const terms = searchTerms(query);
  const highlights: Record<string, Highlight[]> = {};
  const kept = rows.filter((r) => {
    if (filters.categoryId !== undefined && r.category?.id !== filters.categoryId) return false;
    if (filters.groupId !== undefined && !r.groups.some((g) => g.id === filters.groupId)) return false;
    if (filters.status !== undefined && r.status !== filters.status) return false;
    if (filters.requirement === 'required' && !r.required) return false;
    if (filters.requirement === 'optional' && r.required) return false;
    if (filters.due && r.dueState === 'none') return false;
    if (filters.underTenMinutes && r.minutes >= 10) return false;
    if (terms.length === 0) return true;
    const title = fold(r.module.title);
    const hay = [
      title,
      fold(r.module.description),
      ...r.module.lessons.map((l) => fold(l.title)),
      fold(r.category?.name ?? ''),
    ];
    if (!terms.every((t) => hay.some((h) => h.includes(t)))) return false;
    const marks = merge(terms.flatMap((t) => findRanges(title, t)));
    if (marks.length > 0) highlights[r.module.id] = marks.map((m) => ({ field: 'title', ...m }));
    return true;
  });

  const ordered = [...kept].sort((a, b) => {
    const p = partition(a) - partition(b);
    if (p !== 0) return p;
    if (sort === 'due') return missingLast(a.dueAt, b.dueAt, 1) || byTitle(a, b);
    if (sort === 'recent') return missingLast(a.lastActiveAt, b.lastActiveAt, -1) || byTitle(a, b);
    return byTitle(a, b);
  });
  return { rows: ordered, count: ordered.length, highlights };
}

export type GroupProgress = { completed: number; total: number; nextModuleId?: string };

/** Counts only modules the person can see. In-order groups name the first one not completed but never block the rest. */
export function groupProgress(group: ModuleGroup, rows: readonly CatalogueRow[]): GroupProgress {
  const byId = new Map(rows.map((r) => [r.module.id, r]));
  const visible = group.moduleIds.map((id) => byId.get(id)).filter((r): r is CatalogueRow => r !== undefined);
  const completed = visible.filter((r) => r.status === 'completed').length;
  const next = group.inOrder ? visible.find((r) => r.status !== 'completed') : undefined;
  return { completed, total: visible.length, ...(next ? { nextModuleId: next.module.id } : {}) };
}
