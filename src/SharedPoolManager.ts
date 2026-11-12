// src/SharedPoolManager.ts

import {
  ALL_UNIT_LIST,
  CostTier,
  POOL_SIZE_BY_COST,
  SHOP_ODDS_BY_LEVEL,
  StarLevel,
  UNIT_TEMPLATES,
  UNITS_BY_COST,
  UnitTemplate,
} from './GameData';

/**
 * SharedPoolManager와 상호작용하는 참가자(플레이어 또는 AI 봇) 최소 인터페이스.
 * 이후 Phase에서 구현할 Participant 클래스가 이 인터페이스를 구현(implements)하거나 호환된다.
 */
export interface PoolParticipant {
  id: string;
  name: string;
  level: number;
  isEliminated: boolean;
  shop: (string | null)[];
  hasThreeStarUnit(unitId: string): boolean;
  getOwnedUnitCopiesCount?(unitId: string): number;
}

export interface PoolInspectionRow {
  unitId: string;
  unitName: string;
  cost: CostTier;
  maxCount: number;
  remainingInPool: number;
  ownedByAllParticipants: number;
  inShopsCount: number;
  isBlockedForPlayer: boolean;
}

export class SharedPoolManager {
  private pool: Map<string, number> = new Map();
  private maxPool: Map<string, number> = new Map();

  constructor() {
    this.resetPool();
  }

  /**
   * 20종 모든 기물의 공유 풀 재고를 초기 최대치(1코 22, 2코 20, 3코 17, 4코 10, 5코 9)로 초기화한다.
   */
  public resetPool(): void {
    this.pool.clear();
    this.maxPool.clear();

    for (const unit of ALL_UNIT_LIST) {
      const maxCount = POOL_SIZE_BY_COST[unit.cost];
      this.pool.set(unit.id, maxCount);
      this.maxPool.set(unit.id, maxCount);
    }
  }

  /**
   * 특정 기물의 현재 공유 풀 잔여 개수를 반환한다.
   */
  public getRemainingCount(unitId: string): number {
    return this.pool.get(unitId) ?? 0;
  }

  /**
   * 특정 기물의 코스트 기준 초기 최대 재고 개수를 반환한다.
   */
  public getMaxCount(unitId: string): number {
    return this.maxPool.get(unitId) ?? 0;
  }

  /**
   * 성급(1성=1개, 2성=3개, 3성=9개)에 따른 공유 풀 점유/반환 개수를 계산한다.
   */
  public static getCopiesCountForStar(starLevel: StarLevel): number {
    if (starLevel === 1) return 1;
    if (starLevel === 2) return 3;
    return 9;
  }

  /**
   * 기물 판매, 상점 리롤 반환, 탈락자 반환 시 공유 풀로 기물 재고를 복구한다.
   * MAX_POOL을 절대 초과하지 않도록 클램핑한다.
   */
  public returnUnitToPool(unitId: string, starLevel: StarLevel = 1): number {
    const template = UNIT_TEMPLATES[unitId];
    if (!template) return 0;

    const current = this.getRemainingCount(unitId);
    const max = this.getMaxCount(unitId);
    const copiesToReturn = SharedPoolManager.getCopiesCountForStar(starLevel);
    const updated = Math.min(max, current + copiesToReturn);
    const actualReturned = updated - current;

    this.pool.set(unitId, updated);
    return actualReturned;
  }

  /**
   * 개수(copies) 단위로 직접 공유 풀에 반환한다.
   */
  public returnRawCopiesToPool(unitId: string, copies: number): number {
    if (copies <= 0 || !UNIT_TEMPLATES[unitId]) return 0;
    const current = this.getRemainingCount(unitId);
    const max = this.getMaxCount(unitId);
    const updated = Math.min(max, current + copies);
    const actualReturned = updated - current;
    this.pool.set(unitId, updated);
    return actualReturned;
  }

  /**
   * 공유 풀에서 특정 기물 1성(1개)을 직접 차감 시도한다.
   * (챔피언 복제기, 증강체 보상, 판도라의 대기석 등에서 사용)
   * 풀 잔여 개수가 0개이면 절대 생성/차감되지 않고 false를 반환한다.
   */
  public tryTakeUnitFromPool(unitId: string, copies: number = 1): boolean {
    const current = this.getRemainingCount(unitId);
    if (current < copies) {
      return false;
    }
    this.pool.set(unitId, current - copies);
    return true;
  }

  /**
   * 공유 풀에서 특정 기물 1성(1개)을 직접 인출한다.
   * 챔피언 복제기 등에서 사용하며, 풀에 잔여 개수가 0개이면 false를 반환한다.
   */
  public pullSpecificUnitFromPool(unitId: string): boolean {
    return this.tryTakeUnitFromPool(unitId, 1);
  }

