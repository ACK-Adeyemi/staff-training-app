// Question draw for a quiz attempt. Brief section 8 (quiz engine); plan Assumption 7.
// Pure: randomness comes only from the injected seeded Rng.
import type { Rng } from '../rng';
import type { Module, Question } from '../schemas/learning';

export interface Draw {
  questionIds: string[];
  /** Shuffled option or choice ids per question. Absent means bank order. True or false is never shuffled. */
  optionOrder: Record<string, string[]>;
}

export const drawQuestions = (module: Module, rng: Rng): Draw => {
  const { mode, drawCount, mixScenarioShare, shuffleQuestions, shuffleOptions } = module.quiz;
  const scenarios = module.questions.filter((q) => q.type === 'scenario');
  const others = module.questions.filter((q) => q.type !== 'scenario');

  let chosen: Question[];
  if (mode === 'scenario') chosen = rng.sample(scenarios, Math.min(drawCount, scenarios.length));
  else if (mode === 'mcq') chosen = rng.sample(others, Math.min(drawCount, others.length));
  else {
    const wanted = Math.round(drawCount * (mixScenarioShare ?? 0));
    let fromScenarios = Math.min(wanted, scenarios.length);
    const fromOthers = Math.min(drawCount - fromScenarios, others.length);
    // If the other types are short, scenarios fill the gap.
    fromScenarios = Math.min(drawCount - fromOthers, scenarios.length);
    chosen = [...rng.sample(scenarios, fromScenarios), ...rng.sample(others, fromOthers)];
  }

  if (shuffleQuestions) chosen = rng.shuffle(chosen);
  else chosen.sort((a, b) => module.questions.indexOf(a) - module.questions.indexOf(b));

  const optionOrder: Record<string, string[]> = {};
  if (shuffleOptions) {
    for (const q of chosen) {
      if (q.type === 'mcq') optionOrder[q.id] = rng.shuffle((q.options ?? []).map((o) => o.id));
      else if (q.type === 'scenario')
        optionOrder[q.id] = (q.scenario?.steps ?? []).flatMap((s) => rng.shuffle(s.choices.map((c) => c.id)));
    }
  }
  return { questionIds: chosen.map((q) => q.id), optionOrder };
};
