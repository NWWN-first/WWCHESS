// src/AIBotController.ts

import { DopamineEngine } from './DopamineEngine';
import {
  AUGMENT_DEFINITIONS,
  AugmentDefinition,
  AugmentTier,
  BaseItemId,
  CompletedItemId,
  ITEM_DEFINITIONS,
  ItemId,
  TraitId,
  UNIT_TEMPLATES,
  UnitTemplate,
  combineBaseItems,
  getRecipeForCompletedItem,
  getUnitRecommendedItems,
} from './GameData';
import { AIPersona, Participant, UnitInstance } from './Participant';
import { AISkillParameters, RankManager } from './RankManager';
import { SharedPoolManager } from './SharedPoolManager';
import { SynergyEngine } from './SynergyEngine';

export interface BotBrainState {
  botId: string;
  persona: AIPersona;
  targetTrait: TraitId;
  secondaryTrait: TraitId;
  heroTargetUnitId?: string;
  deniedUnitInstanceIds: Set<string>;
  pivotedCount: number;
  isRolldownActive: boolean;
  nextActionDelayMs: number;
  rerollsExecutedThisRound: number;
  maxRerollsAllowedThisRound: number;
  targetGoldFloorThisRound: number;
  unitsToDenyCache: Set<string>;
}


const STANDARD_ORIGIN_TRAITS: TraitId[] = [
  'HOLY_EMPIRE',
  'ABYSSAL_DEMON',
  'ELVEN_SYLVAN',
  'DRAGONKIN',
  'UNDEAD_SCOURGE',
  'ARCANE_TOWER',
];

export type UnitRole = 'TANK' | 'AD_CARRY' | 'AP_CARRY' | 'BRUISER';

export function getUnitRole(unitId: string): UnitRole {
  const template = UNIT_TEMPLATES[unitId];
  if (!template) return 'BRUISER';

  if (
    template.traits.includes('VANGUARD') ||
    template.traits.includes('PALADIN') ||
    (template.stats.def >= 40 && template.stats.range === 1)
  ) {
    if (
      template.traits.includes('SHADOW_ASSASSIN') ||
      template.traits.includes('BERSERKER')
    ) {
      return 'BRUISER';
    }
    return 'TANK';
  }

  if (
    template.traits.includes('ARCHMAGE') ||
    template.traits.includes('ARCANE_TOWER')
  ) {
    return 'AP_CARRY';
  }

  if (
    template.traits.includes('RANGER') ||
    template.traits.includes('SHADOW_ASSASSIN')
  ) {
    return 'AD_CARRY';
  }

  if (template.traits.includes('BERSERKER') || template.stats.range === 1) {
    return 'BRUISER';
  }

  return 'AD_CARRY';
}

export interface ScoutingContext {
  opponentHighHpCount: number;
  opponentHealShieldTraits: number;
  opponentVanguardCount: number;
  opponentMagicCount: number;
  traitContestedMap: Map<TraitId, number>;
}

export interface AIStateTensor {
  hpRatio: number;
  goldNorm: number;
  levelNorm: number;
  stageNorm: number;
  benchUnitsRatio: number;
  itemBenchRatio: number;
  boardPowerNorm: number;
  winStreakNorm: number;
  lossStreakNorm: number;
  contestedTraitRatio: number;
  emergencyFlag: number;
  features: number[];
}

const ITEM_ROLE_AFFINITY: Record<CompletedItemId, Record<UnitRole, number>> = {
  INFINITY_EDGE: { TANK: 10, AD_CARRY: 95, AP_CARRY: 30, BRUISER: 80 },
  GIANT_SLAYER: { TANK: 15, AD_CARRY: 90, AP_CARRY: 65, BRUISER: 75 },
  HEXTECH_GUNBLADE: { TANK: 35, AD_CARRY: 60, AP_CARRY: 95, BRUISER: 80 },
  SPEAR_OF_SHOJIN: { TANK: 20, AD_CARRY: 50, AP_CARRY: 95, BRUISER: 40 },
  BLOODTHIRSTER: { TANK: 60, AD_CARRY: 75, AP_CARRY: 35, BRUISER: 95 },
  RAPID_FIRECANNON: { TANK: 10, AD_CARRY: 90, AP_CARRY: 40, BRUISER: 60 },
  GUINSOOS_RAGEBLADE: { TANK: 20, AD_CARRY: 95, AP_CARRY: 70, BRUISER: 80 },
  STATIKK_SHIV: { TANK: 30, AD_CARRY: 80, AP_CARRY: 85, BRUISER: 70 },
  TITANS_RESOLVE: { TANK: 85, AD_CARRY: 50, AP_CARRY: 40, BRUISER: 95 },
  RABADONS_DEATHCAP: { TANK: 10, AD_CARRY: 20, AP_CARRY: 100, BRUISER: 40 },
  ARCHANGELS_STAFF: { TANK: 25, AD_CARRY: 20, AP_CARRY: 95, BRUISER: 45 },
  SUNFIRE_CAPE: { TANK: 95, AD_CARRY: 20, AP_CARRY: 30, BRUISER: 80 },
  BLUE_BUFF: { TANK: 20, AD_CARRY: 30, AP_CARRY: 95, BRUISER: 40 },
  PROTECTORS_VOW: { TANK: 100, AD_CARRY: 15, AP_CARRY: 20, BRUISER: 75 },
  BRAMBLE_VEST: { TANK: 100, AD_CARRY: 10, AP_CARRY: 10, BRUISER: 70 },
};

const BOT_PRESETS: Array<{ name: string; persona: AIPersona; initialTrait: TraitId }> = [
  { name: '봇1 [도박꾼 잭]', persona: 'HYPER_ROLLER', initialTrait: 'UNDEAD_SCOURGE' },
  { name: '봇2 [리롤왕 볼트]', persona: 'HYPER_ROLLER', initialTrait: 'ELVEN_SYLVAN' },
  { name: '봇3 [황금충 고블]', persona: 'GOBLIN_GAMBLER', initialTrait: 'GOLDEN_GOBLIN' },
  { name: '봇4 [만수르 골드]', persona: 'FAST_NINE_GREEDY', initialTrait: 'DRAGONKIN' },
  { name: '봇5 [패스트9 황제]', persona: 'FAST_NINE_GREEDY', initialTrait: 'HOLY_EMPIRE' },
  { name: '봇6 [정석 마스터 린]', persona: 'FLEX_MASTER', initialTrait: 'ARCANE_TOWER' },
  { name: '봇7 [유연한 카이]', persona: 'FLEX_MASTER', initialTrait: 'ABYSSAL_DEMON' },
];

const DEFENSIVE_ITEM_IDS = new Set<ItemId>([
  'ARMOR',
  'BRAMBLE_VEST',
  'SUNFIRE_CAPE',
  'PROTECTORS_VOW',
  'TITANS_RESOLVE',
]);

export class AIBotController {
  private rankManager: RankManager;
  private botBrains: Map<string, BotBrainState> = new Map();

  constructor(rankManager: RankManager) {
    this.rankManager = rankManager;
  }

  /**
   * 게임 시작 시 7명의 AI 봇 참가자를 생성하고 4가지 인간형 페르소나를 골고루 배정한다.
   */
  public createSevenAIBots(): Participant[] {
    this.botBrains.clear();
    // 매 게임마다 프리셋 순서를 약간 섞어 다양한 봇 매치업 유도
    const shuffledPresets = [...BOT_PRESETS].sort(() => Math.random() - 0.5);

    return shuffledPresets.map((preset, idx) => {
      const botId = `ai_bot_${idx + 1}`;
      const bot = new Participant(botId, preset.name, true, preset.persona);
      this.initializeBotBrain(bot, preset.persona, preset.initialTrait);
      return bot;
    });
  }

  /**
   * 이미 생성된 7명의 AI 봇 배열에 페르소나와 초기 두뇌 상태를 배정한다.
   */
  public assignPersonasToBots(bots: Participant[]): void {
    this.botBrains.clear();
    const personas: AIPersona[] = [
      'HYPER_ROLLER',
      'HYPER_ROLLER',
      'FAST_NINE_GREEDY',
      'FAST_NINE_GREEDY',
      'GOBLIN_GAMBLER',
      'FLEX_MASTER',
      'FLEX_MASTER',
    ];

    bots.forEach((bot, idx) => {
      const persona = personas[idx % personas.length];
      bot.persona = persona;
      const initialTrait: TraitId =
        persona === 'GOBLIN_GAMBLER'
          ? 'GOLDEN_GOBLIN'
          : STANDARD_ORIGIN_TRAITS[idx % STANDARD_ORIGIN_TRAITS.length];
      this.initializeBotBrain(bot, persona, initialTrait);
    });
  }

