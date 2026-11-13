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
import { Participant } from './Participant';
import { SharedPoolManager } from './SharedPoolManager';

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
  /** 0~1 정규화 화면 위치 (폴백 / 고블린 금고용) */
  x: number;
  y: number;
  /** 크립 처치 헥스 — 있으면 보드 위 몬스터 위치에서 튀어나온 것처럼 배치 */
  hexRow?: number;
  hexCol?: number;
  label?: string;
  rewards: LootOrbRewards;
}

const COMPLETED_ITEM_IDS: CompletedItemId[] = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.isCompleted)
  .map((item) => item.id as CompletedItemId);

let globalOrbCounter = 1;

export class DopamineEngine {
  /**
   * 1) 황금 고블린(GOLDEN_GOBLIN) 연패 코인 & 캐시아웃(Cash-out) 처리
   * - activeGoblinCount >= 3 일 때 작동.
   * - 전투 패배 시: 기본 +4 스택 + (현재 연패 수 * 2) 스택 추가 (5고블린이면 획득량 2배).
   * - 전투 승리 시(didWinCombat === true && goblinVaultStacks > 0):
   *   누적된 goblinVaultStacks 구간(1~9, 10+, 25+, 45+, 70+, 100+)에 따라 폭발적인 보상이 담긴
   *   LootOrb[]를 생성하여 반환하고 goblinVaultStacks = 0으로 초기화한다.
   */
  public static processGoldenGoblinTrait(
    participant: Participant,
    activeGoblinCount: number,
    didWinCombat: boolean,
    sharedPool: SharedPoolManager
  ): LootOrb[] {
    if (participant.isEliminated) return [];

    // 1. 전투 패배 시: 황금 고블린 3시너지 이상 활성화 중이면 금고 스택 축적
    if (!didWinCombat) {
      if (activeGoblinCount >= 3) {
        const baseGain = 4 + participant.loseStreak * 2;
        const multiplier =
          activeGoblinCount >= 7 ? 4 : activeGoblinCount >= 5 ? 2 : 1;
        const totalGain = baseGain * multiplier;
        participant.goblinVaultStacks += totalGain;
        participant.lastActionMessage = `🪙 [황금 고블린 금고] 패배 스택 +${totalGain} 축적! (현재 총 ${participant.goblinVaultStacks} 스택)`;
      }
      return [];
    }

    // 2. 전투 승리 시: 누적된 금고 스택이 있으면 즉시 금고 폭발(Cash-out)!
    if (didWinCombat && participant.goblinVaultStacks > 0 && activeGoblinCount >= 3) {
      const stacks = participant.goblinVaultStacks;
      participant.goblinVaultStacks = 0;

      const orbs = DopamineEngine.buildGoblinCashoutOrbs(
        participant,
        stacks,
        sharedPool
      );

      participant.lastActionMessage = `💥 [황금 고블린 금고 대폭발!] ${stacks} 스택 캐시아웃! 전리품 구슬 ${orbs.length}개 드랍!`;
      return orbs;
    }

    return [];
  }

