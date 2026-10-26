// Engagement numbers in one place. All placeholders (M2 plan assumptions 2 to 7); the UI never hard-codes them.
export type EngagementConfig = {
  xp: {
    lesson: number;
    correct: number;
    /** Multiplier for a first correct answer given with notes hidden; the bonus is round(correct x (multiplier - 1)). */
    closedBookMultiplier: number;
    passed: number;
    passedNewerVersion: number;
    mastery: number;
    earlyRefresher: number;
    weeklyGoal: number;
    dailyCap: number;
  };
  /** Level thresholds when content gives none: level 1 starts at the first value. */
  levelThresholds: readonly number[];
  levelStepAfterTable: number;
  scenarioSavvyCount: number;
  learningHabitWeeks: number;
  /** Amber window used by the All Compliant badge. */
  amberWindowDays: number;
  /** How many empty weeks before a leave end are treated as rest weeks. */
  maxRestWeeks: number;
  competitions: {
    /** Staff leaderboards show this many places (more only when tied at the last one). */
    topRows: number;
    defaultWinnerCount: number;
    /** Team target per cent when a competition does not set one. */
    defaultTeamTarget: number;
  };
};

export const engagementConfig: EngagementConfig = {
  xp: {
    lesson: 10,
    correct: 10,
    closedBookMultiplier: 1.5,
    passed: 20,
    passedNewerVersion: 10,
    mastery: 30,
    earlyRefresher: 25,
    weeklyGoal: 15,
    dailyCap: 300,
  },
  levelThresholds: [0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200],
  levelStepAfterTable: 800,
  scenarioSavvyCount: 10,
  learningHabitWeeks: 4,
  amberWindowDays: 60,
  maxRestWeeks: 8,
  competitions: { topRows: 10, defaultWinnerCount: 1, defaultTeamTarget: 90 },
};