  private initializeBotBrain(
    bot: Participant,
    persona: AIPersona,
    initialTrait: TraitId
  ): BotBrainState {
    const secondaryTrait: TraitId =
      initialTrait === 'HOLY_EMPIRE'
        ? 'VANGUARD'
        : initialTrait === 'ARCANE_TOWER'
        ? 'ARCHMAGE'
        : initialTrait === 'ELVEN_SYLVAN'
        ? 'RANGER'
        : initialTrait === 'UNDEAD_SCOURGE'
        ? 'SHADOW_ASSASSIN'
        : initialTrait === 'GOLDEN_GOBLIN'
        ? 'BERSERKER'
        : 'PALADIN';

    const state: BotBrainState = {
      botId: bot.id,
      persona,
      targetTrait: initialTrait,
      secondaryTrait,
      deniedUnitInstanceIds: new Set<string>(),
      pivotedCount: 0,
      isRolldownActive: false,
      nextActionDelayMs: 900,
      rerollsExecutedThisRound: 0,
      maxRerollsAllowedThisRound: 6,
      targetGoldFloorThisRound: 20,
      unitsToDenyCache: new Set<string>(),
    };
    this.botBrains.set(bot.id, state);
    return state;
  }

  private getOrCreateBrain(bot: Participant): BotBrainState {
    let brain = this.botBrains.get(bot.id);
    if (!brain) {
      const persona = bot.persona ?? 'FLEX_MASTER';
      const trait: TraitId =
        persona === 'GOBLIN_GAMBLER' ? 'GOLDEN_GOBLIN' : 'HOLY_EMPIRE';
      brain = this.initializeBotBrain(bot, persona, trait);
    }
    return brain;
  }

  /**
   * 정비 페이즈 진입 시 7명 AI 봇의 실시간 동적 APM(평상시 1.0~5.0초 간격 vs 올인 Rolldown 시 0.6~1.0초 초고속 다다다다 리롤) 스케줄러를 초기화한다.
   */
  public prepareBotForRealTimePrep(
    bot: Participant,
    allParticipants: Participant[],
    sharedPool: SharedPoolManager,
    currentRound: string
  ): void {
    if (bot.isEliminated) return;

    const brain = this.getOrCreateBrain(bot);
    const aiParams = this.rankManager.getAISkillParameters();

    // 1. 라운드 시작 정찰(Scouting) 및 덱 전환(Pivot)
    brain.unitsToDenyCache = this.performScoutingAndPivot(
      bot,
      brain,
      allParticipants,
      sharedPool,
      aiParams
    );

    const persona = brain.persona;
    const stageNum = parseInt(currentRound.split('-')[0] || '1', 10);
    const isEmergencySurvival = bot.hp <= 30;
    const isGoblinCashoutTurn =
      persona === 'GOBLIN_GAMBLER' &&
      (bot.hp <= 35 || bot.goblinVaultStacks >= 55);
    const isHighStageAllIn =
      (stageNum >= 4 && bot.gold >= 40) || bot.gold >= 50;

    brain.isRolldownActive =
      isEmergencySurvival || isGoblinCashoutTurn || isHighStageAllIn;
    brain.rerollsExecutedThisRound = 0;

    brain.targetGoldFloorThisRound = this.getPersonaGoldFloor(
      bot,
      persona,
      isEmergencySurvival,
      isGoblinCashoutTurn,
      aiParams
    );

    if (isEmergencySurvival || isGoblinCashoutTurn) {
      brain.maxRerollsAllowedThisRound = 20;
    } else if (brain.isRolldownActive) {
      brain.maxRerollsAllowedThisRound = 14;
    } else if (
      (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') &&
      bot.level >= 5 &&
      bot.level <= 6
    ) {
      brain.maxRerollsAllowedThisRound = 12;
    } else if (
      (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') &&
      bot.level < 8
    ) {
      brain.maxRerollsAllowedThisRound = bot.freeRerolls > 0 ? bot.freeRerolls : 1;
    } else {
      brain.maxRerollsAllowedThisRound = 7;
    }

    // 2. 현재 열린 첫 상점에서 유효 기물 즉시 구매 및 기본 배치 수행
    const scouting = this.analyzeScoutingContext(bot, allParticipants);
    this.buyDesirableUnitsFromCurrentShop(
      bot,
      brain,
      brain.unitsToDenyCache,
      sharedPool,
      aiParams,
      scouting
    );
    this.performPersonaLevelUpStep(bot, brain, currentRound);
    this.tryUseBotDuplicators(bot, brain, sharedPool);

    this.optimizeBoardAndItems(bot, brain, allParticipants, sharedPool, aiParams);

    // 3. 첫 번째 동적 APM 행동 타이머 설정 (올인 Rolldown: 0.6~1.0초, 평상시: 1.0~5.0초)
    brain.nextActionDelayMs = this.computeNextBotActionDelayMs(brain.isRolldownActive);
  }

  /**
   * 정비 페이즈 실시간 카운트다운 중 매 틱(200ms)마다 호출되어
   * AI 봇이 진짜 사람처럼 천천히(1~5초) 또는 초고속 올인 롤다운(0.6~1.0초 '다다다다')으로
   * 상점 리롤, 기물 매수, 배치 수정을 수행한다.
   */
  public stepBotRealTimeAPM(
    bot: Participant,
    deltaMs: number,
    allParticipants: Participant[],
    sharedPool: SharedPoolManager,
    currentRound: string
  ): boolean {
    if (bot.isEliminated) return false;
    const brain = this.getOrCreateBrain(bot);

    brain.nextActionDelayMs -= deltaMs;
    if (brain.nextActionDelayMs > 0) {
      return false;
    }

    const aiParams = this.rankManager.getAISkillParameters();
    const stageNum = parseInt(currentRound.split('-')[0] || '1', 10);
    const isEmergencySurvival = bot.hp <= 30;
    const isGoblinCashoutTurn =
      brain.persona === 'GOBLIN_GAMBLER' &&
      (bot.hp <= 35 || bot.goblinVaultStacks >= 55);

    brain.isRolldownActive =
      isEmergencySurvival ||
      isGoblinCashoutTurn ||
      (bot.gold >= 50 && bot.level >= 8) ||
      (stageNum >= 4 && bot.hp <= 40);

    // 올인 상태일 때는 하한선을 비상용 0G 또는 10G로 동적 하향하여 '다다다다' 리롤이 실제로 동작하도록 보장!
    const effectiveGoldFloor = brain.isRolldownActive
      ? (isEmergencySurvival || isGoblinCashoutTurn ? 0 : 10)
      : brain.targetGoldFloorThisRound;

    // 다음 액션 딜레이 재설정 (올인 타이밍: 600ms~1000ms 초고속 다다다다 리롤, 평상시: 1000ms~5000ms 여유로운 운영)
    brain.nextActionDelayMs = this.computeNextBotActionDelayMs(brain.isRolldownActive);

    // 1. 레벨업 체크
    this.performPersonaLevelUpStep(bot, brain, currentRound);

    const scouting = this.analyzeScoutingContext(bot, allParticipants);

    // 2. 상점 리롤 및 기물 쓸어담기 1스텝 실행
    let didAct = false;
    const nextRerollCost = bot.freeRerolls > 0 ? 0 : 2;
    if (
      brain.rerollsExecutedThisRound < brain.maxRerollsAllowedThisRound &&
      bot.gold - nextRerollCost >= effectiveGoldFloor
    ) {
      this.cleanupBenchIfFull(bot, brain, sharedPool);
      if (bot.rerollShop(sharedPool)) {
        brain.rerollsExecutedThisRound += 1;
        didAct = true;
        this.buyDesirableUnitsFromCurrentShop(
          bot,
          brain,
          brain.unitsToDenyCache,
          sharedPool,
          aiParams,
          scouting
        );
      }
    }

    // 3. 복제기 사용 및 실시간 보드 재배치/아이템 장착 갱신
    this.tryUseBotDuplicators(bot, brain, sharedPool);
    this.optimizeBoardAndItems(bot, brain, allParticipants, sharedPool, aiParams);

    return didAct;
  }

  private computeNextBotActionDelayMs(isRolldown: boolean): number {
    if (isRolldown) {
      // 초고속 올인 롤다운: 0.6초 ~ 1.0초 간격으로 '다다다다다' 리롤!
      return Math.round(600 + Math.random() * 400);
    }
    // 평상시 여유로운 리롤/배치: 1.0초 ~ 5.0초 간격
    return Math.round(1000 + Math.random() * 4000);
  }

  private performPersonaLevelUpStep(
    bot: Participant,
    brain: BotBrainState,
    currentRound: string
  ): void {
    const persona = brain.persona;
    const targetGoldFloor = brain.targetGoldFloorThisRound;

    if (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') {
      const threeStarCount = this.countTotalThreeStarUnits(bot);
      if ((bot.level < 5 || threeStarCount >= 2) && bot.level < 10) {
        if (bot.gold - 4 >= targetGoldFloor && bot.level < 9) {
          bot.buyXp();
        }
      }
    } else if (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') {
      while (bot.gold - 4 >= targetGoldFloor && bot.level < 10) {
        if (!bot.buyXp()) break;
      }
    } else if (persona === 'GOBLIN_GAMBLER') {
      const isGoblinCashoutTurn = bot.hp <= 35 || bot.goblinVaultStacks >= 55;
      const desiredLevel = isGoblinCashoutTurn ? 9 : 6;
      if (bot.gold - 4 >= targetGoldFloor && bot.level < desiredLevel) {
        bot.buyXp();
      }
    } else {
      const stageNum = parseInt(currentRound.split('-')[0] || '2', 10);
      const standardTargetLevel = Math.min(10, Math.max(4, stageNum + 3));
      if (bot.gold - 4 >= targetGoldFloor && bot.level < standardTargetLevel) {
        bot.buyXp();
      }
    }
  }

  /**
   * 즉시 턴 완료가 필요한 경우(유저가 즉시 전투 시작 버튼을 눌렀을 때) 남은 AI 행동을 일괄 마무리한다.
   */
  public executeAITurn(
    bot: Participant,
    allParticipants: Participant[],
    sharedPool: SharedPoolManager,
    currentRound: string
  ): void {
    if (bot.isEliminated) return;

    const brain = this.getOrCreateBrain(bot);
    const aiParams = this.rankManager.getAISkillParameters();

    const unitsToDenyFromPlayer = this.performScoutingAndPivot(
      bot,
      brain,
      allParticipants,
      sharedPool,
      aiParams
    );

    const scouting = this.analyzeScoutingContext(bot, allParticipants);
    this.runEconomyAndShopLoop(
      bot,
      brain,
      unitsToDenyFromPlayer,
      sharedPool,
      currentRound,
      aiParams,
      scouting
    );

    this.tryUseBotDuplicators(bot, brain, sharedPool);

    this.optimizeBoardAndItems(bot, brain, allParticipants, sharedPool, aiParams);
  }


  /**
   * 상대방 7명의 보드 상태(체력 1,300+ 거대 기물, 힐/보호막 시너지, 선봉대, 마법사 수 등)를 종합 정찰(Scouting)한다.
   */
  public analyzeScoutingContext(
    bot: Participant,
    allParticipants: Participant[]
  ): ScoutingContext {
    let opponentHighHpCount = 0;
    let opponentHealShieldTraits = 0;
    let opponentVanguardCount = 0;
    let opponentMagicCount = 0;
    const traitContestedMap = new Map<TraitId, number>();

    for (const other of allParticipants) {
      if (other.isEliminated || other.id === bot.id) continue;

      const traits = other.getActiveTraitCounts();
      for (const [traitId, count] of traits.entries()) {
        if (count >= 2) {
          traitContestedMap.set(traitId, (traitContestedMap.get(traitId) ?? 0) + 1);
        }
      }

      if (
        (traits.get('HOLY_EMPIRE') ?? 0) >= 2 ||
        (traits.get('PALADIN') ?? 0) >= 2 ||
        (traits.get('UNDEAD_SCOURGE') ?? 0) >= 2
      ) {
        opponentHealShieldTraits++;
      }
      if ((traits.get('VANGUARD') ?? 0) >= 2) {
        opponentVanguardCount++;
      }
      if (
        (traits.get('ARCANE_TOWER') ?? 0) >= 2 ||
        (traits.get('ARCHMAGE') ?? 0) >= 2
      ) {
        opponentMagicCount++;
      }

      for (let r = 0; r < Participant.BOARD_ROWS; r++) {
        for (let c = 0; c < Participant.BOARD_COLS; c++) {
          const u = other.board[r][c];
          if (u && u.maxHp >= 1300) {
            opponentHighHpCount++;
          }
        }
      }
    }

    return {
      opponentHighHpCount,
      opponentHealShieldTraits,
      opponentVanguardCount,
      opponentMagicCount,
      traitContestedMap,
    };
  }

  /**
   * 딥러닝/ONNX 모델 추론용 정규화 상태 텐서(Feature Vector)를 추출한다.
   * [현재 체력비율, 골드, 레벨, 스테이지, 대기석기물비율, 아이템비율, 필드전투력, 연승, 연패, 경합비율, 위기플래그]
   */
  public extractAIStateTensor(
    bot: Participant,
    allParticipants: Participant[],
    currentRound: string
  ): AIStateTensor {
    const stageNum = parseInt(currentRound.split('-')[0] || '1', 10);
    const hpRatio = Math.max(0, Math.min(1, bot.hp / 100));
    const goldNorm = Math.min(1, bot.gold / 100);
    const levelNorm = Math.min(1, bot.level / 10);
    const stageNorm = Math.min(1, stageNum / 7);

    const benchCount = bot.bench.filter((u) => u !== null).length;
    const benchUnitsRatio = benchCount / Participant.BENCH_SIZE;
    const itemBenchRatio = Math.min(1, bot.itemBench.length / 10);

    let boardPower = 0;
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const u = bot.board[r][c];
        if (u) {
          boardPower += u.cost * 10 + u.starLevel * 25 + u.items.length * 15;
        }
      }
    }
    const boardPowerNorm = Math.min(1, boardPower / 500);

    const winStreakNorm = Math.min(1, bot.winStreak / 10);
    const lossStreakNorm = Math.min(1, bot.loseStreak / 10);

    const brain = this.getOrCreateBrain(bot);
    const scouting = this.analyzeScoutingContext(bot, allParticipants);
    const contestedCount = scouting.traitContestedMap.get(brain.targetTrait) ?? 0;
    const contestedTraitRatio = Math.min(1, contestedCount / 4);
    const emergencyFlag = bot.hp <= 35 ? 1 : 0;

    const features = [
      hpRatio,
      goldNorm,
      levelNorm,
      stageNorm,
      benchUnitsRatio,
      itemBenchRatio,
      boardPowerNorm,
      winStreakNorm,
      lossStreakNorm,
      contestedTraitRatio,
      emergencyFlag,
    ];

    return {
      hpRatio,
      goldNorm,
      levelNorm,
      stageNorm,
      benchUnitsRatio,
      itemBenchRatio,
      boardPowerNorm,
      winStreakNorm,
      lossStreakNorm,
      contestedTraitRatio,
      emergencyFlag,
      features,
    };
  }

