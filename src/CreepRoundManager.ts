// src/CreepRoundManager.ts

import { createCreepMonsterInstance } from './CreepMonsterData';
import { LootOrb, LootOrbTier } from './DopamineEngine';
import {
  BASE_ITEM_IDS,
  CompletedItemId,
  ITEM_DEFINITIONS,
  ItemId,
} from './GameData';
import { RoundType } from './GameLoopManager';
import { Participant } from './Participant';

const COMPLETED_ITEM_IDS: CompletedItemId[] = Object.values(ITEM_DEFINITIONS)
  .filter((item) => item.isCompleted)
  .map((item) => item.id as CompletedItemId);

export interface CreepEquityQuota {
  roundStr: string;
  baseItemCount: number;
  completedItemCount: number;
  targetGoldValue: number;
  grantsDuplicator: boolean;
}

/**
 * 크립 라운드 전용 몬스터 배치 및 8인 전리품 가치 공정성(Loot Equity Rule) 매니저:
 * 1) 1스테이지('1-1', '1-2') 초반 크립 라운드를 매우 쉬운('Easy') 난이도로 구성하여
 *    레벨 1의 약한 1코스트 1성 기물 1~2마리만으로도 100% 완승을 거두게 한다.
 * 2) 크립 처치 시 전장에 단순 텍스트 알약이 아닌 `?` (황금/푸른 미스터리 보물상자) 및
 *    `!` (보라/프리즘 대박 미스터리 보물상자)를 드랍한다.
 * 3) Loot Equity Rule: 매 크립 라운드마다 플레이어와 7명의 AI 봇 모두가 획득하는
 *    총 아이템 개수와 골드 환산 가치를 공정하게(오차 ±1 이내) 동기화하여 억울한 운빨 격차를 방지한다.
 */
export class CreepRoundManager {
  private static orbCounter = 1;

  /**
   * 라운드별 전용 야생 몬스터/동물 크립 상대 보드를 생성한다.
   */
  public static createCreepOpponentForRound(
    roundStr: string,
    roundType: RoundType
  ): Participant {
    const labelMap: Record<string, string> = {
      '1-1': '👾 들판 미니언 정찰대 (Lv.Easy)',
      '1-2': '🍄 독성 포자 숲 정령 (Lv.Easy)',
      '2-5': '🪨 바위산 돌거북 골렘 군락',
      '3-5': '🐺 어스름 송곳니 늑대 무리',
      '4-5': '🦅 붉은 벼슬 칼날부리 둥지',
      '5-5': '🐲 고대 화염 드래곤 둥지',
    };

    const creepTitle =
      labelMap[roundStr] ??
      (roundType === 'BOSS_CREEP'
        ? `👾 [${roundStr}] 심연의 공허 대괴수`
        : `🐺 [${roundStr}] 야생 몬스터 무리`);

    const creepBot = new Participant(
      `creep_${roundStr}`,
      creepTitle,
      true,
      null
    );

    if (roundStr === '1-1') {
      // 1-1: 매우 약한 미니언 포식자 2마리 (아무 1코스트 1성 1마리로도 가볍게 압살 가능)
      creepBot.board[0][2] = createCreepMonsterInstance(
        'creep_minion_scavenger',
        1,
        0.9,
        0.9
      );
      creepBot.board[0][4] = createCreepMonsterInstance(
        'creep_minion_scavenger',
        1,
        0.9,
        0.9
      );
    } else if (roundStr === '1-2') {
      // 1-2: 미니언 포식자 2마리 + 독성 숲 포자 정령 1마리 (여전히 매우 쉬운 난이도)
      creepBot.board[0][2] = createCreepMonsterInstance(
        'creep_minion_scavenger',
        1,
        1.0,
        0.95
      );
      creepBot.board[0][4] = createCreepMonsterInstance(
        'creep_minion_scavenger',
        1,
        1.0,
        0.95
      );
      creepBot.board[1][3] = createCreepMonsterInstance(
        'creep_toxic_sprite',
        1,
        1.0,
        0.95
      );
    } else if (roundStr === '2-5') {
      // 2-5: 단단한 바위산 돌거북 골렘 3마리
      creepBot.board[0][1] = createCreepMonsterInstance(
        'creep_stone_golem',
        1,
        1.0,
        1.0
      );
      creepBot.board[0][3] = createCreepMonsterInstance(
        'creep_stone_golem',
        2,
        0.95,
        0.95
      );
      creepBot.board[0][5] = createCreepMonsterInstance(
        'creep_stone_golem',
        1,
        1.0,
        1.0
      );
    } else if (roundStr === '3-5') {
      // 3-5: 빠른 공격 속도로 덮치는 어스름 송곳니 늑대 4마리
      creepBot.board[0][3] = createCreepMonsterInstance(
        'creep_wild_wolf',
        2,
        1.0,
        1.0
      );
      creepBot.board[1][1] = createCreepMonsterInstance(
        'creep_wild_wolf',
        1,
        1.0,
        1.0
      );
      creepBot.board[1][3] = createCreepMonsterInstance(
        'creep_wild_wolf',
        1,
        1.0,
        1.0
      );
      creepBot.board[1][5] = createCreepMonsterInstance(
        'creep_wild_wolf',
        1,
        1.0,
        1.0
      );
    } else if (roundStr === '4-5') {
      // 4-5: 붉은 벼슬 칼날부리 우두머리와 무리 5마리
      creepBot.board[0][3] = createCreepMonsterInstance(
        'creep_razor_beak',
        2,
        1.15,
        1.1
      );
      creepBot.board[1][1] = createCreepMonsterInstance(
        'creep_razor_beak',
        1,
        1.05,
        1.05
      );
      creepBot.board[1][2] = createCreepMonsterInstance(
        'creep_razor_beak',
        1,
        1.05,
        1.05
      );
      creepBot.board[1][4] = createCreepMonsterInstance(
        'creep_razor_beak',
        1,
        1.05,
        1.05
      );
      creepBot.board[1][5] = createCreepMonsterInstance(
        'creep_razor_beak',
        1,
        1.05,
        1.05
      );
    } else if (roundStr === '5-5') {
      // 5-5: 고대 잿빛 화염 드래곤 보스 + 호위 골렘 2마리
      creepBot.board[0][2] = createCreepMonsterInstance(
        'creep_stone_golem',
        2,
        1.15,
        1.1
      );
      creepBot.board[0][4] = createCreepMonsterInstance(
        'creep_stone_golem',
        2,
        1.15,
        1.1
      );
      creepBot.board[1][3] = createCreepMonsterInstance(
        'creep_ancient_dragon',
        2,
        1.15,
        1.15
      );
    } else {
      // 6-5 이후 초고난도 보스: 심연의 공허 대괴수 + 고대 화염 드래곤 쌍보스
      const stageNum = parseInt(roundStr.split('-')[0] || '6', 10);
      const scale = 1.0 + Math.max(0, stageNum - 5) * 0.25;
      creepBot.board[0][3] = createCreepMonsterInstance(
        'creep_void_behemoth',
        2,
        scale,
        scale
      );
      creepBot.board[1][1] = createCreepMonsterInstance(
        'creep_ancient_dragon',
        2,
        scale * 0.9,
        scale * 0.9
      );
      creepBot.board[1][5] = createCreepMonsterInstance(
        'creep_ancient_dragon',
        2,
        scale * 0.9,
        scale * 0.9
      );
    }

    return creepBot;
  }

