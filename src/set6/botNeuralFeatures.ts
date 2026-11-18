import { augmentDefForId } from '../GameData/augmentUtils';
import { TRAIT_DEFINITIONS } from '../GameData/traits';
import type { TraitId } from '../GameData/types';
import { Participant } from '../Participant';

/** v1 had 11 dims; v2 adds 7 Set 6–aware signals (18 total). */
export const BOT_NEURAL_FEATURE_DIM = 18;

export const BOT_NEURAL_FEATURE_NAMES: readonly string[] = [
  'hpRatio',
  'goldNorm',
  'levelNorm',
  'stageNorm',
  'benchUnitsRatio',
  'itemBenchRatio',
  'boardPowerNorm',
  'winStreakNorm',
  'lossStreakNorm',
  'contestedTraitRatio',
  'emergencyFlag',
  // --- Set 6 extensions ---
  'augmentSlotsNorm',
  'augmentTierNorm',
  'targetTraitProgressNorm',
  'mercenaryVaultNorm',
  'boardFillRatio',
  'activeSynergyNorm',
  'equippedItemPressure',
] as const;

export function traitBreakpointProgress(
  traitCounts: Map<TraitId, number>,
  targetTrait: TraitId
): number {
  const count = traitCounts.get(targetTrait) ?? 0;
  const def = TRAIT_DEFINITIONS[targetTrait];
  if (!def?.thresholds?.length) return Math.min(1, count / 4);
  for (const threshold of def.thresholds) {
    if (count < threshold) return Math.max(0, Math.min(1, count / threshold));
  }
  return 1;
}

export function augmentSlotsNorm(augmentIds: readonly string[]): number {
  return Math.min(1, augmentIds.length / 3);
}

export function augmentTierNorm(augmentIds: readonly string[]): number {
  if (augmentIds.length === 0) return 0;
  let sum = 0;
  for (const id of augmentIds) {
    const def = augmentDefForId(id);
    const w =
      def?.tier === 'PRISMATIC' ? 1 : def?.tier === 'GOLD' ? 0.66 : def?.tier === 'SILVER' ? 0.33 : 0.4;
    sum += w;
  }
  return sum / augmentIds.length;
}

export function activeSynergyNorm(traitCounts: Map<TraitId, number>): number {
  let active = 0;
  for (const [trait, count] of traitCounts) {
    const def = TRAIT_DEFINITIONS[trait];
    const min = def?.thresholds?.[0] ?? 2;
    if (count >= min) active++;
  }
  return Math.min(1, active / 8);
}

export function equippedItemPressure(
  bot: Participant,
  boardItemCount: number
): number {
  const slots = Math.max(1, bot.level * 3);
  const total = boardItemCount + bot.itemBench.length;
  return Math.min(1, total / slots);
}

export function countBoardUnits(bot: Participant): number {
  let n = 0;
  for (let r = 0; r < Participant.BOARD_ROWS; r++) {
    for (let c = 0; c < Participant.BOARD_COLS; c++) {
      if (bot.board[r][c]) n++;
    }
  }
  return n;
}

export function countBoardItems(bot: Participant): number {
  let n = 0;
  for (let r = 0; r < Participant.BOARD_ROWS; r++) {
    for (let c = 0; c < Participant.BOARD_COLS; c++) {
      const u = bot.board[r][c];
      if (u) n += u.items.length;
    }
  }
  return n;
}