  /**
   * 증강체 1개의 종합 가치(Valuation / Utility Score)를 산출한다.
   * - 덱 시너지 적합도, 영웅 증강 2~3성 각, 체력 위기(Crisis)에 따른 즉발 vs 장기 밸류 판단
   * - 신규 시즌 18 증강(천상의 축복, 불완전한 초월, 단체 포옹, 고단수, 중심 잡기, 전기 충전, 판도라 등) 전면 가치평가
   */
  public evaluateAugmentValue(
    aug: AugmentDefinition,
    bot: Participant,
    brain: BotBrainState,
    allParticipants?: Participant[]
  ): number {
    let score = 25;
    if (aug.tier === 'SILVER') score += 10;
    else if (aug.tier === 'GOLD') score += 25;
    else if (aug.tier === 'PRISMATIC') score += 45;

    const threeStarCount = this.countTotalThreeStarUnits(bot);
    const ownedLocations = bot.getAllUnitLocations();
    const ownedUnitIds = new Set(ownedLocations.map((l) => l.unit.unitId));

    // 1. 영웅 증강 (Hero Augment) 정밀 평가
    if (aug.category === 'HERO' && aug.heroUnitId) {
      const heroTemplate = UNIT_TEMPLATES[aug.heroUnitId];
      const heroUnit = ownedLocations.find((l) => l.unit.unitId === aug.heroUnitId)?.unit;
      const ownsHero = !!heroUnit;
      const isTwoStar = heroUnit && heroUnit.starLevel >= 2;
      const matchesTrait =
        heroTemplate &&
        (heroTemplate.traits.includes(brain.targetTrait) ||
          heroTemplate.traits.includes(brain.secondaryTrait));

      if (ownsHero) {
        score += 85;
        if (isTwoStar) score += 35; // 이미 2성이면 3성 스파이크 각이 매우 높음!
      } else if (matchesTrait) {
        score += 65;
      } else {
        score -= 25;
      }
    }

    // 2. 시너지 문장 / 왕관 증강 평가 (8~9단계 프리즘 필수 트리거)
    if (aug.bonusTrait) {
      if (aug.bonusTrait === brain.targetTrait) {
        score += 95;
        // 다른 봇들이 안 가는 빈집 시너지라면 추가 가산
        if (allParticipants) {
          const scouting = this.analyzeScoutingContext(bot, allParticipants);
          const contested = scouting.traitContestedMap.get(aug.bonusTrait) ?? 0;
          if (contested === 0) score += 25;
          else if (contested >= 2) score -= 20;
        }
      } else if (aug.bonusTrait === brain.secondaryTrait) {
        score += 65;
      } else if (bot.getActiveTraitCounts().has(aug.bonusTrait)) {
        score += 45;
      } else {
        score -= 30;
      }
    }

    // 3. 체력 위기(Crisis Management) 및 템포 가치평가
    const isCrisis = bot.hp <= 35;
    const isHealthy = bot.hp >= 70;

    // 아이템 관련 증강 여부
    const isItemAug =
      aug.effectKey === 'ITEM_PACK_1' ||
      aug.effectKey === 'SMALL_PACK' ||
      aug.effectKey === 'USEFUL_METAL' ||
      aug.effectKey === 'THIEF_GLOVES' ||
      aug.effectKey === 'RADIANT_RELICS' ||
      aug.effectKey === 'LIVING_FORGE' ||
      aug.effectKey === 'MAKE_WAY';

    if (isCrisis) {
      // 즉발 전투력/체력 증강에 대폭 가산점!
      if (
        aug.effectKey === 'TINY_TITANS' ||
        aug.effectKey === 'CELESTIAL_BLESSING' ||
        aug.effectKey === 'ASCENSION' ||
        aug.effectKey === 'INCOMPLETE_ASCENSION' ||
        aug.effectKey === 'FINAL_ASCENSION' ||
        aug.effectKey === 'GROUP_HUG' ||
        aug.effectKey === 'STAND_UNITED' ||
        aug.effectKey === 'STAND_UNITED_1' ||
        aug.effectKey === 'LAST_STAND'
      ) {
        score += 90;
      } else if (aug.category === 'COMBAT') {
        score += 55;
      }

      // 장기적 이자/골드 증강은 죽기 전에 쓸모없으므로 강력 감점!
      if (
        aug.effectKey === 'HEDGE_FUND' ||
        aug.effectKey === 'DIABOLIC_FINANCE' ||
        aug.effectKey === 'LEVEL_UP' ||
        aug.effectKey === 'RICH_GET_RICHER' ||
        aug.effectKey === 'CAPITAL_GAIN_1' ||
        aug.effectKey === 'GOLDEN_EGG'
      ) {
        score -= 70;
      } else if (aug.category === 'ECONOMY') {
        score -= 35;
      }
    } else if (isHealthy) {
      // 체력이 넉넉할 때는 레벨업/이자/골드 스노우볼 증강 우대
      if (
        aug.category === 'ECONOMY' ||
        aug.effectKey === 'LEVEL_UP' ||
        aug.effectKey === 'DIABOLIC_FINANCE' ||
        aug.effectKey === 'HEDGE_FUND' ||
        aug.effectKey === 'RICH_GET_RICHER'
      ) {
        score += 55;
      }
    }

    // 4. 페르소나 및 덱 상황별 가치평가
    const isRerollAug =
      aug.effectKey === 'GOLDEN_TICKET' ||
      aug.effectKey === 'CLEARANCE_SALE' ||
      aug.effectKey === 'PANDORA_BENCH' ||
      aug.effectKey === 'FATED_DUPLICATION' ||
      aug.effectKey === 'TRADE_SECTOR' ||
      aug.effectKey === 'REROLL_DAY' ||
      aug.effectKey === 'HYPER_ROLL' ||
      aug.effectKey === 'PRISMATIC_TICKET';

    if (brain.persona === 'HYPER_ROLLER' || brain.persona === 'LOW_COST_REROLLER') {
      if (threeStarCount >= 2) {
        // 이미 3성이 2개 이상 완성됨 -> 전투/스탯 증강 집중
        if (aug.category === 'COMBAT') score += 50;
        if (aug.category === 'ECONOMY') score += 30;
      } else {
        // 아직 3성 미완성 -> 리롤 및 복제기 증강 집중
        if (isRerollAug) score += 75;
        if (aug.category === 'COMBAT') score += 20;
      }
    } else if (
      brain.persona === 'FAST_NINE_GREEDY' ||
      brain.persona === 'FAST_NINE_ECONOMIST'
    ) {
      if (bot.level < 8) {
        if (
          aug.category === 'ECONOMY' ||
          aug.effectKey === 'LEVEL_UP' ||
          aug.effectKey === 'SILVER_SPOON' ||
          aug.effectKey === 'HEDGE_FUND'
        ) {
          score += 70;
        }
      } else {
        if (aug.category === 'COMBAT') score += 60;
      }
    } else if (brain.persona === 'GOBLIN_GAMBLER') {
      if (
        aug.effectKey === 'GOBLIN_CROWN' ||
        aug.effectKey === 'DIABOLIC_FINANCE' ||
        aug.effectKey === 'CALCULATED_LOSS' ||
        aug.category === 'ECONOMY'
      ) {
        score += 80;
      }
    } else {
      // FLEX_MASTER
      if (aug.category === 'COMBAT') score += 40;
      if (isItemAug) score += 35;
    }

    // 5. 아이템 보유량 연계 (대기석 및 장착 아이템이 적으면 아이템 증강 우대)
    const totalItems = bot.itemBench.length + ownedLocations.reduce((acc, l) => acc + l.unit.items.length, 0);
    if (totalItems <= 4 && isItemAug) {
      score += 45;
    }

    return score;
  }