  /**
   * 참가자의 현재 상점 슬롯에 남아있는 미구매 기물들을 모두 공유 풀로 반환(+1)하고 슬롯을 비운다.
   */
  public releaseShopToPool(participant: PoolParticipant): void {
    for (let i = 0; i < participant.shop.length; i++) {
      const unitId = participant.shop[i];
      if (unitId !== null && unitId !== undefined) {
        this.returnUnitToPool(unitId, 1);
        participant.shop[i] = null;
      }
    }
  }

  /**
   * 특정 참가자가 특정 기물의 3성을 달성한 즉시 호출하여,
   * 해당 참가자의 현재 상점 슬롯에 떠 있는 동일 기물을 제거하고 공유 풀로 즉시 반환한다.
   */
  public purgeThreeStarFromParticipantShop(participant: PoolParticipant, unitId: string): void {
    if (!participant.hasThreeStarUnit(unitId)) return;

    for (let i = 0; i < participant.shop.length; i++) {
      if (participant.shop[i] === unitId) {
        this.returnUnitToPool(unitId, 1);
        participant.shop[i] = null;
      }
    }
  }

  /**
   * 참가자의 레벨 확률 및 3성 차단 규칙, 실시간 재고 가중치를 반영하여 상점 5칸을 새로 추첨한다.
   * 1) 기존 상점 슬롯에 남아있는 미구매 기물들을 공유 풀에 +1씩 반환한다.
   * 2) participant.level에 해당하는 확률 테이블로 5개 슬롯 각각의 목표 코스트를 뽑는다.
   * 3) 해당 코스트 기물 중 remainingCount > 0 이고 participant.hasThreeStarUnit(unitId) === false인 기물만 후보군으로 필터링한다.
   * 4) 후보군 기물들의 remainingCount를 가중치(Weighted Random)로 1개를 추첨하고 즉시 공유 풀에서 -1 차감한다.
   *    (만약 목표 코스트 후보군이 비어있으면 인접 코스트에서 탐색한다.)
   */
  public drawShopForParticipant(participant: PoolParticipant, slotCount: number = 5): (string | null)[] {
    // 1. 기존 상점 미구매 기물 반환
    this.releaseShopToPool(participant);

    const newShop: (string | null)[] = [];
    const clampedLevel = Math.max(1, Math.min(9, participant.level));
    const odds = SHOP_ODDS_BY_LEVEL[clampedLevel] ?? SHOP_ODDS_BY_LEVEL[1];

    for (let slot = 0; slot < slotCount; slot++) {
      const targetCost = this.rollCostByOdds(odds);
      const pickedUnitId = this.drawSingleUnitForParticipant(participant, targetCost);
      newShop.push(pickedUnitId);
    }

    participant.shop = newShop;
    return newShop;
  }

  /**
   * 판도라의 대기석(Pandora's Bench) 등 동일 코스트의 다른 랜덤 기물로 변신시킬 때 사용한다.
   * 기존 기물(starLevel 반영)을 풀에 먼저 반환한 뒤, 같은 코스트에서 3성 잠금되지 않고 재고가 충분한 기물을 추첨한다.
   */
  public transformUnitInPool(
    participant: PoolParticipant,
    oldUnitId: string,
    starLevel: StarLevel
  ): string {
    const oldTemplate = UNIT_TEMPLATES[oldUnitId];
    if (!oldTemplate) return oldUnitId;

    const neededCopies = SharedPoolManager.getCopiesCountForStar(starLevel);
    // 먼저 기존 기물을 풀에 반환
    this.returnUnitToPool(oldUnitId, starLevel);

    const cost = oldTemplate.cost;
    const candidates = UNITS_BY_COST[cost].filter(
      (u) =>
        u.id !== oldUnitId &&
        this.getRemainingCount(u.id) >= neededCopies &&
        !participant.hasThreeStarUnit(u.id)
    );

    if (candidates.length === 0) {
      // 변경 가능한 다른 기물 재고가 없으면 원래 기물을 다시 꺼내 유지
      this.tryTakeUnitFromPool(oldUnitId, neededCopies);
      return oldUnitId;
    }

    const picked = this.pickWeightedByRemaining(candidates);
    if (picked && this.tryTakeUnitFromPool(picked.id, neededCopies)) {
      return picked.id;
    }

    this.tryTakeUnitFromPool(oldUnitId, neededCopies);
    return oldUnitId;
  }

