// src/GameData/economy.ts

import type { CostTier, StarLevel } from './types';

// ============================================================================
// A. 경제 및 확률 테이블 (Economy & Probability Tables)
// ============================================================================

export const POOL_SIZE_BY_COST: Record<CostTier, number> = {
  1: 30, // 1코스트: 기물당 30개 (3성 다수 가능)
  2: 25, // 2코스트: 기물당 25개 (3성 2명 가능)
  3: 18, // 3코스트: 기물당 18개 (경합 시 3성 어려움)
  4: 10, // 4코스트: 기물당 10개 (상대가 2장만 쥐고 있어도 3성 불가!)
  5: 9,  // 5코스트: 기물당 9개 (누군가 1장이라도 사가면 복제기 없이 3성 절대 불가!)
};

/**
 * 레벨 1~10 각 코스트(1~5) 상점 등장 확률 (%)
 * 배열 인덱스 0 -> 1코스트, 1 -> 2코스트, 2 -> 3코스트, 3 -> 4코스트, 4 -> 5코스트
 */
export const SHOP_ODDS_BY_LEVEL: Record<number, [number, number, number, number, number]> = {
  1: [100, 0, 0, 0, 0],
  2: [100, 0, 0, 0, 0],
  3: [75, 25, 0, 0, 0],
  4: [55, 30, 15, 0, 0],
  5: [45, 33, 20, 2, 0],
  6: [30, 40, 25, 5, 0],
  7: [19, 30, 40, 10, 1],
  8: [18, 27, 32, 20, 3],
  9: [15, 20, 25, 30, 10],
  10: [5, 10, 20, 40, 25],
};

/**
 * 해당 레벨 달성에 필요한 누적/구간 경험치 테이블 (Lv.2 ~ Lv.10)
 */
export const XP_REQUIRED_BY_LEVEL: Record<number, number> = {
  2: 2,
  3: 6,
  4: 10,
  5: 20,
  6: 36,
  7: 56,
  8: 80,
  9: 100,
  10: 124,
};

/**
 * 성급별 스탯 배율 규칙
 * - 1~4코스트: 성급 상승 시 체력/공격력 1.8배씩 증가 (1성: 1.0, 2성: 1.8, 3성: 3.24)
 * - 5코스트: 3성 달성 시 체력 4.0배, 스킬 계수 20배 (절대 권능 God Mode)
 */
export const STAR_STAT_MULTIPLIER: Record<
  CostTier,
  Record<StarLevel, { hpMult: number; atkMult: number; skillMult: number }>
> = {
  1: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.85, atkMult: 1.85, skillMult: 1.0 },
    3: { hpMult: 3.55, atkMult: 3.55, skillMult: 1.15 }, // 1코 3성 뽕맛 강화
  },
  2: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.85, atkMult: 1.85, skillMult: 1.0 },
    3: { hpMult: 3.62, atkMult: 3.62, skillMult: 1.25 }, // 2코 3성 캐리력 강화
  },
  3: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.85, atkMult: 1.85, skillMult: 1.0 },
    3: { hpMult: 3.70, atkMult: 3.70, skillMult: 1.40 }, // 3코 3성 트럭: 4코/5코 2성을 꺾고 1등 우승 가능!
  },
  4: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.85, atkMult: 1.85, skillMult: 1.0 },
    3: { hpMult: 3.35, atkMult: 3.35, skillMult: 1.0 },
  },
  5: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.75, atkMult: 1.75, skillMult: 1.0 }, // 5코 2성 미세 완만화
    3: { hpMult: 4.0, atkMult: 3.5, skillMult: 20.0 }, // 5코 3성은 여전히 전장 즉사급
  },
};