  /**
   * 증강체 라운드(2-1, 3-2, 4-2) 진입 시 AI 봇이 정밀 가치평가(evaluateAugmentValue)를 통해 최적의 증강체를 선택한다.
   */
  public selectAugmentForBot(
    bot: Participant,
    tier: AugmentTier,
    sharedPool: SharedPoolManager,
    allParticipants?: Participant[]
  ): AugmentDefinition | null {
    if (bot.isEliminated) return null;
    const brain = this.getOrCreateBrain(bot);
    const choices = DopamineEngine.rollAugmentChoices(bot, tier);
    if (choices.length === 0) return null;

    let bestAug = choices[0];
    let bestScore = -999;

    for (const aug of choices) {
      const score = this.evaluateAugmentValue(aug, bot, brain, allParticipants);
      if (score > bestScore) {
        bestScore = score;
        bestAug = aug;
      }
    }

    // 영웅 증강을 선택했다면 두뇌에 영웅 타겟 등록 (3성 올인 지시)
    if (bestAug.category === 'HERO' && bestAug.heroUnitId) {
      brain.heroTargetUnitId = bestAug.heroUnitId;
    }

    bot.applyAugment(bestAug.id, sharedPool);
    return bestAug;
  }


  // ==========================================================================
  // 1. 정찰(Scouting) 및 덱 전환(Pivot) & 견제 대상 스캔
  // ==========================================================================

  private performScoutingAndPivot(
    bot: Participant,
    brain: BotBrainState,
    allParticipants: Participant[],
    sharedPool: SharedPoolManager,
    aiParams: AISkillParameters
  ): Set<string> {
    const unitsToDenyFromPlayer = new Set<string>();
    const traitContestedMap = new Map<TraitId, number>();

    for (const other of allParticipants) {
      if (other.isEliminated || other.id === bot.id) continue;

      // 다른 생존 참가자들의 활성화 시너지 스캔
      const otherTraitCounts = other.getActiveTraitCounts();
      for (const [traitId, count] of otherTraitCounts.entries()) {
        if (count >= 2) {
          traitContestedMap.set(traitId, (traitContestedMap.get(traitId) ?? 0) + 1);
        }
      }

      // 플레이어가 4코스트(풀 10개) 5개 이상 또는 5코스트(풀 9개) 4개 이상 모으고 있는지 감지하여 견제(Holding) 타겟 등록
      if (!other.isAI && aiParams.skillLevel >= 0.7) {
        for (const template of Object.values(UNIT_TEMPLATES)) {
          if (template.cost >= 4) {
            const playerCopies = other.getOwnedUnitCopiesCount(template.id);
            const denyThreshold = template.cost === 5 ? 4 : 5;
            if (
              playerCopies >= denyThreshold &&
              !other.hasThreeStarUnit(template.id)
            ) {
              unitsToDenyFromPlayer.add(template.id);
            }
          }
        }
      }
    }

    // 고티어(skillLevel >= 0.7) AI의 덱 전환(Pivot) 판단
    // 황금 고블린 도박꾼이 이미 스택을 쌓고 있는 경우가 아니라면,
    // 현재 목표 시너지를 다른 2명 이상이 겹쳐서 가고 있을 때 가장 덜 겹치는 시너지로 전환한다.
    const shouldAttemptPivot =
      aiParams.skillLevel >= 0.7 &&
      Math.random() < aiParams.scoutingChance &&
      brain.pivotedCount < 2 &&
      !(brain.persona === 'GOBLIN_GAMBLER' && bot.goblinVaultStacks >= 12);

    if (shouldAttemptPivot) {
      const currentContested = traitContestedMap.get(brain.targetTrait) ?? 0;

      // 목표 시너지 기물들의 공유 풀 잔여 비율 계산
      const traitUnits = Object.values(UNIT_TEMPLATES).filter((u) =>
        u.traits.includes(brain.targetTrait)
      );
      let remainingSum = 0;
      let maxSum = 0;
      for (const u of traitUnits) {
        remainingSum += sharedPool.getRemainingCount(u.id);
        maxSum += sharedPool.getMaxCount(u.id);
      }
      const poolRatio = maxSum > 0 ? remainingSum / maxSum : 1;

      if (currentContested >= 2 && poolRatio < 0.68) {
        // 가장 덜 겹치는 시너지 탐색
        let bestAlternative: TraitId = brain.targetTrait;
        let lowestContested = currentContested;

        for (const candidateTrait of STANDARD_ORIGIN_TRAITS) {
          const contestedCount = traitContestedMap.get(candidateTrait) ?? 0;
          if (contestedCount < lowestContested) {
            lowestContested = contestedCount;
            bestAlternative = candidateTrait;
          }
        }

        if (bestAlternative !== brain.targetTrait) {
          brain.targetTrait = bestAlternative;
          brain.pivotedCount += 1;
        }
      }
    }

    return unitsToDenyFromPlayer;
  }

