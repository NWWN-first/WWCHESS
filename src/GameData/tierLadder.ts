// src/GameData/tierLadder.ts
// TFT-style cost/star tier ladder — spec mirror only (game logic: economy.ts + units.ts).

import type { CostTier, StarLevel } from './types';

/** Documented TFT reference multiples; live combat uses STAR_STAT_MULTIPLIER in economy.ts */
export const TIER_LADDER_REFERENCE = {
  starHpAtkMultPerStep: 1.8,
  star3ApproxMult: 3.24,
} as const;

export type TierLadderCostStar = `${CostTier}cost_${StarLevel}star`;

export interface TierEquivalence {
  /** Ladder tier index (1–9) from adoption plan §1 */
  tier: number;
  left: TierLadderCostStar;
  right: TierLadderCostStar;
  /** Optional plain label for UI/tooling */
  label?: string;
}

export interface TierAnchorMatchup {
  anchorId: '③' | '④' | '⑥' | '⑦' | '⑧';
  description: string;
  home: { unitId: string; star: StarLevel };
  away: { unitId: string; star: StarLevel };
  /** Target win rate for `home` in naked 1v1 (%, inclusive) */
  homeWinRatePct: { min: number; max: number };
}

export const TIER_LADDER_RULES = {
  ...TIER_LADDER_REFERENCE,
  equivalences: [
    { tier: 3, left: '1cost_2star' as const, right: '3cost_1star' as const, label: '1★2 ≈ 3★1' },
    { tier: 4, left: '2cost_2star' as const, right: '4cost_1star' as const, label: '2★2 ≈ 4★1' },
    { tier: 5, left: '3cost_2star' as const, right: '1cost_3star' as const, label: '3★2 ≈ 1★3' },
    { tier: 5, left: '3cost_2star' as const, right: '5cost_1star' as const, label: '3★2 ≈ 5★1' },
    { tier: 6, left: '2cost_3star' as const, right: '4cost_2star' as const, label: '2★3 ≈ 4★2' },
    { tier: 7, left: '3cost_3star' as const, right: '5cost_2star' as const, label: '3★3 ≈ 5★2' },
    { tier: 8, left: '4cost_3star' as const, right: '5cost_2star' as const, label: '4★3 ≈ 5★2' },
  ] satisfies TierEquivalence[],
  pivotWarnings: [
    {
      id: '2star2_over_4star1',
      message:
        '2코 2★은 아이템·운영이 갖춰진 4코 1★ 단독보다 체급이 높은 편입니다. 무작정 교체하지 마세요.',
    },
    {
      id: '1cost_3star_late',
      message:
        '1코 3★ 덱은 평균적으로 후반 4코 운영에 밀리기 쉽지만, 아이템·시너지가 맞으면 1등 가능합니다.',
    },
    {
      id: '3star3_needs_items',
      message:
        '3코 3★은 우승권 체급이지 무장 자동승이 아닙니다. 아이템·시너지 완성도를 함께 보세요.',
    },
  ],
  /**
   * Naked 1v1 floor KPI anchors (plan §5.1). Deck/item scenarios live in separate fixtures.
   */
  naked1v1Anchors: [
    {
      anchorId: '③',
      description: '1코 2★ vs 3코 1★',
      home: { unitId: 'u1_garen', star: 2 },
      away: { unitId: 'u3_grom', star: 1 },
      homeWinRatePct: { min: 45, max: 55 },
    },
    {
      anchorId: '⑦',
      description: '3코 3★ vs 5코 2★',
      home: { unitId: 'u3_grom', star: 3 },
      away: { unitId: 'u5_goldtooth', star: 2 },
      homeWinRatePct: { min: 45, max: 55 },
    },
  ] satisfies TierAnchorMatchup[],
} as const;