  /**
   * 누적 금고 스택 구간별 초호화 캐시아웃 전리품 구슬 생성
   */
  private static buildGoblinCashoutOrbs(
    participant: Participant,
    stacks: number,
    sharedPool: SharedPoolManager
  ): LootOrb[] {
    const orbs: LootOrb[] = [];

    if (stacks >= 100) {
      // 100+ 스택: 프리즘 구슬 3개 (총 60골드 + 완성 아이템 3개 + 챔피언 복제기 3개 + 5코스트 전설 기물 3기)
      orbs.push(
        DopamineEngine.createLootOrb('PRISMATIC', 0.25, 0.55, '👑 100+ 잭팟 금고 I', {
          gold: 25,
          items: [DopamineEngine.randomCompletedItem(), DopamineEngine.randomCompletedItem()],
          duplicators: 2,
        }),
        DopamineEngine.createLootOrb('PRISMATIC', 0.5, 0.5, '👑 100+ 잭팟 금고 II', {
          gold: 20,
          items: [DopamineEngine.randomCompletedItem()],
          units: DopamineEngine.pickAvailableUnitsFromPool(sharedPool, participant, 5, 2),
        }),
        DopamineEngine.createLootOrb('PRISMATIC', 0.75, 0.55, '👑 100+ 잭팟 금고 III', {
          gold: 15,
          duplicators: 1,
          units: DopamineEngine.pickAvailableUnitsFromPool(sharedPool, participant, 5, 1),
        })
      );
    } else if (stacks >= 70) {
      // 70~99 스택: 완성 아이템 2개 + 챔피언 복제기 1~2개 + 5코스트 기물 + 30골드 도파민 대폭발
      orbs.push(
        DopamineEngine.createLootOrb('PRISMATIC', 0.35, 0.52, '💎 70+ 프리즘 금고 I', {
          gold: 18,
          items: [DopamineEngine.randomCompletedItem(), DopamineEngine.randomCompletedItem()],
          duplicators: 1,
        }),
        DopamineEngine.createLootOrb('GOLD', 0.65, 0.52, '🪙 70+ 황금 금고 II', {
          gold: 12,
          duplicators: 1,
          units: DopamineEngine.pickAvailableUnitsFromPool(sharedPool, participant, 5, 1),
        })
      );
    } else if (stacks >= 45) {
      // 45~69 스택: 완성 아이템 1개 + 기본 아이템 1개 + 챔피언 복제기 1개 + 4코스트 2기 + 20골드
      orbs.push(
        DopamineEngine.createLootOrb('GOLD', 0.38, 0.54, '🪙 45+ 황금 금고 I', {
          gold: 12,
          items: [DopamineEngine.randomCompletedItem(), DopamineEngine.randomBaseItem()],
        }),
        DopamineEngine.createLootOrb('GOLD', 0.62, 0.54, '🪙 45+ 황금 금고 II', {
          gold: 8,
          duplicators: 1,
          units: DopamineEngine.pickAvailableUnitsFromPool(sharedPool, participant, 4, 2),
        })
      );
    } else if (stacks >= 25) {
      // 25~44 스택: 완성 아이템 1개 + 4코스트 1기 + 14골드
      orbs.push(
        DopamineEngine.createLootOrb('GOLD', 0.42, 0.55, '🪙 25+ 황금 금고', {
          gold: 14,
          items: [DopamineEngine.randomCompletedItem()],
          units: DopamineEngine.pickAvailableUnitsFromPool(sharedPool, participant, 4, 1),
        }),
        DopamineEngine.createLootOrb('BLUE', 0.6, 0.58, '🔹 보너스 구슬', {
          items: [DopamineEngine.randomBaseItem()],
        })
      );
    } else if (stacks >= 10) {
      // 10~24 스택: 기본 아이템 1개 + 3코스트 1기 + 10골드
      orbs.push(
        DopamineEngine.createLootOrb('BLUE', 0.48, 0.55, '🔹 10+ 고블린 금고', {
          gold: 10,
          items: [DopamineEngine.randomBaseItem()],
          units: DopamineEngine.pickAvailableUnitsFromPool(sharedPool, participant, 3, 1),
        })
      );
    } else {
      // 1~9 스택: 소형 금고 (6골드 + 기본 아이템 1개)
      orbs.push(
        DopamineEngine.createLootOrb('GRAY', 0.5, 0.55, '⚪ 소형 고블린 금고', {
          gold: 6,
          items: [DopamineEngine.randomBaseItem()],
        })
      );
    }

    return orbs;
  }

  /**
   * 2) 매 라운드 시작 시 발동하는 증강체 효과 처리
   * - [판도라의 대기석(AUG_PANDORA_BENCH)] 보유 시:
   *   매 라운드 시작마다 bench[6], bench[7], bench[8] (우측 3칸)에 있는 기물을 공유 풀에 반환하고,
   *   동일한 코스트와 성급의 다른 기물을 공유 풀에서 추첨해 변환한 뒤 tryMergeUnits를 호출한다.
   */
  public static processRoundStartAugments(
    participant: Participant,
    sharedPool: SharedPoolManager
  ): string[] {
    if (participant.isEliminated) return [];

    const transformLogs: string[] = [];

    if (participant.augments.includes('AUG_PANDORA_BENCH')) {
      const pandoraIndices = [6, 7, 8];

      for (const slotIdx of pandoraIndices) {
        const currentUnit = participant.bench[slotIdx];
        if (!currentUnit) continue;

        const oldName = currentUnit.name;
        const starLevel = currentUnit.starLevel;
        const preservedItems = [...currentUnit.items];

        // 공유 풀에 기존 기물(1성=1, 2성=3, 3성=9)을 반환하고 같은 코스트의 다른 기물 ID를 추첨
        const newUnitId = sharedPool.transformUnitInPool(
          participant,
          currentUnit.unitId,
          starLevel
        );

        if (newUnitId !== currentUnit.unitId) {
          const transformedUnit = Participant.createUnitInstance(
            newUnitId,
            starLevel,
            preservedItems
          );
          participant.bench[slotIdx] = transformedUnit;

          transformLogs.push(
            `🎲 [판도라의 대기석] ${oldName}(${starLevel}성) ➔ ${transformedUnit.name}(${starLevel}성) 변신!`
          );

          // 변신 직후 보드/대기석의 동일 기물과 2성/3성 합성이 가능한지 즉시 체크
          participant.tryMergeUnits(newUnitId, sharedPool);
        }
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