  // ==========================================================================
  // 2 & 3. 고티어 3성 견제 및 페르소나별 경제/상점 루프
  // ==========================================================================

  private runEconomyAndShopLoop(
    bot: Participant,
    brain: BotBrainState,
    unitsToDenyFromPlayer: Set<string>,
    sharedPool: SharedPoolManager,
    currentRound: string,
    aiParams: AISkillParameters,
    scouting?: ScoutingContext
  ): void {
    const persona = brain.persona;
    const isEmergencySurvival = bot.hp <= 30;
    const isGoblinCashoutTurn =
      persona === 'GOBLIN_GAMBLER' &&
      (bot.hp <= 35 || bot.goblinVaultStacks >= 55);

    // A. 현재 상점(5칸)에서 즉시 구매할 기물 및 고티어 견제 기물 스캔
    this.buyDesirableUnitsFromCurrentShop(
      bot,
      brain,
      unitsToDenyFromPlayer,
      sharedPool,
      aiParams,
      scouting
    );

    // B. 페르소나별 레벨업(buyXp) 의사결정 (Lv.10 확장 지원)
    const targetGoldFloor = this.getPersonaGoldFloor(
      bot,
      persona,
      isEmergencySurvival,
      isGoblinCashoutTurn,
      aiParams
    );

    if (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') {
      // 저코스트 3성 리롤러: 5~6레벨에서 경험치 구매를 멈추고 리롤에 집중.
      // 단, 핵심 1~2코 3성이 2개 이상 완성되었거나 체력이 위험하면 레벨업 재개
      const threeStarCount = this.countTotalThreeStarUnits(bot);
      if ((bot.level < 5 || threeStarCount >= 2) && bot.level < 10) {
        while (bot.gold - 4 >= targetGoldFloor && bot.level < 9) {
          if (!bot.buyXp()) break;
        }
      }
    } else if (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') {
      // 고밸류 운영러: 50골드(또는 사악한 금융 70골드) 칼이자를 지키며 남는 골드로 9~10레벨 직행
      while (bot.gold - 4 >= targetGoldFloor && bot.level < 10) {
        if (!bot.buyXp()) break;
      }
    } else if (persona === 'GOBLIN_GAMBLER') {
      // 황금 고블린 코인충: 평상시에는 50골드를 모으면서 천천히 레벨업,
      // 체력 35 이하 또는 금고 55스택 이상 도달 시 골드를 전부 털어 레벨업+폭풍 리롤!
      const desiredLevel = isGoblinCashoutTurn ? 9 : 6;
      while (bot.gold - 4 >= targetGoldFloor && bot.level < desiredLevel) {
        if (!bot.buyXp()) break;
      }
    } else {
      // FLEX_MASTER (유연한 정석 밸런스형): 라운드 흐름에 맞춰 정석 레벨업 (후반 Lv.10 도달)
      const stageNum = parseInt(currentRound.split('-')[0] || '2', 10);
      const standardTargetLevel = Math.min(10, Math.max(4, stageNum + 3));
      while (
        bot.gold - 4 >= targetGoldFloor &&
        bot.level < standardTargetLevel
      ) {
        if (!bot.buyXp()) break;
      }
    }

    // C. 페르소나별 상점 리롤(rerollShop) 및 기물 수집 루프
    let maxRerollsThisTurn = 8;
    if (isEmergencySurvival || isGoblinCashoutTurn) {
      maxRerollsThisTurn = 18;
    } else if (
      (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') &&
      bot.level >= 5 &&
      bot.level <= 6
    ) {
      maxRerollsThisTurn = 12;
    } else if (
      (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') &&
      bot.level < 8 &&
      !isEmergencySurvival
    ) {
      // 8레벨 전까지는 무료 리롤만 사용하거나 리롤 억제
      maxRerollsThisTurn = bot.freeRerolls > 0 ? bot.freeRerolls : 1;
    }

    let rerollsDone = 0;
    while (rerollsDone < maxRerollsThisTurn) {
      const nextRerollCost = bot.freeRerolls > 0 ? 0 : 2;
      if (bot.gold - nextRerollCost < targetGoldFloor) {
        break;
      }

      // 대기석이 너무 꽉 찼으면 불필요한 기물 정리 시도
      this.cleanupBenchIfFull(bot, brain, sharedPool);

      if (!bot.rerollShop(sharedPool)) {
        break;
      }
      rerollsDone += 1;

      this.buyDesirableUnitsFromCurrentShop(
        bot,
        brain,
        unitsToDenyFromPlayer,
        sharedPool,
        aiParams
      );
    }
  }

  /**
   * 페르소나 및 지능 지수에 따른 최소 유지 골드(이자 마지노선) 산출
   */
  private getPersonaGoldFloor(
    bot: Participant,
    persona: AIPersona,
    isEmergencySurvival: boolean,
    isGoblinCashoutTurn: boolean,
    aiParams: AISkillParameters
  ): number {
    if (isEmergencySurvival || isGoblinCashoutTurn) {
      return 0; // 생존 위기 또는 고블린 캐시아웃 타이밍에는 0골드까지 올인!
    }

    const maxInterestGold = bot.getMaxInterestCap() * 10; // 기본 50, 사악한 금융 70

    // 저티어 AI는 가끔 이자 관리를 실수하여 마지노선을 낮게 잡음
    const mistakePenalty =
      aiParams.skillLevel < 0.45 && Math.random() < 0.35 ? 20 : 0;

    if (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') {
      return bot.level >= 8 ? 20 : Math.max(20, maxInterestGold - mistakePenalty);
    }

    if (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') {
      // 5~6레벨에서 20~30골드 선을 유지하며 공격적 리롤
      return Math.max(10, 20 - mistakePenalty);
    }

    if (persona === 'GOBLIN_GAMBLER') {
      return Math.max(20, 40 - mistakePenalty);
    }

    // FLEX_MASTER
    return Math.max(10, 30 - mistakePenalty);
  }

  /**
   * 현재 상점 5칸을 평가하여 고티어 견제 기물 또는 유틸리티 점수가 높은 기물을 구매한다.
   */
  private buyDesirableUnitsFromCurrentShop(
    bot: Participant,
    brain: BotBrainState,
    unitsToDenyFromPlayer: Set<string>,
    sharedPool: SharedPoolManager,
    aiParams: AISkillParameters,
    scouting?: ScoutingContext
  ): void {
    for (let slotIdx = 0; slotIdx < bot.shop.length; slotIdx++) {
      const unitId = bot.shop[slotIdx];
      if (!unitId) continue;

      const template = UNIT_TEMPLATES[unitId];
      if (!template) continue;

      // 1) 고티어 전용 3성 견제 (Holding/Denying):
      // 4코스트(풀 10개)는 2장만 쥐어도 상대가 3성 불가, 5코스트(풀 9개)는 단 1장만 쥐어도 상대가 복제기 없이 3성 불가!
      if (
        aiParams.skillLevel >= 0.7 &&
        unitsToDenyFromPlayer.has(unitId) &&
        bot.gold >= template.cost + 8 &&
        bot.canBuyUnit(unitId, template.cost)
      ) {
        if (bot.buyUnit(slotIdx, sharedPool)) {
          // 방금 구매한 견제 기물을 찾아서 대기석에 보호 마킹
          const loc = bot
            .getAllUnitLocations()
            .find((l) => l.area === 'BENCH' && l.unit.unitId === unitId);
          if (loc) {
            brain.deniedUnitInstanceIds.add(loc.unit.instanceId);
          }
          continue;
        }
      }

      // 2) 일반 기물 구매 가치(Utility Score) 평가 (공유 풀 잔여량, 시너지 브레이크포인트, 스카우팅 경합도, 3성 가능성 반영)
      const utilityScore = this.evaluateShopUnitUtility(
        bot,
        brain,
        template,
        sharedPool,
        aiParams,
        scouting
      );

      if (utilityScore >= 48) {
        if (!bot.canBuyUnit(unitId, template.cost)) {
          // 대기석이 가득 찼다면 가치가 낮은 대기석 기물 1개를 팔아서 자리 확보 시도
          this.cleanupBenchIfFull(bot, brain, sharedPool);
        }
        bot.buyUnit(slotIdx, sharedPool);
      }
    }
  }

  /**
   * 상점 기물 1개의 구매 매력도(Utility Score)를 정밀 계산한다.
   * - 3성/2성 합성 근접도, 공유 풀 잔여량 고갈 방지
   * - 시너지 브레이크포인트 달성 여부 (새 시너지 활성화 시 +35 파워스파이크)
   * - 정찰(Scouting)을 통한 경합도(Contested: -25~-35) 및 빈집 보너스(+30)
   * - 역할군(탱커/딜러) 불균형 해소 가산점
   */
  public evaluateShopUnitUtility(
    bot: Participant,
    brain: BotBrainState,
    template: UnitTemplate,
    sharedPool: SharedPoolManager,
    aiParams: AISkillParameters,
    scouting?: ScoutingContext
  ): number {
    if (bot.hasThreeStarUnit(template.id)) return -999;

    let score = 20;
    const ownedCopies = bot.getOwnedUnitCopiesCount(template.id);
    const remainingInPool = sharedPool.getRemainingCount(template.id);
    const canStillReachThreeStar =
      ownedCopies + remainingInPool + bot.duplicators >= 9;

    // 0. 영웅 증강 타겟 기물 (3성 우선 수집, 풀 고갈 시 2성 유지)
    if (brain.heroTargetUnitId === template.id) {
      if (canStillReachThreeStar) {
        score += 85; // 3성을 위해 최우선 구매
      } else if (ownedCopies < 3) {
        score += 50; // 3성은 불가하지만 2성까지는 완성
      } else {
        score -= 30; // 3성 불가 판명 시 추가 수집 중단
      }
    }

    // 1. 보유 개수(페어/합성 근접도) 가산점
    if (ownedCopies === 8) {
      score += 95; // 이번 1장 구매로 즉시 3성 전장 파괴 트럭!
    } else if (ownedCopies === 2) {
      score += 70; // 이번 1장 구매로 즉시 2성 완성 파워스파이크!
    } else if (ownedCopies === 5) {
      score += canStillReachThreeStar ? 45 : -10; // 2성 2개 모임 (3성 초근접)
    } else if (ownedCopies >= 6) {
      score += canStillReachThreeStar ? 48 : -20; // 풀 고갈로 3성 불가 시 수집 포기
    } else if (ownedCopies >= 3) {
      score += canStillReachThreeStar ? 24 : -25;
    } else if (ownedCopies === 1) {
      score += 24; // 페어 완성
    }

    // 2. 목표 시너지 및 보조 시너지 일치 여부
    const matchesTarget = template.traits.includes(brain.targetTrait);
    const matchesSecondary = template.traits.includes(brain.secondaryTrait);

    if (matchesTarget) {
      score += 28;
    }
    if (matchesSecondary) {
      score += 15;
    }

    // 3. 스카우팅 경합도 (Contestation) 및 빈집 보너스
    if (scouting && matchesTarget) {
      const contestedCount = scouting.traitContestedMap.get(brain.targetTrait) ?? 0;
      if (contestedCount === 0) {
        score += 30; // 아무도 안 가는 빈집 시너지! 3성 각이 활짝 열림
      } else if (contestedCount >= 2) {
        score -= 25; // 2명 이상 겹쳐서 기물 풀이 마르고 있음
      }
    }

    // 4. 시너지 브레이크포인트 검사 (내 보드에 즉시 시너지 티어를 켤 수 있는가?)
    const activeCounts = bot.getActiveTraitCounts();
    for (const t of template.traits) {
      const currentCount = activeCounts.get(t) ?? 0;
      // 2, 4, 6, 8, 9 등 임계치 바로 1보 전일 때
      if (currentCount === 1 || currentCount === 3 || currentCount === 5 || currentCount === 7) {
        score += 35; // 즉시 시너지 발동 보너스!
        break;
      }
    }

    // 5. 역할군 밸런스 (앞라인 탱커 vs 후열 딜러)
    const role = getUnitRole(template.id);
    let frontCount = 0;
    let backCount = 0;
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const u = bot.board[r][c];
        if (u) {
          const uRole = getUnitRole(u.unitId);
          if (uRole === 'TANK' || uRole === 'BRUISER') frontCount++;
          else backCount++;
        }
      }
    }

    if (frontCount <= 1 && (role === 'TANK' || role === 'BRUISER')) {
      score += 25; // 앞라인 탱커가 절실한 상황
    } else if (backCount <= 1 && (role === 'AD_CARRY' || role === 'AP_CARRY')) {
      score += 25; // 주력 딜러가 절실한 상황
    }

    // 6. 페르소나별 코스트 선호도
    if (brain.persona === 'HYPER_ROLLER' || brain.persona === 'LOW_COST_REROLLER') {
      if (template.cost <= 2) score += 26;
      if (template.cost >= 4 && bot.level <= 6) score -= 20;
    } else if (
      brain.persona === 'FAST_NINE_GREEDY' ||
      brain.persona === 'FAST_NINE_ECONOMIST'
    ) {
      if (template.cost >= 4) score += 36;
      if (template.cost === 5) score += 22;
      if (template.cost === 1 && bot.level >= 7 && ownedCopies === 0) score -= 25;
    } else if (brain.persona === 'GOBLIN_GAMBLER') {
      if (template.traits.includes('GOLDEN_GOBLIN')) {
        score += 55; // 황금 고블린 기물 최우선 수집
      }
      if (
        (bot.hp <= 35 || bot.goblinVaultStacks >= 55) &&
        template.cost >= 4
      ) {
        score += 34; // 캐시아웃 턴에는 4~5코 고밸류 기물 대량 매수
      }
    } else {
      // FLEX_MASTER
      score += template.cost * 5;
    }

    // 7. 인간적 오차(Temperature Noise) 적용
    const noise = (Math.random() - 0.5) * aiParams.temperature * 38;
    return score + noise;
  }

