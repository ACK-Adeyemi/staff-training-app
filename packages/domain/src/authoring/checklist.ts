// The publish checklist. Brief 5.1; M3 plan assumption 14. Six items, always all listed, in this order.
import type { Module } from '../schemas/learning';
import { isSafeHttpsUrl } from '../schemas/learning';
import type { Requirement } from '../schemas/packs';

export type ChecklistItemId = 'title' | 'lesson' | 'question' | 'quiz' | 'requirement' | 'links';

export const publishChecklist = (
  module: Module,
  requirements: readonly Requirement[],
): { ok: boolean; items: { id: ChecklistItemId; passed: boolean }[]; aiUnchecked: number } => {
  const title = module.title.trim().length;
  const bank = module.questions.length;
  const scenarios = module.questions.filter((q) => q.type === 'scenario').length;
  const { mode, drawCount, passMark } = module.quiz;
  const modePossible = mode === 'scenario' ? scenarios > 0 : mode === 'mcq' ? bank - scenarios > 0 : bank > 0;
  const known = new Set(requirements.map((r) => r.id));
  const linkOk = (l: { url?: string | undefined }): boolean => l.url === undefined || isSafeHttpsUrl(l.url);
  const items: { id: ChecklistItemId; passed: boolean }[] = [
    { id: 'title', passed: title >= 3 && title <= 100 },
    {
      id: 'lesson',
      passed: module.lessons.some((l) => l.blocks.some((b) => b.kind === 'text' && b.markdown.trim() !== '')),
    },
    { id: 'question', passed: bank >= 1 },
    {
      id: 'quiz',
      passed:
        Number.isInteger(drawCount) &&
        drawCount >= 1 &&
        drawCount <= bank &&
        passMark >= 1 &&
        passMark <= 100 &&
        modePossible,
    },
    {
      id: 'requirement',
      passed:
        module.optional === true ||
        (module.requirementIds.length > 0 && module.requirementIds.every((id) => known.has(id))),
    },
    {
      id: 'links',
      passed:
        module.questions.every((q) => q.learnMore.every(linkOk)) &&
        module.lessons.every((l) => (l.furtherReading ?? []).every(linkOk)),
    },
  ];
  // F-7: AI-drafted lessons and questions must each be marked as checked by a person before publishing.
  const unchecked = (x: { aiDrafted?: boolean | undefined; aiReviewedBy?: string | undefined }): boolean =>
    x.aiDrafted === true && x.aiReviewedBy === undefined;
  const aiUnchecked = module.lessons.filter(unchecked).length + module.questions.filter(unchecked).length;
  return { ok: items.every((i) => i.passed) && aiUnchecked === 0, items, aiUnchecked };
};
