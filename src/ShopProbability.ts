// src/ShopProbability.ts

import { CostTier } from './GameData';

/**
 * 실제 라이엇 TFT 최신 기준 레벨별(Lv.1 ~ Lv.10) 코스트 등장 확률표 (%)
 * 배열 인덱스 0~4는 각각 [1코, 2코, 3코, 4코, 5코] 등장 확률(합계 100%)
 */
export const TFT_SHOP_ODDS_BY_LEVEL: Record<
  number,
  [number, number, number, number, number]
> = {
  1: [100, 0, 0, 0, 0],
  2: [100, 0, 0, 0, 0],
  3: [75, 25, 0, 0, 0],
  4: [55, 30, 15, 0, 0],
  5: [45, 33, 20, 2, 0],
  6: [30, 40, 25, 5, 0],
  // 5코 출현을 더 낮춰 4코 보드가 후반까지 경쟁하게 (순방 과강 대응)
  7: [19, 31, 41, 9, 0],
  8: [18, 28, 34, 19, 1],
  9: [15, 22, 28, 31, 4],
  10: [5, 12, 24, 44, 15],
};

export class ShopProbability {
  public static readonly MIN_LEVEL = 1;
  public static readonly MAX_LEVEL = 10;

  /**
   * 특정 레벨(1~10)의 기본 코스트 확률 배열([1코, 2코, 3코, 4코, 5코])을 반환한다.
   */
  public static getOddsForLevel(
    level: number
  ): [number, number, number, number, number] {
    const clamped = Math.max(
      ShopProbability.MIN_LEVEL,
      Math.min(ShopProbability.MAX_LEVEL, Math.floor(level))
    );
    return TFT_SHOP_ODDS_BY_LEVEL[clamped] ?? TFT_SHOP_ODDS_BY_LEVEL[1];
  }

  /**
   * 특정 코스트의 공유 풀이 완전히 고갈(0개)되었거나 모두 3성 잠금된 경우,
   * 남은 유효 코스트들의 확률 가중치 합으로 재정규화(Re-normalize)하여 빈 상점 슬롯이 뜨지 않게 코스트를 추첨한다.
   */
  public static rollNormalizedCostTier(
    level: number,
    availableCopiesByCost: Record<CostTier, number>,
    rng: () => number = Math.random
  ): CostTier | null {
    const baseOdds = ShopProbability.getOddsForLevel(level);
    const costs: CostTier[] = [1, 2, 3, 4, 5];

    // 1차: 현재 레벨 확률표에서 재고가 남아 있는 코스트만 필터링하여 가중치 합산
    const activeWeights: Array<{ cost: CostTier; weight: number }> = [];
    let totalWeight = 0;

    for (let i = 0; i < costs.length; i++) {
      const c = costs[i];
      const available = availableCopiesByCost[c] ?? 0;
      const weight = available > 0 ? baseOdds[i] : 0;
      if (weight > 0) {
        activeWeights.push({ cost: c, weight });
        totalWeight += weight;
      }
    }

    // 1차 가중치 합이 0보다 크면 재정규화된 확률로 추첨
    if (totalWeight > 0) {
      let roll = rng() * totalWeight;
      for (const entry of activeWeights) {
        if (roll < entry.weight) {
          return entry.cost;
        }
        roll -= entry.weight;
      }
      return activeWeights[activeWeights.length - 1].cost;
    }

    // 2차 폴백: 현재 레벨에서 등장 가능한 코스트 풀이 모두 고갈된 극단적 상황일 때,
    // 전체 코스트(1~5) 중 재고가 남아 있는 코스트들의 잔여 수량 비례로 추첨
    let fallbackTotal = 0;
    const fallbackEntries: Array<{ cost: CostTier; count: number }> = [];
    for (const c of costs) {
      const count = availableCopiesByCost[c] ?? 0;
      if (count > 0) {
        fallbackEntries.push({ cost: c, count });
        fallbackTotal += count;
      }
    }

    if (fallbackTotal <= 0) {
      return null;
    }

    let fallbackRoll = rng() * fallbackTotal;
    for (const entry of fallbackEntries) {
      if (fallbackRoll < entry.count) {
        return entry.cost;
      }
      fallbackRoll -= entry.count;
    }
    return fallbackEntries[fallbackEntries.length - 1].cost;
  }
}
