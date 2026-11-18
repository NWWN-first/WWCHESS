// src/DopamineEngine.ts

import {
  AUGMENT_DEFINITIONS,
  AugmentDefinition,
  AugmentTier,
  BASE_ITEM_IDS,
  CompletedItemId,
  CostTier,
  ITEM_DEFINITIONS,
  ItemId,
  UNITS_BY_COST,
} from './GameData';
import type { TraitEffectTier } from './GameData/traits';
import { Participant } from './Participant';
import { SharedPoolManager } from './SharedPoolManager';
import { ActiveSynergyState, SynergyEngine } from './SynergyEngine';

export type LootOrbTier = 'GRAY' | 'BLUE' | 'GOLD' | 'PRISMATIC';

export interface LootOrbRewards {
  gold?: number;
  items?: ItemId[];
  units?: string[];
  duplicators?: number;
}

export interface LootOrb {
  id: string;
  tier: LootOrbTier;
  x: number;
  y: number;
  label?: string;
  rewards: LootOrbRewards;
}

const COMPLETED_ITEM_IDS: CompletedItemId[] = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.isCompleted)
  .map((item) => item.id as CompletedItemId);

let globalOrbCounter = 1;

export class DopamineEngine {
  /**
   * Set 6 용병(MERCENARY): 패배 시 무기고 전리품 적립, 승리 시 주사위로 캐시인.
   * - 3+ 용병 시너지 + 보드에 용병 유닛 필요.
   * - 패배: `mercenaryLootPerLoss × mercenaryStackMultiplier` 만큼 무기고 적립 (연패 스택 공식 없음).
   * - 승리: `mercenaryDiceCount` 주사위를 굴려 적립 전리품 1개당 보상 1회 (무기고 비우기).
   */
  public static hasMercenaryUnitOnBoard(participant: Participant): boolean {
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const unit = participant.board[r][c];
        if (unit && unit.traits.includes('MERCENARY')) return true;
      }
    }
    return false;
  }

  /**
   * 라운드 종료 경제: (5)(7) 승리 유지 보상 + (7) 매판 잭팝 (캐시아웃은 processMercenaryTrait).
   */
  public static processRoundEnd(
    participant: Participant,
    didWinCombat: boolean,
    isCreepMatch: boolean,
    sharedPool: SharedPoolManager
  ): LootOrb[] {
    if (participant.isEliminated || isCreepMatch) return [];

    const mercenaryState = SynergyEngine.getActiveSynergyMap(participant).get('MERCENARY');
    if (!mercenaryState || mercenaryState.count < 3) return [];
    if (!DopamineEngine.hasMercenaryUnitOnBoard(participant)) return [];

    const effect = mercenaryState.activeEffect;
    if (!effect) return [];

    const orbs: LootOrb[] = [];

    if (effect.mercenaryPerRoundJackpot) {
      orbs.push(
        ...DopamineEngine.buildMercenaryPerRoundJackpotOrbs(participant, sharedPool)
      );
    }

    if (didWinCombat && mercenaryState.count >= 5) {
      const minG = effect.mercenaryWinGoldMin ?? 0;
      const maxG = effect.mercenaryWinGoldMax ?? 0;
      if (maxG > 0) {
        const span = Math.max(0, maxG - minG);
        const goldGain = minG + Math.floor(Math.random() * (span + 1));
        participant.gold += goldGain;
        participant.lastActionMessage = `🪙 [용병] 승리 유지 +${goldGain}골드!`;
      }

      const smallOrbChance = effect.mercenarySmallOrbChanceOnWin ?? 0;
      if (smallOrbChance > 0 && Math.random() < smallOrbChance) {
        orbs.push(
          DopamineEngine.createLootOrb('GRAY', 0.42, 0.5, '🔹 용병 소박 구슬', {
            gold: 2,
            items: [DopamineEngine.randomBaseItem()],
          })
        );
      }

      const streakThreshold = effect.mercenaryWinStreakForGoldOrb ?? 0;
      if (streakThreshold > 0 && participant.winStreak >= streakThreshold) {
        orbs.push(
          DopamineEngine.createLootOrb('GOLD', 0.58, 0.5, '🪙 연승 황금 구슬', {
            gold: 5,
            items: [DopamineEngine.randomBaseItem()],
          })
        );
      }
    }

    return orbs;
  }

  public static processMercenaryTrait(
    participant: Participant,
    mercenaryState: ActiveSynergyState | null,
    didWinCombat: boolean,
    sharedPool: SharedPoolManager
  ): LootOrb[] {
    const activeMercenaryCount = mercenaryState?.count ?? 0;
    if (participant.isEliminated || activeMercenaryCount < 3) return [];

    if (!DopamineEngine.hasMercenaryUnitOnBoard(participant)) return [];

    const effect = mercenaryState?.activeEffect;
    const lootPerLoss = effect?.mercenaryLootPerLoss ?? 1;
    const stackMultiplier = effect?.mercenaryStackMultiplier ?? 1;
    const diceCount = effect?.mercenaryDiceCount ?? 1;

    if (!didWinCombat) {
      const gain = lootPerLoss * stackMultiplier;
      participant.mercenaryArmoryLoot += gain;
      participant.lastActionMessage = `🎲 [용병] 패배 — 무기고 전리품 +${gain} (보유 ${participant.mercenaryArmoryLoot})`;
      return [];
    }

    if (participant.mercenaryArmoryLoot > 0) {
      const lootBefore = participant.mercenaryArmoryLoot;
      participant.mercenaryArmoryLoot = 0;

      const orbs = DopamineEngine.rollMercenaryArmoryCashout(
        participant,
        lootBefore,
        diceCount,
        effect ?? undefined,
        sharedPool
      );

      participant.lastActionMessage = `🎲 [용병] 승리 — 주사위 ${Math.min(diceCount, lootBefore)}개·무기고 ${lootBefore} 캐시인! 구슬 ${orbs.length}개`;
      return orbs;
    }

    return [];
  }

  private static buildMercenaryPerRoundJackpotOrbs(
    participant: Participant,
    sharedPool: SharedPoolManager
  ): LootOrb[] {
    const isPrism = Math.random() < 0.28;
    const tier: LootOrbTier = isPrism ? 'PRISMATIC' : 'GOLD';
    const gold = 6 + Math.floor(Math.random() * 7);
    const rewards: LootOrbRewards = {
      gold,
      items: [DopamineEngine.randomBaseItem()],
    };

    const roll = Math.random();
    if (roll < 0.1) {
      rewards.units = DopamineEngine.pickAvailableUnitsFromPool(
        sharedPool,
        participant,
        5,
        1
      );
    } else if (roll < 0.32) {
      rewards.units = DopamineEngine.pickAvailableUnitsFromPool(
        sharedPool,
        participant,
        4,
        1
      );
    }

    if (isPrism && Math.random() < 0.35) {
      rewards.items = [
        ...(rewards.items ?? []),
        DopamineEngine.randomCompletedItem(),
      ];
    }

    return [
      DopamineEngine.createLootOrb(
        tier,
        0.5,
        0.48,
        tier === 'PRISMATIC' ? '👑 7용병 매판 잭팟' : '🪙 7용병 매판 황금',
        rewards
      ),
    ];
  }

  /** Set 6 용병 승리: 주사위마다 무기고 전리품 1개를 소비하며 보상 구슬 생성 */
  private static rollMercenaryArmoryCashout(
    participant: Participant,
    armoryLoot: number,
    diceCount: number,
    effect: TraitEffectTier | undefined,
    sharedPool: SharedPoolManager
  ): LootOrb[] {
    const orbs: LootOrb[] = [];
    const rolls = Math.min(diceCount, armoryLoot);
    const fiveCostChance = effect?.mercenaryFiveCostUnitChance ?? 0;
    let lootLeft = armoryLoot;

    for (let i = 0; i < rolls; i++) {
      lootLeft -= 1;
      const face = Math.floor(Math.random() * 6) + 1;
      const x = 0.35 + (i % 3) * 0.12;
      const y = 0.48 + (i % 2) * 0.08;

      if (face <= 2) {
        orbs.push(
          DopamineEngine.createLootOrb('GRAY', x, y, `🎲 용병 주사위 ${face}`, {
            gold: 2 + face,
          })
        );
      } else if (face <= 4) {
        orbs.push(
          DopamineEngine.createLootOrb('BLUE', x, y, `🎲 용병 주사위 ${face}`, {
            gold: 3,
            items: [DopamineEngine.randomBaseItem()],
          })
        );
      } else {
        const rewards: LootOrbRewards = {
          gold: 5 + face,
          items: [DopamineEngine.randomBaseItem()],
        };
        if (face === 6) {
          rewards.items = [
            ...(rewards.items ?? []),
            Math.random() < 0.45
              ? DopamineEngine.randomCompletedItem()
              : DopamineEngine.randomBaseItem(),
          ];
        }
        if (fiveCostChance > 0 && Math.random() < fiveCostChance) {
          rewards.units = DopamineEngine.pickAvailableUnitsFromPool(
            sharedPool,
            participant,
            5,
            1
          );
        }
        orbs.push(
          DopamineEngine.createLootOrb(
            face === 6 ? 'GOLD' : 'BLUE',
            x,
            y,
            `🎲 용병 주사위 ${face}`,
            rewards
          )
        );
      }
    }

    // 남은 전리품은 승리 캐시인 시 소멸 (Set 6 무기고 비우기)
    void lootLeft;

    return orbs;
  }

  /**
   * 2) 매 라운드 시작 시 발동하는 증강체 효과 처리
   * - [판도라의 아이템] 보유 시: 벤치 조합 아이템을 랜덤 교체 (단순화).
   */
  public static processRoundStartAugments(
    participant: Participant,
    sharedPool: SharedPoolManager
  ): string[] {
    if (participant.isEliminated) return [];

    const transformLogs: string[] = [];

    if (participant.hasAugmentEffect('PANDORA_S_ITEMS')) {
      const bases = ['SWORD', 'BOW', 'ROD', 'TEAR', 'ARMOR'] as const;
      for (let i = 0; i < participant.itemBench.length; i++) {
        const item = participant.itemBench[i];
        if (!item || (item as string) === 'SWORD') continue;
        participant.itemBench[i] = bases[Math.floor(Math.random() * bases.length)];
        transformLogs.push('🎲 [판도라의 아이템] 대기석 아이템이 변형되었습니다.');
      }
    }

    if (transformLogs.length > 0) {
      participant.lastActionMessage = transformLogs[transformLogs.length - 1];
    }

    return transformLogs;
  }

  /**
   * 몬스터 크립 라운드(1-1, 1-2, 2-5, 3-5 등) 종료 시 기본 전리품 구슬 생성
   */
  public static generateCreepRoundOrbs(
    participant: Participant,
    stageNumber: number,
    sharedPool: SharedPoolManager
  ): LootOrb[] {
    if (participant.isEliminated) return [];

    const orbs: LootOrb[] = [];
    // 기본 회색/파랑 구슬 + 스테이지가 높을수록 황금 구슬 추가
    orbs.push(
      DopamineEngine.createLootOrb(
        'GRAY',
        0.3 + Math.random() * 0.15,
        0.45 + Math.random() * 0.15,
        '크립 전리품',
        {
          gold: 3 + stageNumber * 2,
          items: [DopamineEngine.randomBaseItem()],
        }
      )
    );

    if (stageNumber >= 2) {
      const targetCost: CostTier = stageNumber >= 4 ? 4 : stageNumber >= 3 ? 3 : 2;
      orbs.push(
        DopamineEngine.createLootOrb(
          stageNumber >= 3 ? 'GOLD' : 'BLUE',
          0.55 + Math.random() * 0.2,
          0.45 + Math.random() * 0.15,
          '보너스 전리품',
          {
            gold: 4,
            items: [DopamineEngine.randomBaseItem()],
            units: DopamineEngine.pickAvailableUnitsFromPool(
              sharedPool,
              participant,
              targetCost,
              1
            ),
            duplicators: stageNumber >= 3 && Math.random() < 0.35 ? 1 : 0,
          }
        )
      );
    }

    return orbs;
  }

  /**
   * 전리품 구슬(LootOrb)을 터치하여 오픈했을 때 보상을 참가자에게 실제 지급한다.
   */
  public static claimLootOrb(
    participant: Participant,
    orb: LootOrb,
    sharedPool: SharedPoolManager
  ): string[] {
    const rewardSummary: string[] = [];
    const { rewards } = orb;

    if (rewards.gold && rewards.gold > 0) {
      participant.gold += rewards.gold;
      rewardSummary.push(`+${rewards.gold} 골드`);
    }

    if (rewards.duplicators && rewards.duplicators > 0) {
      participant.duplicators += rewards.duplicators;
      rewardSummary.push(`챔피언 복제기 +${rewards.duplicators}개`);
    }

    if (rewards.items && rewards.items.length > 0) {
      for (const itemId of rewards.items) {
        participant.addItemToBench(itemId);
        const itemName = ITEM_DEFINITIONS[itemId]?.name ?? itemId;
        rewardSummary.push(`[${itemName}]`);
      }
    }

    if (rewards.units && rewards.units.length > 0) {
      for (const unitId of rewards.units) {
        const emptyIdx = participant.bench.findIndex((s) => s === null);
        const canMerge = participant.countUnitsByIdAndStar(unitId, 1) >= 2;

        if ((emptyIdx !== -1 || canMerge) && !participant.hasThreeStarUnit(unitId)) {
          const unit = Participant.createUnitInstance(unitId, 1);
          if (emptyIdx !== -1) {
            participant.bench[emptyIdx] = unit;
          } else {
            // 대기석 만석이지만 즉시 합성 가능한 경우
            participant.bench[0] = unit;
          }
          participant.tryMergeUnits(unitId, sharedPool);
          rewardSummary.push(`${unit.name}(1성)`);
        } else {
          // 대기석이 꽉 차서 기물을 받을 수 없으면 해당 기물 코스트만큼 골드로 환산 지급하고 풀에 반환
          sharedPool.returnUnitToPool(unitId, 1);
          const fallbackGold = UNITS_BY_COST[5].some((u) => u.id === unitId) ? 5 : 3;
          participant.gold += fallbackGold;
          rewardSummary.push(`+${fallbackGold} 골드(대기석 만석 환산)`);
        }
      }
    }

    participant.lastActionMessage = `🎁 구슬 오픈: ${rewardSummary.join(', ')}`;
    return rewardSummary;
  }

  /**
   * 라운드별(2-1: SILVER, 3-2: GOLD, 4-2: PRISMATIC) 증강체 선택 카드 3장을 중복 없이 추첨한다.
   */
  public static rollAugmentChoices(
    participant: Participant,
    tier: AugmentTier,
    excludeIds: string[] = []
  ): AugmentDefinition[] {
    const ownedSet = new Set([...participant.augments, ...excludeIds]);
    const pool = AUGMENT_DEFINITIONS.filter(
      (aug) => aug.tier === tier && !ownedSet.has(aug.id)
    );

    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }

  // ==========================================================================
  // 내부 유틸리티 메서드
  // ==========================================================================

  private static createLootOrb(
    tier: LootOrbTier,
    x: number,
    y: number,
    label: string,
    rewards: LootOrbRewards
  ): LootOrb {
    return {
      id: `orb_${Date.now()}_${globalOrbCounter++}`,
      tier,
      x,
      y,
      label,
      rewards,
    };
  }

  private static randomBaseItem(): ItemId {
    const idx = Math.floor(Math.random() * BASE_ITEM_IDS.length);
    return BASE_ITEM_IDS[idx];
  }

  private static randomCompletedItem(): CompletedItemId {
    const idx = Math.floor(Math.random() * COMPLETED_ITEM_IDS.length);
    return COMPLETED_ITEM_IDS[idx];
  }

  /**
   * 공유 풀에서 재고가 남아있고 참가자가 3성을 보유하지 않은 기물을 우선 추첨하여 예약(-1)한다.
   */
  private static pickAvailableUnitsFromPool(
    sharedPool: SharedPoolManager,
    participant: Participant,
    cost: CostTier,
    count: number
  ): string[] {
    const result: string[] = [];

    for (let i = 0; i < count; i++) {
      const candidates = UNITS_BY_COST[cost].filter(
        (u) =>
          sharedPool.getRemainingCount(u.id) > 0 &&
          !participant.hasThreeStarUnit(u.id)
      );

      if (candidates.length === 0) break;

      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      if (sharedPool.pullSpecificUnitFromPool(chosen.id)) {
        result.push(chosen.id);
      }
    }

    return result;
  }
}