  /**
   * 8인 전리품 공정성 보장 법칙 (Loot Equity Rule):
   * 해당 크립 라운드에서 모든 참가자(플레이어 + 7 AI 봇)가 동일하게 보장받는 기준 전리품 쿼터를 산출한다.
   */
  public static getRoundEquityQuota(
    roundStr: string,
    roundType: RoundType
  ): CreepEquityQuota {
    if (roundStr === '1-1') {
      return {
        roundStr,
        baseItemCount: 1,
        completedItemCount: 0,
        targetGoldValue: 3,
        grantsDuplicator: false,
      };
    }
    if (roundStr === '1-2') {
      return {
        roundStr,
        baseItemCount: 1,
        completedItemCount: 0,
        targetGoldValue: 4,
        grantsDuplicator: false,
      };
    }
    if (roundStr === '2-5') {
      return {
        roundStr,
        baseItemCount: 2,
        completedItemCount: 0,
        targetGoldValue: 5,
        grantsDuplicator: false,
      };
    }
    if (roundStr === '3-5') {
      return {
        roundStr,
        baseItemCount: 2,
        completedItemCount: 0,
        targetGoldValue: 7,
        grantsDuplicator: true,
      };
    }
    if (roundStr === '4-5') {
      return {
        roundStr,
        baseItemCount: 2,
        completedItemCount: 1,
        targetGoldValue: 8,
        grantsDuplicator: false,
      };
    }
    if (roundType === 'BOSS_CREEP') {
      return {
        roundStr,
        baseItemCount: 1,
        completedItemCount: 2,
        targetGoldValue: 11,
        grantsDuplicator: true,
      };
    }
    return {
      roundStr,
      baseItemCount: 1,
      completedItemCount: 0,
      targetGoldValue: 4,
      grantsDuplicator: false,
    };
  }