  /**
   * 대기석이 꽉 찼을 때 시너지에 맞지 않고 성급이 낮은 1성 대기석 기물을 판매하여 슬롯을 확보한다.
   * 단, 고티어 견제용으로 홀딩 중인 기물(deniedUnitInstanceIds)은 판매하지 않는다.
   */
  private cleanupBenchIfFull(
    bot: Participant,
    brain: BotBrainState,
    sharedPool: SharedPoolManager
  ): void {
    const emptyCount = bot.bench.filter((s) => s === null).length;
    if (emptyCount > 1) return;

    let worstBenchUnit: UnitInstance | null = null;
    let worstValue = 9999;

    for (const unit of bot.bench) {
      if (!unit) continue;
      if (brain.deniedUnitInstanceIds.has(unit.instanceId)) continue;
      if (unit.starLevel >= 2) continue;

      let keepScore = unit.cost * 6 + bot.getOwnedUnitCopiesCount(unit.unitId) * 12;
      if (unit.traits.includes(brain.targetTrait)) keepScore += 30;
      if (unit.traits.includes('GOLDEN_GOBLIN') && brain.persona === 'GOBLIN_GAMBLER') {
        keepScore += 45;
      }

      if (keepScore < worstValue) {
        worstValue = keepScore;
        worstBenchUnit = unit;
      }
    }

    // 대기석이 완전히 찼을 때(빈칸 0개)는 worstValue 기준치와 무관하게 2성 미완성 기물 중 가장 점수 낮은 1기를 과감히 매각하여 상점 락 해제!
    if (worstBenchUnit && (emptyCount === 0 || worstValue < 65)) {
      bot.sellUnit(worstBenchUnit.instanceId, sharedPool);
    }
  }

