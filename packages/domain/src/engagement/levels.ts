// Levels from total XP (brief 16.1; plan M2 assumption 5). Thresholds come from content.
import { engagementConfig } from './config';

export type LevelInfo = { level: number; xpIntoLevel: number; xpForNext: number };

export function levelFor(
  totalXp: number,
  thresholds: readonly number[] = engagementConfig.levelThresholds,
  stepAfterTable: number = engagementConfig.levelStepAfterTable,
): LevelInfo {
  const xp = Math.max(0, Math.floor(totalXp));
  let level = 0;
  while (level < thresholds.length && xp >= (thresholds[level] as number)) level++;
  if (level < thresholds.length) {
    const start = thresholds[level - 1] as number;
    return { level, xpIntoLevel: xp - start, xpForNext: (thresholds[level] as number) - start };
  }
  const last = thresholds[thresholds.length - 1] ?? 0;
  const extra = Math.floor((xp - last) / stepAfterTable);
  return {
    level: thresholds.length + extra,
    xpIntoLevel: xp - last - extra * stepAfterTable,
    xpForNext: stepAfterTable,
  };
}