  /**
   * 레벨별 확률 배열([1코%, 2코%, 3코%, 4코%, 5코%])에 따라 목표 코스트(1~5)를 추첨한다.
   */
  private rollCostByOdds(odds: [number, number, number, number, number]): CostTier {
    const totalOdds = odds.reduce((sum, val) => sum + val, 0);
    let roll = Math.random() * totalOdds;

    for (let i = 0; i < odds.length; i++) {
      roll -= odds[i];
      if (roll <= 0) {
        return (i + 1) as CostTier;
      }
    }
    return 1;
  }

  /**
   * 목표 코스트에서 참가자가 뽑을 수 있는 기물 1개를 추첨하고 풀에서 -1 차감한다.
   * 해당 코스트 후보군이 비어있으면 인접 코스트 순서대로 폴백 추첨한다.
   */
  private drawSingleUnitForParticipant(
    participant: PoolParticipant,
    preferredCost: CostTier
  ): string | null {
    const searchOrder = this.getAdjacentCostSearchOrder(preferredCost);

    for (const cost of searchOrder) {
      const candidates = UNITS_BY_COST[cost].filter(
        (u) => this.getRemainingCount(u.id) > 0 && !participant.hasThreeStarUnit(u.id)
      );

      if (candidates.length > 0) {
        const chosen = this.pickWeightedByRemaining(candidates);
        if (chosen && this.tryTakeUnitFromPool(chosen.id, 1)) {
          return chosen.id;
        }
      }
    }

    return null;
  }

  /**
   * 후보군 기물들의 현재 remainingCount를 가중치(Weighted Random)로 하여 기물 1개를 선택한다.
   */
  private pickWeightedByRemaining(candidates: UnitTemplate[]): UnitTemplate | null {
    let totalWeight = 0;
    for (const unit of candidates) {
      totalWeight += this.getRemainingCount(unit.id);
    }

    if (totalWeight <= 0) return null;

    let roll = Math.random() * totalWeight;
    for (const unit of candidates) {
      const weight = this.getRemainingCount(unit.id);
      roll -= weight;
      if (roll <= 0) {
        return unit;
      }
    }

    return candidates[candidates.length - 1] ?? null;
  }

  /**
   * 특정 코스트의 풀이 모두 고갈되었을 때 인접한 코스트를 탐색하기 위한 순서 배열 반환
   */
  private getAdjacentCostSearchOrder(targetCost: CostTier): CostTier[] {
    const allCosts: CostTier[] = [1, 2, 3, 4, 5];
    return allCosts.sort((a, b) => {
      const diffA = Math.abs(a - targetCost);
      const diffB = Math.abs(b - targetCost);
      if (diffA !== diffB) return diffA - diffB;
      return a - b;
    });
  }

  /**
   * UI 디버그 인스펙터에서 실시간으로 확인할 수 있도록 20종 모든 기물의
   * [기물명, 코스트, 최대 개수, 현재 풀 잔여 개수, 8인이 보유 중인 개수, 내 3성 달성으로 인한 상점 차단 여부(isBlockedForPlayer)]
   * 데이터를 반환한다.
   */
  public getPoolInspectionData(
    player: PoolParticipant,
    allParticipants?: PoolParticipant[]
  ): PoolInspectionRow[] {
    return ALL_UNIT_LIST.map((unit) => {
      const maxCount = this.getMaxCount(unit.id);
      const remainingInPool = this.getRemainingCount(unit.id);

      let inShopsCount = 0;
      let ownedByParticipants = 0;

      if (allParticipants && allParticipants.length > 0) {
        for (const p of allParticipants) {
          if (p.isEliminated) continue;
          for (const shopSlot of p.shop) {
            if (shopSlot === unit.id) {
              inShopsCount += 1;
            }
          }
          if (typeof p.getOwnedUnitCopiesCount === 'function') {
            ownedByParticipants += p.getOwnedUnitCopiesCount(unit.id);
          }
        }
      } else {
        // allParticipants가 전달되지 않은 경우 수학적 보존 법칙(최대 재고 - 현재 풀 잔여량)으로 계산
        ownedByParticipants = Math.max(0, maxCount - remainingInPool);
      }

      const totalOutOfPool = Math.max(0, maxCount - remainingInPool);
      const effectiveOwnedCount =
        allParticipants && allParticipants.length > 0
          ? ownedByParticipants
          : totalOutOfPool;

      return {
        unitId: unit.id,
        unitName: unit.name,
        cost: unit.cost,
        maxCount,
        remainingInPool,
        ownedByAllParticipants: effectiveOwnedCount,
        inShopsCount,
        isBlockedForPlayer: player.hasThreeStarUnit(unit.id),
      };
    });
  }
}