  private tryUseBotDuplicators(
    bot: Participant,
    brain: BotBrainState,
    sharedPool: SharedPoolManager
  ): void {
    if (bot.duplicators <= 0) return;

    const allUnits = bot.getAllUnitLocations().map((l) => l.unit);
    // 3성 직전(8장 보유) 기물 또는 4~5코스트 기물 우선 복제
    const candidates = allUnits
      .filter((u) => !brain.deniedUnitInstanceIds.has(u.instanceId))
      .sort((a, b) => {
        const copiesA = bot.getOwnedUnitCopiesCount(a.unitId);
        const copiesB = bot.getOwnedUnitCopiesCount(b.unitId);
        if (copiesA >= 8 && copiesB < 8) return -1;
        if (copiesB >= 8 && copiesA < 8) return 1;
        return b.cost - a.cost;
      });

    for (const target of candidates) {
      if (bot.duplicators <= 0) break;
      const copies = bot.getOwnedUnitCopiesCount(target.unitId);
      if (copies >= 8 || copies === 2 || target.cost >= 4) {
        bot.useChampionDuplicator(target.instanceId, sharedPool);
      }
    }
  }

  private countTotalThreeStarUnits(bot: Participant): number {
    const threeStarIds = new Set<string>();
    for (const loc of bot.getAllUnitLocations()) {
      if (loc.unit.starLevel === 3) {
        threeStarIds.add(loc.unit.unitId);
      }
    }
    return threeStarIds.size;
  }

  // ==========================================================================
  // 4. 지능형 보드 배치, 저격 배치 및 아이템 장착 (optimizeBoardAndItems)
  // ==========================================================================

