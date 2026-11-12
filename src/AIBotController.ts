// src/AIBotController.ts

import { DopamineEngine } from './DopamineEngine';
import {
  AUGMENT_DEFINITIONS,
  AugmentDefinition,
  AugmentTier,
  ITEM_DEFINITIONS,
  ItemId,
  TraitId,
  UNIT_TEMPLATES,
  UnitTemplate,
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
    this.buyDesirableUnitsFromCurrentShop(
      bot,
      brain,
      brain.unitsToDenyCache,
      sharedPool,
      aiParams
    );
    this.performPersonaLevelUpStep(bot, brain, currentRound);
    this.tryUseBotDuplicators(bot, brain, sharedPool);

    const humanPlayer =
      allParticipants.find((p) => !p.isAI && !p.isEliminated) ?? null;
    this.optimizeBoardAndItems(bot, brain, humanPlayer, sharedPool, aiParams);

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
      bot.gold >= 50 ||
      (stageNum >= 4 && bot.gold >= 30);

    // 다음 액션 딜레이 재설정 (올인 타이밍: 600ms~1000ms 초고속 다다다다 리롤, 평상시: 1000ms~5000ms 여유로운 운영)
    brain.nextActionDelayMs = this.computeNextBotActionDelayMs(brain.isRolldownActive);

    // 1. 레벨업 체크
    this.performPersonaLevelUpStep(bot, brain, currentRound);

    // 2. 상점 리롤 및 기물 쓸어담기 1스텝 실행
    let didAct = false;
    const nextRerollCost = bot.freeRerolls > 0 ? 0 : 2;
    if (
      brain.rerollsExecutedThisRound < brain.maxRerollsAllowedThisRound &&
      bot.gold - nextRerollCost >= brain.targetGoldFloorThisRound
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
          aiParams
        );
      }
    }

    // 3. 복제기 사용 및 실시간 보드 재배치/아이템 장착 갱신
    this.tryUseBotDuplicators(bot, brain, sharedPool);
    const humanPlayer =
      allParticipants.find((p) => !p.isAI && !p.isEliminated) ?? null;
    this.optimizeBoardAndItems(bot, brain, humanPlayer, sharedPool, aiParams);

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

    this.runEconomyAndShopLoop(
      bot,
      brain,
      unitsToDenyFromPlayer,
      sharedPool,
      currentRound,
      aiParams
    );

    this.tryUseBotDuplicators(bot, brain, sharedPool);

    const humanPlayer = allParticipants.find((p) => !p.isAI && !p.isEliminated) ?? null;
    this.optimizeBoardAndItems(bot, brain, humanPlayer, sharedPool, aiParams);
  }


  /**
   * 증강체 라운드(2-1, 3-2, 4-2) 진입 시 AI 봇이 자신의 페르소나와 덱에 맞는 증강체를 선택한다.
   */
  public selectAugmentForBot(
    bot: Participant,
    tier: AugmentTier,
    sharedPool: SharedPoolManager
  ): AugmentDefinition | null {
    if (bot.isEliminated) return null;
    const brain = this.getOrCreateBrain(bot);
    const choices = DopamineEngine.rollAugmentChoices(bot, tier);
    if (choices.length === 0) return null;

    let bestAug = choices[0];
    let bestScore = -999;

    for (const aug of choices) {
      let score = 10;
      if (
        brain.persona === 'GOBLIN_GAMBLER' &&
        (aug.effectKey === 'GOBLIN_CROWN' || aug.effectKey === 'DIABOLIC_FINANCE')
      ) {
        score += 50;
      }
      if (
        brain.persona === 'HYPER_ROLLER' &&
        (aug.effectKey === 'GOLDEN_TICKET' ||
          aug.effectKey === 'PANDORA_BENCH' ||
          aug.effectKey === 'FATED_DUPLICATION')
      ) {
        score += 45;
      }
      if (
        brain.persona === 'FAST_NINE_GREEDY' &&
        (aug.effectKey === 'DIABOLIC_FINANCE' ||
          aug.effectKey === 'LEVEL_UP' ||
          aug.effectKey === 'TINY_TITANS')
      ) {
        score += 45;
      }
      if (aug.bonusTrait && aug.bonusTrait === brain.targetTrait) {
        score += 40;
      }
      if (score > bestScore) {
        bestScore = score;
        bestAug = aug;
      }
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
    aiParams: AISkillParameters
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
      aiParams
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
    aiParams: AISkillParameters
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

      // 2) 일반 기물 구매 가치(Utility Score) 평가 (공유 풀 잔여량 및 3성 가능성 반영)
      const utilityScore = this.evaluateShopUnitUtility(
        bot,
        brain,
        template,
        sharedPool,
        aiParams
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
   * 상점 기물 1개의 구매 매력도(Utility Score)를 계산한다.
   * 공유 풀 잔여량(30/25/18/10/9)을 확인하여 수학적으로 3성이 불가능해진 경우 무리한 수집을 중단한다.
   */
  private evaluateShopUnitUtility(
    bot: Participant,
    brain: BotBrainState,
    template: UnitTemplate,
    sharedPool: SharedPoolManager,
    aiParams: AISkillParameters
  ): number {
    if (bot.hasThreeStarUnit(template.id)) return -999;

    let score = 20;
    const ownedCopies = bot.getOwnedUnitCopiesCount(template.id);
    const remainingInPool = sharedPool.getRemainingCount(template.id);
    const canStillReachThreeStar =
      ownedCopies + remainingInPool + bot.duplicators >= 9;

    // 1. 보유 개수(페어/합성 근접도) 가산점
    if (ownedCopies === 2 || ownedCopies === 5 || ownedCopies === 8) {
      score += 65; // 이번 1장 구매로 즉시 2성 또는 3성 합성!
    } else if (ownedCopies >= 6) {
      score += canStillReachThreeStar ? 48 : -20; // 풀 고갈로 3성 불가 시 수집 포기
    } else if (ownedCopies >= 3) {
      // 이미 2성을 보유 중일 때: 4~5코스트(풀 10개/9개)가 이미 다른 참가자에게 팔려 3성이 불가능하면 추가 매수 억제
      score += canStillReachThreeStar ? 26 : -25;
    } else if (ownedCopies === 1) {
      score += 22; // 페어 완성
    }

    // 2. 목표 시너지 일치 여부
    if (template.traits.includes(brain.targetTrait)) {
      score += 28;
    }
    if (template.traits.includes(brain.secondaryTrait)) {
      score += 15;
    }

    // 3. 페르소나별 코스트 선호도
    if (brain.persona === 'HYPER_ROLLER' || brain.persona === 'LOW_COST_REROLLER') {
      if (template.cost <= 2) score += 24;
      if (template.cost >= 4 && bot.level <= 6) score -= 18;
    } else if (
      brain.persona === 'FAST_NINE_GREEDY' ||
      brain.persona === 'FAST_NINE_ECONOMIST'
    ) {
      if (template.cost >= 4) score += 34;
      if (template.cost === 5) score += 18;
      if (template.cost === 1 && bot.level >= 7 && ownedCopies === 0) score -= 25;
    } else if (brain.persona === 'GOBLIN_GAMBLER') {
      if (template.traits.includes('GOLDEN_GOBLIN')) {
        score += 52; // 황금 고블린 기물 최우선 수집
      }
      if (
        (bot.hp <= 35 || bot.goblinVaultStacks >= 55) &&
        template.cost >= 4
      ) {
        score += 32; // 캐시아웃 턴에는 4~5코 고밸류 기물 대량 매수
      }
    } else {
      // FLEX_MASTER
      score += template.cost * 5;
    }

    // 4. 인간적 오차(Temperature Noise) 적용
    const noise = (Math.random() - 0.5) * aiParams.temperature * 42;
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

    if (worstBenchUnit && worstValue < 45) {
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
    humanPlayer: Participant | null,
    sharedPool: SharedPoolManager,
    aiParams: AISkillParameters
  ): void {
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
    // 단, 황금 고블린 연패 코인충이 연패 스택을 쌓는 중(isGoblinSandbagging)이라면
    // 고블린 시너지(3/5)를 채운 상태에서 일부러 최대 인원보다 1기 적게 배치하여 연패 유도!
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

    // 6. itemBench에 있는 아이템들을 분석하여 탱커와 주력 딜러에게 자동 장착
    this.autoEquipBotItems(bot, frontlineUnits, backlineUnits, assassinUnits);
  }

  /**
   * AI 봇의 itemBench 아이템들을 방어용/공격용으로 분류하여
   * 방어 아이템은 최고 성급 앞열 탱커에게, 공격/마나/주문력 아이템은 최고 성급 뒷열 딜러/암살자에게 장착한다.
   */
  private autoEquipBotItems(
    bot: Participant,
    frontlineUnits: UnitInstance[],
    backlineUnits: UnitInstance[],
    assassinUnits: UnitInstance[]
  ): void {
    if (bot.itemBench.length === 0) return;

    const tankCandidates = [...frontlineUnits].sort(
      (a, b) => b.starLevel * 30 + b.cost * 10 - (a.starLevel * 30 + a.cost * 10)
    );
    const carryCandidates = [...backlineUnits, ...assassinUnits, ...frontlineUnits].sort(
      (a, b) => b.starLevel * 35 + b.cost * 14 - (a.starLevel * 35 + a.cost * 14)
    );

    // 역순 순회하여 splice 시 인덱스 밀림 방지
    for (let i = bot.itemBench.length - 1; i >= 0; i--) {
      const itemId = bot.itemBench[i];
      const itemDef = ITEM_DEFINITIONS[itemId];
      if (!itemDef) continue;

      const isDefensive = DEFENSIVE_ITEM_IDS.has(itemId);
      const targetPool =
        isDefensive && tankCandidates.length > 0
          ? tankCandidates
          : carryCandidates;

      for (const targetUnit of targetPool) {
        if (bot.equipItemToUnit(i, targetUnit.instanceId)) {
          break;
        }
      }
    }
  }
}
