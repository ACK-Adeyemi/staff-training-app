// The C9 stats overview: compliance breakdowns, attention lists and trend. Brief 5.2.
import { addDays } from '../dates';
import type { Assignment, Module } from '../schemas/learning';
import type { JobRole, Team } from '../schemas/tenancy';
import { applicableCells, orgCompliance, percentOf, type ClientView } from './client';

export type OverviewView = ClientView & { jobRoles: JobRole[]; teams: Team[] };
export type BreakdownRow = { id: string; name: string; compliant: number; total: number; percent: number };

const isCompliant = (status: string): boolean => status === 'current' || status === 'expiringSoon';

const breakdown = (
  view: ClientView,
  units: { id: string; name: string }[],
  belongs: (unitId: string, c: ReturnType<typeof applicableCells>[number]) => boolean,
): BreakdownRow[] => {
  const all = applicableCells(view);
  return units.map((u) => {
    const mine = all.filter((c) => belongs(u.id, c));
    const compliant = mine.filter((c) => isCompliant(c.status)).length;
    return { id: u.id, name: u.name, compliant, total: mine.length, percent: percentOf(compliant, mine.length) };
  });
};

export const overviewByRequirement = (view: OverviewView): BreakdownRow[] =>
  breakdown(view, view.requirements, (id, c) => c.requirement.id === id);

export const overviewByRole = (view: OverviewView): BreakdownRow[] =>
  breakdown(view, view.jobRoles, (id, c) => c.person.jobRoleIds.includes(id));

export const overviewByTeam = (view: OverviewView): BreakdownRow[] =>
  breakdown(view, view.teams, (id, c) => c.person.teamIds.includes(id));

export const overviewBySite = (view: OverviewView): BreakdownRow[] =>
  breakdown(view, view.sites, (id, c) => c.person.primarySiteId === id);

export type AttentionRow = { personId: string; requirementId: string; expiresAt: string; daysLeft: number };

/** Overdue (most overdue first) and due soon (soonest first). Never-started pairs and archived people are left out. */
export function overdueAndExpiring(view: ClientView): { overdue: AttentionRow[]; expiring: AttentionRow[] } {
  const pick = (status: string): AttentionRow[] =>
    applicableCells(view)
      .filter((c) => c.status === status && c.expiresAt !== undefined && c.daysLeft !== undefined)
      .map((c) => ({
        personId: c.person.id,
        requirementId: c.requirement.id,
        expiresAt: c.expiresAt ?? '',
        daysLeft: c.daysLeft ?? 0,
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  return { overdue: pick('overdue'), expiring: pick('expiringSoon') };
}

export type ModuleCompletionRow = {
  moduleId: string;
  title: string;
  assigned: number;
  completed: number;
  percent: number;
};

export function mostAndLeastCompleted(
  input: { modules: readonly Module[]; assignments: readonly Assignment[] },
  count = 3,
): { most: ModuleCompletionRow[]; least: ModuleCompletionRow[] } {
  const rows: ModuleCompletionRow[] = [];
  for (const m of input.modules) {
    const mine = input.assignments.filter(
      (a) => 'moduleId' in a.target && a.target.moduleId === m.id && a.status !== 'cancelled',
    );
    if (mine.length === 0) continue;
    const completed = mine.filter((a) => a.status === 'done').length;
    rows.push({
      moduleId: m.id,
      title: m.title,
      assigned: mine.length,
      completed,
      percent: percentOf(completed, mine.length),
    });
  }
  const tie = (a: ModuleCompletionRow, b: ModuleCompletionRow): number =>
    b.assigned - a.assigned || a.title.localeCompare(b.title);
  return {
    most: [...rows].sort((a, b) => b.percent - a.percent || tie(a, b)).slice(0, count),
    least: [...rows].sort((a, b) => a.percent - b.percent || tie(a, b)).slice(0, count),
  };
}

/** Weekly compliance points, oldest first, each from Evidence that existed by then and people who had started. */
export function complianceTrend(
  view: ClientView,
  days: 30 | 90,
): { at: string; compliant: number; total: number; percent: number }[] {
  const weeks = Math.floor(days / 7);
  return Array.from({ length: weeks + 1 }, (_, i) => {
    const at = i === weeks ? view.now : addDays(view.now, -7 * (weeks - i));
    const limit = at.getTime();
    const { compliant, total } = orgCompliance({
      ...view,
      now: at,
      people: view.people.filter((p) => new Date(p.startDate).getTime() <= limit),
      evidence: view.evidence.filter((e) => new Date(e.completedAt).getTime() <= limit),
      submissions: view.submissions.filter((s) => new Date(s.createdAt).getTime() <= limit),
    });
    return { at: at.toISOString(), compliant, total, percent: percentOf(compliant, total) };
  });
}