  /**
   * 플레이어에게는 전장 위에 터치해서 열 수 있는 `?` / `!` 미스터리 박스(LootOrb[])를 생성하고,
   * 7명의 AI 봇들에게는 정확히 동일한 총 아이템 개수 및 골드 가치(오차 ±1골드 이내)의 전리품을 즉시 지급한다.
   */
  public static distributeEquityCreepLoot(
    roundStr: string,
    roundType: RoundType,
    player: Participant,
    aiBots: Participant[],
    deathHexes: Array<{ row: number; col: number }> = []
  ): LootOrb[] {
    const quota = this.getRoundEquityQuota(roundStr, roundType);

    // 1. 7명의 AI 봇에게 공정 쿼터(아이템 수 100% 동일, 골드 ±1 이내) 즉시 분배
    for (const bot of aiBots) {
      if (bot.isEliminated) continue;

      const botGoldVariance = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
      const botGoldReward = Math.max(2, quota.targetGoldValue + botGoldVariance);
      bot.gold += botGoldReward;

      for (let i = 0; i < quota.baseItemCount; i++) {
        bot.addItemToBench(this.pickRandomItem(BASE_ITEM_IDS));
      }
      for (let i = 0; i < quota.completedItemCount; i++) {
        bot.addItemToBench(this.pickRandomItem(COMPLETED_ITEM_IDS));
      }
      if (quota.grantsDuplicator) {
        bot.duplicators += 1;
      }
    }

    // 2. 플레이어용 `?` / `!` 상자 — 죽은 몬스터 헥스에서 튀어나오듯 산란
    if (player.isEliminated) return [];

    const spawnSites = this.buildLootSpawnSites(deathHexes);
    const playerOrbs: LootOrb[] = [];
    const totalGold = Math.max(
      2,
      quota.targetGoldValue + (Math.random() < 0.5 ? 0 : 1)
    );
    const firstBoxGold = Math.ceil(totalGold * 0.55);
    const secondBoxGold = Math.max(1, totalGold - firstBoxGold);

    const box1Items: ItemId[] = [];
    if (quota.baseItemCount >= 1) {
      box1Items.push(this.pickRandomItem(BASE_ITEM_IDS));
    }
    playerOrbs.push(
      this.createMysteryBoxOrb(
        'BLUE',
        '? 미스터리 상자',
        firstBoxGold,
        box1Items,
        0,
        spawnSites[0]
      )
    );

    const box2Items: ItemId[] = [];
    for (let i = 1; i < quota.baseItemCount; i++) {
      box2Items.push(this.pickRandomItem(BASE_ITEM_IDS));
    }
    playerOrbs.push(
      this.createMysteryBoxOrb(
        'GOLD',
        '? 황금 미스터리 상자',
        secondBoxGold,
        box2Items,
        0,
        spawnSites[1] ?? spawnSites[0]
      )
    );

    if (quota.completedItemCount > 0 || quota.grantsDuplicator) {
      const highTierItems: ItemId[] = [];
      for (let i = 0; i < quota.completedItemCount; i++) {
        highTierItems.push(this.pickRandomItem(COMPLETED_ITEM_IDS));
      }
      playerOrbs.push(
        this.createMysteryBoxOrb(
          'PRISMATIC',
          '! 대박 유물 상자',
          0,
          highTierItems,
          quota.grantsDuplicator ? 1 : 0,
          spawnSites[2] ?? spawnSites[0]
        )
      );
    }

    return playerOrbs;
  }

  /** 죽은 몬스터 위치 우선, 부족하면 적진(0~3행) 랜덤 헥스 */
  private static buildLootSpawnSites(
    deathHexes: Array<{ row: number; col: number }>
  ): Array<{ row: number; col: number }> {
    const sites = deathHexes
      .filter((h) => h.row >= 0 && h.row < 8 && h.col >= 0 && h.col < 7)
      .map((h) => ({ row: h.row, col: h.col }));

    // 셔플
    for (let i = sites.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sites[i], sites[j]] = [sites[j], sites[i]];
    }

    while (sites.length < 3) {
      sites.push({
        row: Math.floor(Math.random() * 4),
        col: Math.floor(Math.random() * 7),
      });
    }
    return sites;
  }

  private static createMysteryBoxOrb(
    tier: LootOrbTier,
    label: string,
    gold: number,
    items: ItemId[],
    duplicators: number,
    site: { row: number; col: number }
  ): LootOrb {
    // 헥스 중심 기준 ±이웃 칸 산란 (고정 좌표 탈피)
    const scatterRow = Math.max(
      0,
      Math.min(7, site.row + Math.round((Math.random() - 0.5) * 2))
    );
    const scatterCol = Math.max(
      0,
      Math.min(6, site.col + Math.round((Math.random() - 0.5) * 2))
    );
    const x = (scatterCol + 0.5 + (Math.random() - 0.5) * 0.35) / 7;
    const y = (scatterRow + 0.5 + (Math.random() - 0.5) * 0.35) / 8;
    return {
      id: `mystery_box_${Date.now()}_${this.orbCounter++}`,
      tier,
      x: Math.min(0.88, Math.max(0.12, x)),
      y: Math.min(0.72, Math.max(0.08, y)),
      hexRow: scatterRow,
      hexCol: scatterCol,
      label,
      rewards: {
        gold,
        items,
        duplicators,
        units: [],
      },
    };
  }

  private static pickRandomItem(list: ItemId[]): ItemId {
    return list[Math.floor(Math.random() * list.length)];
  }
}