  public optimizeBoardAndItems(
    bot: Participant,
    brain: BotBrainState,
    humanPlayerOrParticipants: Participant | Participant[] | null,
    sharedPool: SharedPoolManager,
    aiParams: AISkillParameters
  ): void {
    const allParticipantsList = Array.isArray(humanPlayerOrParticipants)
      ? humanPlayerOrParticipants
      : humanPlayerOrParticipants
      ? [humanPlayerOrParticipants]
      : [];
    const humanPlayer =
      allParticipantsList.find((p) => !p.isAI && !p.isEliminated) ??
      (!Array.isArray(humanPlayerOrParticipants) ? humanPlayerOrParticipants : null);
    const scouting = this.analyzeScoutingContext(bot, allParticipantsList);

    // 1. 보드와 대기석의 모든 기물을 수집 (고티어 견제용 홀딩 기물은 대기석 끝칸에 고정)
    const allUnits: UnitInstance[] = [];
    const deniedUnits: UnitInstance[] = [];

    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const u = bot.board[r][c];
        if (u) {
          if (brain.deniedUnitInstanceIds.has(u.instanceId)) {
            deniedUnits.push(u);
          } else {
            allUnits.push(u);
          }
          bot.board[r][c] = null;
        }
      }
    }

    for (let i = 0; i < Participant.BENCH_SIZE; i++) {
      const u = bot.bench[i];
      if (u) {
        if (brain.deniedUnitInstanceIds.has(u.instanceId)) {
          deniedUnits.push(u);
        } else {
          allUnits.push(u);
        }
        bot.bench[i] = null;
      }
    }

    if (allUnits.length === 0 && deniedUnits.length === 0) return;

    const isGoblinSandbagging =
      brain.persona === 'GOBLIN_GAMBLER' &&
      bot.hp > 35 &&
      bot.goblinVaultStacks < 55;

    // 2. 보드에 배치할 정예 기물(최대 bot.level기) 선정 (중복 unitId보다는 고유 기물 우선)
    const scoredUnits = allUnits.map((unit) => {
      let power =
        unit.starLevel * 38 +
        unit.cost * 14 +
        unit.items.length * 15;
      if (unit.traits.includes(brain.targetTrait)) power += 24;
      if (unit.traits.includes(brain.secondaryTrait)) power += 12;
      if (
        brain.persona === 'GOBLIN_GAMBLER' &&
        unit.traits.includes('GOLDEN_GOBLIN')
      ) {
        power += 70; // 황금 고블린 시너지 유지 최우선
      }
      return { unit, power };
    });

    scoredUnits.sort((a, b) => b.power - a.power);

    const deployedUnits: UnitInstance[] = [];
    const deployedUnitIds = new Set<string>();
    const remainingForBench: UnitInstance[] = [];

    // 고유(Unique) 기물 우선 선발
    for (const entry of scoredUnits) {
      if (
        deployedUnits.length < bot.level &&
        !deployedUnitIds.has(entry.unit.unitId)
      ) {
        deployedUnits.push(entry.unit);
        deployedUnitIds.add(entry.unit.unitId);
      } else {
        remainingForBench.push(entry.unit);
      }
    }

    // 아직 배치 인원이 남았다면 중복 기물이라도 전투력이 높은 순으로 추가 배치
    const maxDeployTarget =
      isGoblinSandbagging && bot.level >= 5
        ? Math.max(3, bot.level - 1)
        : bot.level;

    while (
      deployedUnits.length < maxDeployTarget &&
      remainingForBench.length > 0
    ) {
      deployedUnits.push(remainingForBench.shift()!);
    }

    // 3. 플레이어 주력 캐리 열(Column) 스캔 (고티어 AI 저격 배치용)
    let playerCarryCol = 3;
    if (humanPlayer && aiParams.skillLevel >= 0.7) {
      let highestCarryScore = -1;
      for (let r = 0; r < Participant.BOARD_ROWS; r++) {
        for (let c = 0; c < Participant.BOARD_COLS; c++) {
          const pu = humanPlayer.board[r][c];
          if (!pu) continue;
          const carryScore =
            pu.items.length * 40 + pu.starLevel * 25 + pu.cost * 12 + pu.atk;
          if (carryScore > highestCarryScore) {
            highestCarryScore = carryScore;
            playerCarryCol = c;
          }
        }
      }
    }

    // 4. 역할군 분류: 전열 탱커/근접(Frontline), 암살자(Assassin), 후열 원거리 딜러(Backline)
    const frontlineUnits: UnitInstance[] = [];
    const assassinUnits: UnitInstance[] = [];
    const backlineUnits: UnitInstance[] = [];

    for (const u of deployedUnits) {
      if (u.traits.includes('SHADOW_ASSASSIN')) {
        assassinUnits.push(u);
      } else if (
        u.range <= 1 ||
        u.traits.includes('VANGUARD') ||
        u.traits.includes('BERSERKER') ||
        u.traits.includes('PALADIN')
      ) {
        frontlineUnits.push(u);
      } else {
        backlineUnits.push(u);
      }
    }

    // 고티어 AI: CC 탱커(잔느, 엔트, 지크, 아서, 골드투스)를 플레이어 주력 캐리 맞은편 열(row 0, playerCarryCol)에 최우선 배치
    const ccTankIds = new Set([
      'u2_jeanne',
      'u2_ent',
      'u3_sieg',
      'u4_arthur',
      'u5_goldtooth',
    ]);
    frontlineUnits.sort((a, b) => {
      const aCC = ccTankIds.has(a.unitId) ? 1 : 0;
      const bCC = ccTankIds.has(b.unitId) ? 1 : 0;
      if (aCC !== bCC) return bCC - aCC;
      return b.maxHp - a.maxHp;
    });

    const frontCols = [
      playerCarryCol,
      3,
      2,
      4,
      1,
      5,
      0,
      6,
    ].filter((col, idx, arr) => arr.indexOf(col) === idx);

    for (const tank of frontlineUnits) {
      let placed = false;
      for (const row of [0, 1]) {
        for (const col of frontCols) {
          if (bot.board[row][col] === null) {
            bot.board[row][col] = tank;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
    }

    // 후열 원거리 딜러(순찰자/대마법사): 맨 뒷열(3행) 양 구석(col 0, 6, 1, 5...)부터 안전하게 배치
    const backCols = [0, 6, 1, 5, 2, 4, 3];
    for (const ranged of backlineUnits) {
      let placed = false;
      for (const row of [3, 2, 1]) {
        for (const col of backCols) {
          if (bot.board[row][col] === null) {
            bot.board[row][col] = ranged;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
    }

    // 그림자 암살자: 적 주력 딜러 열(playerCarryCol)로 도약할 수 있도록 해당 열 우선 배치
    const assassinCols = [
      playerCarryCol,
      6 - playerCarryCol,
      0,
      6,
      1,
      5,
      2,
      4,
      3,
    ].filter((col, idx, arr) => col >= 0 && col < 7 && arr.indexOf(col) === idx);

    for (const assassin of assassinUnits) {
      let placed = false;
      for (const row of [2, 3, 1, 0]) {
        for (const col of assassinCols) {
          if (bot.board[row][col] === null) {
            bot.board[row][col] = assassin;
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
    }

    // 5. 남은 기물은 대기석 앞쪽부터 배치하고, 고티어 견제(Hold/Deny) 기물은 대기석 맨 오른쪽 구석(8, 7...)에 배치
    let benchWriteIdx = 0;
    for (const benchUnit of remainingForBench) {
      if (benchWriteIdx < Participant.BENCH_SIZE) {
        bot.bench[benchWriteIdx++] = benchUnit;
      } else {
        sharedPool.returnUnitToPool(benchUnit.unitId, benchUnit.starLevel);
      }
    }

    let denyWriteIdx = Participant.BENCH_SIZE - 1;
    for (const denied of deniedUnits) {
      while (denyWriteIdx >= 0 && bot.bench[denyWriteIdx] !== null) {
        denyWriteIdx--;
      }
      if (denyWriteIdx >= 0) {
        bot.bench[denyWriteIdx] = denied;
      } else {
        brain.deniedUnitInstanceIds.delete(denied.instanceId);
        sharedPool.returnUnitToPool(denied.unitId, denied.starLevel);
      }
    }

    // 6. 지능형 동적 아이템 합성 및 장착 가치평가 (Dynamic Item Valuation & Crafting)
    this.dynamicallyCraftAndEquipItems(bot, brain, deployedUnits, scouting);
  }

  /**
   * 보드 유닛과 아이템 간의 유틸리티 점수를 평가한다.
   * - 역할군 적합도 (ITEM_ROLE_AFFINITY)
   * - 상대방 스카우팅 메타 카운터 (거학, 모렐로, 덤불조끼 등)
   * - 유닛의 성급 (3성 / 2성) 및 캐리 비중
   */
  public evaluateCompletedItemForUnit(
    itemId: CompletedItemId,
    unit: UnitInstance,
    scouting?: ScoutingContext
  ): number {
    const role = getUnitRole(unit.unitId);
    const affinity = ITEM_ROLE_AFFINITY[itemId];
    let score = affinity ? affinity[role] : 50;

    // 상대방 컨텍스트에 따른 메타 카운터 가산점
    if (scouting) {
      if (itemId === 'GIANT_SLAYER' && scouting.opponentHighHpCount >= 2) {
        score += (role === 'AD_CARRY' || role === 'BRUISER') ? 40 : 20;
      }
      if (itemId === 'SUNFIRE_CAPE' && scouting.opponentHealShieldTraits >= 1) {
        score += (role === 'TANK' || role === 'BRUISER') ? 40 : 20;
      }
      if (itemId === 'BRAMBLE_VEST' && scouting.opponentHighHpCount >= 2 && role === 'TANK') {
        score += 30;
      }
      if (itemId === 'PROTECTORS_VOW' && role === 'TANK') {
        score += 25;
      }
    }

    // 유닛 성급 및 캐리력 보정
    if (unit.starLevel === 3) score += 35;
    else if (unit.starLevel === 2) score += 15;

    return score;
  }

  /**
   * 고정 BiS를 강제하지 않고, 대기석의 기본 재료 및 완성 아이템을 유동적으로 합성/장착한다.
   * - 대기석 재료가 3개 이상 놀고 있으면 완성 아이템 즉시 합성 보너스 부여
   * - 가장 높은 효용(Utility)을 내는 (조합템 쌍 -> 대상 기물)을 찾아 즉시 합성
   * - 이미 완성된 아이템은 가장 어울리는 유닛에게 즉시 장착
   * - 잉여 단일 재료는 역할군에 맞게 적절히 배분
   */
  private dynamicallyCraftAndEquipItems(
    bot: Participant,
    brain: BotBrainState,
    allBoardUnits: UnitInstance[],
    scouting?: ScoutingContext
  ): void {
    if (bot.itemBench.length === 0 || allBoardUnits.length === 0) return;

    // 1. 이미 itemBench에 있는 완성 아이템들을 먼저 최적 유닛에게 장착
    for (let i = bot.itemBench.length - 1; i >= 0; i--) {
      const itemId = bot.itemBench[i];
      const itemDef = ITEM_DEFINITIONS[itemId];
      if (!itemDef || !itemDef.isCompleted) continue;

      let bestUnit: UnitInstance | null = null;
      let bestScore = -999;

      for (const unit of allBoardUnits) {
        if (unit.items.length >= 3) continue;
        const score = this.evaluateCompletedItemForUnit(
          itemId as CompletedItemId,
          unit,
          scouting
        );
        if (score > bestScore) {
          bestScore = score;
          bestUnit = unit;
        }
      }

      if (bestUnit && bestScore >= 35) {
        bot.equipItemToUnit(i, bestUnit.instanceId);
      }
    }

    // 2. 대기석의 기본 조합 재료들로 동적 최적 합성 탐색
    let canStillCraft = true;
    while (canStillCraft) {
      canStillCraft = false;

      // 현재 대기석의 기본 재료 인덱스 목록
      const baseIndices: number[] = [];
      for (let idx = 0; idx < bot.itemBench.length; idx++) {
        const id = bot.itemBench[idx];
        const def = ITEM_DEFINITIONS[id];
        if (def && !def.isCompleted) {
          baseIndices.push(idx);
        }
      }

      if (baseIndices.length < 2) break;

      let bestCraftScore = -999;
      let bestMatIdx1 = -1;
      let bestMatIdx2 = -1;
      let bestTargetUnit: UnitInstance | null = null;

      // 모든 (i, j) 기본 재료 쌍 검사
      for (let a = 0; a < baseIndices.length; a++) {
        for (let b = a + 1; b < baseIndices.length; b++) {
          const idxA = baseIndices[a];
          const idxB = baseIndices[b];
          const matA = bot.itemBench[idxA] as BaseItemId;
          const matB = bot.itemBench[idxB] as BaseItemId;
          const craftedId = combineBaseItems(matA, matB);
          if (!craftedId) continue;

          for (const unit of allBoardUnits) {
            if (unit.items.length >= 3) continue;
            let score = this.evaluateCompletedItemForUnit(
              craftedId,
              unit,
              scouting
            );

            // 대기석에 조합 아이템이 3개 이상 쌓여있다면 빠른 템포 합성을 위해 보너스 부여!
            if (baseIndices.length >= 4) score += 30;
            else if (baseIndices.length >= 3) score += 15;

            // 영웅 증강 타겟 기물에게 아이템을 몰아주면 추가 보너스
            if (brain.heroTargetUnitId === unit.unitId) score += 25;

            if (score > bestCraftScore) {
              bestCraftScore = score;
              bestMatIdx1 = idxA;
              bestMatIdx2 = idxB;
              bestTargetUnit = unit;
            }
          }
        }
      }

      // 합성 결정 문턱값 (재료가 많을수록 더 유연하고 빠르게 합성!)
      const threshold = baseIndices.length >= 4 ? 40 : baseIndices.length >= 3 ? 55 : 68;

      if (bestTargetUnit && bestCraftScore >= threshold && bestMatIdx1 !== -1 && bestMatIdx2 !== -1) {
        // splice 인덱스 꼬임 방지를 위해 큰 인덱스부터 장착
        const firstIdx = Math.max(bestMatIdx1, bestMatIdx2);
        const secondIdx = Math.min(bestMatIdx1, bestMatIdx2);
        bot.equipItemToUnit(firstIdx, bestTargetUnit.instanceId);
        bot.equipItemToUnit(secondIdx, bestTargetUnit.instanceId);
        canStillCraft = true; // 추가 재료가 남아있을 수 있으므로 루프 계속
      }
    }

    // 3. 남은 잉여 단일 재료 아이템들을 역할군에 맞게 분배
    for (let i = bot.itemBench.length - 1; i >= 0; i--) {
      const itemId = bot.itemBench[i];
      const itemDef = ITEM_DEFINITIONS[itemId];
      if (!itemDef || itemDef.isCompleted) continue;

      let bestUnit: UnitInstance | null = null;
      let highestPower = -1;

      for (const unit of allBoardUnits) {
        if (unit.items.length >= 3) continue;
        const role = getUnitRole(unit.unitId);

        let match = false;
        if (itemId === 'ARMOR' && (role === 'TANK' || role === 'BRUISER')) match = true;
        else if ((itemId === 'SWORD' || itemId === 'BOW') && (role === 'AD_CARRY' || role === 'BRUISER')) match = true;
        else if ((itemId === 'ROD' || itemId === 'TEAR') && role === 'AP_CARRY') match = true;
        else if (role === 'BRUISER') match = true;

        if (match) {
          const power = unit.starLevel * 30 + unit.cost * 10;
          if (power > highestPower) {
            highestPower = power;
            bestUnit = unit;
          }
        }
      }

      if (bestUnit) {
        bot.equipItemToUnit(i, bestUnit.instanceId);
      }
    }
  }
}
