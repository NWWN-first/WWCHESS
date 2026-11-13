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
import { NeuralBotEngine, NeuralInferenceResult } from './NeuralBotEngine';
import {
  analyzeComps,
  applyNeuralCorrection,
  applyShopOpportunityCost,
  buildContestLedger,
  buildEconomyPlan,
  buildItemBoardPlan,
  buildPivotPlan,
  defaultRuleBasedPlanner,
  EconomyPlan,
  EconomyTempo,
  getPersonaBias,
  ItemBoardPlan,
  itemPlanPriorityBonus,
  isDynamicStrategyExperimentEnabled,
  mergeEconomyWithCorrection,
  ObservableStateSummary,
  selectDenyTargets,
  shouldDeferNonBisCraft,
  StrategyChangeReason,
  validateStrategicPlan,
} from './strategy';

export interface MissedDesirableBuyEvent {
  botId: string;
  persona: string;
  roundLabel: string;
  stageGroup: '2~3' | '4' | '5+';
  unitId: string;
  cost: number;
}

export interface PivotTelemetryEvent {
  round: string;
  from: TraitId;
  to: TraitId;
  contested: number;
  poolRatio: number;
}

export interface PivotTelemetry {
  /** CompAnalyzer가 stay가 아닌 추천을 낸 횟수 (Stage2) */
  attempts: number;
  /** 안전 게이트로 hard가 soft/stay로 강등 */
  contestGateFail: number;
  /** soft-flex 적용 횟수 */
  noAlternative: number;
  /** targetTrait 실제 변경 횟수 (= pivotedCount 증가분) */
  executed: number;
  events: PivotTelemetryEvent[];
}

export interface BotBrainState {
  botId: string;
  persona: AIPersona;
  /** 게임 시작 시 고정된 초기 목표 시너지 (피벗 성과 비교용) */
  initialTrait: TraitId;
  targetTrait: TraitId;
  secondaryTrait: TraitId;
  heroTargetUnitId?: string;
  deniedUnitInstanceIds: Set<string>;
  pivotedCount: number;
  pivotTelemetry: PivotTelemetry;
  /** Stage1/2 CompAnalyzer + PivotPlanner 최근 상태 */
  lastCompDecision?: {
    decision: string;
    compId: string;
    compName: string;
    total: number;
    margin: number;
    reason: string;
    blockedReason?: string;
  };
  activeCompId?: string;
  activeCompLevelHint?: 'reroll5' | 'fast8' | 'fast9';
  buyPriorityUnitIds: Set<string>;
  keepUnitIds: Set<string>;
  /** Stage2 PivotPlanner 템포 힌트 */
  pivotGoldFloorHint: number | null;
  pivotMaxRerollsHint: number | null;
  pivotPreferRolldown: boolean;
  /** Stage3: 이번 판 견제 구매/홀드 텔레메트리 */
  denyBuyCount: number;
  denyHoldUnitIds: Set<string>;
  /** Stage4: 통합 경제 계획 */
  lastEconomyPlan?: {
    tempo: EconomyTempo;
    goldFloor: number;
    maxRerolls: number;
    targetLevel: number;
    reason: string;
    forceBenchPressure: boolean;
  };
  economyTargetLevel: number;
  economyBuyThresholdBias: number;
  economyOpportunityCostWeight: number;
  economyMaxSellsThisRound: number;
  economySellsThisRound: number;
  economyForceBenchPressure: boolean;
  /** Stage5: 아이템·배치 통합 계획 스냅 */
  lastItemBoardPlan?: {
    primaryCarryUnitId: string | null;
    primaryTankUnitId: string | null;
    positionStance: string;
    slamAggressiveness: number;
    holdForBis: boolean;
    reason: string;
    preferredItemCount: number;
  };
  itemSlamCount: number;
  itemBisHitCount: number;
  itemEquipAttempts: number;
  /** Stage6: 신경망 보정 스냅 */
  lastNeuralCorrection?: {
    applied: boolean;
    reason: string;
    goldFloorDelta: number;
    maxRerollsDelta: number;
    tempoHint: string | null;
    slamAggressivenessDelta: number;
  };
  neuralSlamDelta: number;
  neuralCorrectionAppliedCount: number;
  isRolldownActive: boolean;
  nextActionDelayMs: number;
  rerollsExecutedThisRound: number;
  maxRerollsAllowedThisRound: number;
  targetGoldFloorThisRound: number;
  unitsToDenyCache: Set<string>;
  lastNeuralResult?: NeuralInferenceResult;
  currentRoundLabel?: string;
  /** Step 7b: 페르소나 전환 횟수 (판당 최대 1) */
  personaSwitchCount: number;
  lastPersonaSwitchRoundLabel?: string;
  lastStrategyReason?: StrategyChangeReason;
  absoluteRoundIndex: number;
  lastPersonaSwitchRoundIndex?: number;
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
  boardFillRatio: number;
  interestProgress: number;
  freeRerollNorm: number;
  augmentCountNorm: number;
  hasEconomyAug: number;
  hasCombatAug: number;
  threeStarNorm: number;
  aliveOpponentsNorm: number;
  relativeHpNorm: number;
  goldLeadNorm: number;
  pairPressureNorm: number;
  stageLateFlag: number;
  skillNorm: number;
  /** 24-d feature vector for NeuralBotEngine */
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

const BOT_NEUTRAL_NAMES = [
  '아서', '실비아', '카이', '엘레나', '빅토르', '루시안', '세레나',
  '펠릭스', '모르간', '오리온', '다리우스', '제피르', '트리스탄', '발레리아',
  '클라우드', '레오나르도', '베아트리스', '아델', '로버트', '카스텔', '잭', '볼트'
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
  public missedDesirableBuyEvents: MissedDesirableBuyEvent[] = [];

  constructor(rankManager: RankManager) {
    this.rankManager = rankManager;
  }

  public resetMissedDesirableBuys(): void {
    this.missedDesirableBuyEvents = [];
  }

  /**
   * 게임 시작 시 7명의 AI 봇 참가자를 생성하고 4가지 인간형 페르소나를 골고루 배정한다.
   */
  public createSevenAIBots(): Participant[] {
    this.botBrains.clear();

    // [Step 6] RANDOM_PERSONA=1일 때: 7명 각자 독립 랜덤 페르소나, 중복 없는 중립 이름 풀, 랜덤 시작 시너지
    if (typeof process !== 'undefined' && process.env?.RANDOM_PERSONA === '1') {
      const availablePersonas: AIPersona[] = [
        'HYPER_ROLLER',
        'FAST_NINE_GREEDY',
        'GOBLIN_GAMBLER',
        'FLEX_MASTER',
      ];

      // Fisher-Yates shuffle for neutral name pool
      const shuffledNames = [...BOT_NEUTRAL_NAMES];
      for (let i = shuffledNames.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledNames[i], shuffledNames[j]] = [shuffledNames[j], shuffledNames[i]];
      }

      return Array.from({ length: 7 }, (_, idx) => {
        const botId = `ai_bot_${idx + 1}`;
        const persona = availablePersonas[Math.floor(Math.random() * availablePersonas.length)];
        const name = `봇${idx + 1} [${shuffledNames[idx]}]`;
        const initialTrait: TraitId =
          persona === 'GOBLIN_GAMBLER'
            ? 'GOLDEN_GOBLIN'
            : STANDARD_ORIGIN_TRAITS[Math.floor(Math.random() * STANDARD_ORIGIN_TRAITS.length)];

        const bot = new Participant(botId, name, true, persona);
        this.initializeBotBrain(bot, persona, initialTrait);
        return bot;
      });
    }

    // 기본 동작 (RANDOM_PERSONA=0): 기존 BOT_PRESETS 셔플 동작 유지
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
      initialTrait,
      targetTrait: initialTrait,
      secondaryTrait,
      deniedUnitInstanceIds: new Set<string>(),
      pivotedCount: 0,
      pivotTelemetry: {
        attempts: 0,
        contestGateFail: 0,
        noAlternative: 0,
        executed: 0,
        events: [],
      },
      buyPriorityUnitIds: new Set<string>(),
      keepUnitIds: new Set<string>(),
      pivotGoldFloorHint: null,
      pivotMaxRerollsHint: null,
      pivotPreferRolldown: false,
      denyBuyCount: 0,
      denyHoldUnitIds: new Set<string>(),
      economyTargetLevel: 7,
      economyBuyThresholdBias: 0,
      economyOpportunityCostWeight: 0.2,
      economyMaxSellsThisRound: 1,
      economySellsThisRound: 0,
      economyForceBenchPressure: false,
      itemSlamCount: 0,
      itemBisHitCount: 0,
      itemEquipAttempts: 0,
      neuralSlamDelta: 0,
      neuralCorrectionAppliedCount: 0,
      isRolldownActive: false,
      nextActionDelayMs: 900,
      rerollsExecutedThisRound: 0,
      maxRerollsAllowedThisRound: 6,
      targetGoldFloorThisRound: 20,
      unitsToDenyCache: new Set<string>(),
      personaSwitchCount: 0,
      absoluteRoundIndex: 0,
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

  /** 외부(시뮬/GameLoop)에서 brain 조회 */
  public getBotBrain(botId: string): BotBrainState | undefined {
    return this.botBrains.get(botId);
  }

  /**
   * Step 7b: EXPERIMENT_DYNAMIC_STRATEGY=1 일 때만 스테이지 시작(X-1/X-2)에 페르소나 전환을 평가한다.
   * 시너지 피봇과는 분리(Decision #1). prepareBotForRealTimePrep 직전에 호출해야 골드/리롤 캐시가 새 페르소나로 갱신된다.
   */
  public evaluateDynamicStrategies(
    allParticipants: Participant[],
    sharedPool: SharedPoolManager,
    roundLabel: string,
    absoluteRoundIndex: number
  ): void {
    if (!isDynamicStrategyExperimentEnabled()) return;

    for (const bot of allParticipants) {
      if (!bot.isAI || bot.isEliminated) continue;
      const brain = this.getOrCreateBrain(bot);
      brain.absoluteRoundIndex = absoluteRoundIndex;
      brain.currentRoundLabel = roundLabel;

      const summary = this.buildObservableStateSummary(
        bot,
        brain,
        allParticipants,
        sharedPool,
        roundLabel
      );
      const plan = defaultRuleBasedPlanner.propose(summary);
      const boardTwoStarCount = bot.board
        .flat()
        .filter((u): u is UnitInstance => !!u && u.starLevel >= 2).length;
      const ownedUnitsOfRecommendedTrait = bot
        .getAllUnitLocations()
        .filter((loc) => loc.unit.traits.includes(plan.recommendedMainTrait))
        .length;
      const roundsSinceLastSwitch =
        brain.lastPersonaSwitchRoundIndex === undefined
          ? null
          : absoluteRoundIndex - brain.lastPersonaSwitchRoundIndex;

      const validated = validateStrategicPlan(plan, {
        currentPersona: brain.persona,
        currentTrait: brain.targetTrait,
        boardTwoStarCount,
        ownedUnitsOfRecommendedTrait,
        personaSwitchCount: brain.personaSwitchCount,
        roundsSinceLastSwitch,
      });
      if (!validated) continue;
      if (validated.recommendedPersona === brain.persona) continue;

      this.applyPersonaSwitch(
        bot,
        brain,
        validated.recommendedPersona,
        validated.reason,
        roundLabel,
        absoluteRoundIndex
      );
    }
  }

  private buildObservableStateSummary(
    bot: Participant,
    brain: BotBrainState,
    allParticipants: Participant[],
    sharedPool: SharedPoolManager,
    roundLabel: string
  ): ObservableStateSummary {
    const alive = allParticipants.filter((p) => !p.isEliminated);
    const boardValue = bot.board
      .flat()
      .filter((u): u is UnitInstance => !!u)
      .reduce((sum, u) => sum + u.cost * Math.pow(3, u.starLevel - 1) * 3, 0);
    const benchUnitCount = bot.bench.filter((u) => u !== null).length;
    const threeStarCount = bot
      .getAllUnitLocations()
      .filter((loc) => loc.unit.starLevel >= 3).length;

    const traitContestCounts: Partial<Record<TraitId, number>> = {};
    for (const p of alive) {
      if (p.id === bot.id) continue;
      const states = SynergyEngine.calculateActiveSynergies(p).filter(
        (s) => s.count > 0 && s.activeEffect
      );
      for (const st of states) {
        traitContestCounts[st.definition.id] =
          (traitContestCounts[st.definition.id] ?? 0) + 1;
      }
    }

    const powerScores = alive.map((p) => {
      const value = p.board
        .flat()
        .filter((u): u is UnitInstance => !!u)
        .reduce((sum, u) => sum + u.cost * Math.pow(3, u.starLevel - 1) * 3, 0);
      return { id: p.id, score: value + p.hp * 0.35 + p.level * 8 };
    });
    powerScores.sort((a, b) => b.score - a.score);
    const relativePowerRank =
      powerScores.findIndex((x) => x.id === bot.id) + 1 || alive.length;
    const averageTableLevel =
      alive.reduce((s, p) => s + p.level, 0) / Math.max(1, alive.length);

    const coreIds = Object.values(UNIT_TEMPLATES)
      .filter((t) => t.traits.includes(brain.targetTrait))
      .map((t) => t.id);
    let remaining = 0;
    let total = 0;
    for (const id of coreIds) {
      remaining += sharedPool.getRemainingCount(id);
      total += sharedPool.getMaxCount(id);
    }
    const coreUnitsRemainingRatio =
      total > 0 ? remaining / total : 0.5;

    const streak =
      bot.winStreak > 0
        ? bot.winStreak
        : bot.loseStreak > 0
        ? -bot.loseStreak
        : 0;

    return {
      botId: bot.id,
      self: {
        hp: bot.hp,
        gold: bot.gold,
        level: bot.level,
        xp: bot.xp,
        streak,
        boardValue,
        benchUnitCount,
        currentMainTrait: brain.targetTrait,
        coreUnitsRemainingRatio,
        persona: brain.persona,
        threeStarCount,
        goblinVaultStacks: bot.goblinVaultStacks,
      },
      table: {
        stage: roundLabel,
        traitContestCounts,
        relativePowerRank,
        averageTableLevel,
      },
    };
  }

  private applyPersonaSwitch(
    bot: Participant,
    brain: BotBrainState,
    nextPersona: AIPersona,
    reason: StrategyChangeReason,
    roundLabel: string,
    absoluteRoundIndex: number
  ): void {
    brain.persona = nextPersona;
    bot.persona = nextPersona;
    brain.personaSwitchCount += 1;
    brain.lastPersonaSwitchRoundLabel = roundLabel;
    brain.lastPersonaSwitchRoundIndex = absoluteRoundIndex;
    brain.lastStrategyReason = reason;
    // 고블린 이탈 시 롤다운 플래그는 다음 prepareBotForRealTimePrep에서 재평가
    if (nextPersona !== 'GOBLIN_GAMBLER') {
      brain.isRolldownActive = false;
    }
  }

  // ==========================================================================
  // Soft Skill Noise — 사람처럼 모든 판단에 실력/온도 기반 흔들림·실수 주입
  // (상점 utility에만 temperature가 쓰이던 구조를 레벨업/리롤/증강/아이템까지 확장)
  // ==========================================================================

  /** [-amp, +amp] 범위의 온도 비례 노이즈 */
  private softNoise(aiParams: AISkillParameters, amplitude: number): number {
    return (Math.random() - 0.5) * 2 * aiParams.temperature * amplitude;
  }

  /**
   * 올바른 행동을 가끔 건너뛰는 실수.
   * 저티어(낮은 skill / 높은 temperature)일수록 더 자주 발생.
   */
  private softShouldSkip(
    aiParams: AISkillParameters,
    baseChance: number
  ): boolean {
    const skillFactor = 1.35 - aiParams.skillLevel; // IRON≈1.1, CHALLENGER≈0.4
    const p = Math.min(
      0.55,
      Math.max(0, baseChance * skillFactor * (0.45 + aiParams.temperature))
    );
    return Math.random() < p;
  }

  /**
   * 하드 클리프(skillLevel >= 0.7) 대신 시그모이드 확률 게이트.
   * 문턱 아래 티어도 가끔 적응하고, 문턱 위도 가끔 놓친다.
   */
  private softSkillGate(
    aiParams: AISkillParameters,
    threshold: number = 0.7
  ): boolean {
    const margin = aiParams.skillLevel - threshold;
    const p = 1 / (1 + Math.exp(-margin * 14));
    return Math.random() < Math.min(0.97, Math.max(0.04, p));
  }

  /** 골드 하한선을 사람처럼 ± 흔들기 */
  private softJitterGoldFloor(
    floor: number,
    aiParams: AISkillParameters
  ): number {
    if (floor <= 0) return 0;
    return Math.max(0, floor + Math.round(this.softNoise(aiParams, 14)));
  }

  /** 상점 구매 문턱 (기본 48). 저티어는 좋은 기물도 놓치거나 잡템을 산다. */
  private softBuyThreshold(aiParams: AISkillParameters): number {
    return 48 + this.softNoise(aiParams, 16);
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
    brain.currentRoundLabel = currentRound;
    const aiParams = this.rankManager.getAISkillParameters();

    // 0. 신경망 먼저 — 피봇/견제/매크로가 urgencies를 참조
    const stateTensor = this.extractAIStateTensor(bot, allParticipants, currentRound);
    const neuralResult = NeuralBotEngine.getInstance().predictSync(stateTensor.features);
    brain.lastNeuralResult = neuralResult;

    // 1. 정찰/견제 (trait 피벗은 Stage2 Planner가 담당)
    brain.unitsToDenyCache = this.performScoutingAndPivot(
      bot,
      brain,
      allParticipants,
      sharedPool,
      aiParams
    );

    // Stage2/3: ContestLedger → CompAnalyzer → PivotPlanner
    const stageNum = parseInt(currentRound.split('-')[0] || '1', 10);
    try {
      const contestLedger = buildContestLedger(
        bot,
        allParticipants,
        sharedPool
      );
      const analysis = analyzeComps({
        bot,
        allParticipants,
        sharedPool,
        currentTrait: brain.targetTrait,
        stage: stageNum,
        roundLabel: currentRound,
        contestLedger,
      });
      const plan = buildPivotPlan({
        bot,
        persona: brain.persona,
        currentTrait: brain.targetTrait,
        pivotedCount: brain.pivotedCount,
        analysis,
        stage: stageNum,
      });

      if (plan.decision !== 'stay') {
        brain.pivotTelemetry.attempts += 1;
      }
      if (plan.blockedReason) {
        brain.pivotTelemetry.contestGateFail += 1;
      }
      if (plan.decision === 'soft-flex' && plan.applyBuyBias) {
        brain.pivotTelemetry.noAlternative += 1;
      }

      if (plan.applyTraitChange && plan.targetTrait !== brain.targetTrait) {
        const fromTrait = brain.targetTrait;
        brain.targetTrait = plan.targetTrait;
        brain.secondaryTrait = plan.secondaryTrait;
        brain.pivotedCount += 1;
        brain.pivotTelemetry.executed += 1;
        brain.pivotTelemetry.events.push({
          round: currentRound,
          from: fromTrait,
          to: plan.targetTrait,
          contested: 0,
          poolRatio: analysis.recommended.breakdown.contestEase / 100,
        });
      } else if (plan.applyBuyBias) {
        brain.secondaryTrait = plan.secondaryTrait;
      }

      if (plan.applyBuyBias) {
        brain.activeCompId = plan.activeComp.id;
        brain.activeCompLevelHint = plan.activeComp.levelHint;
        brain.buyPriorityUnitIds = new Set(plan.buyPriorityUnitIds);
        brain.keepUnitIds = new Set(plan.keepUnitIds);
      }
      brain.pivotGoldFloorHint = plan.goldFloorHint;
      brain.pivotMaxRerollsHint = plan.maxRerollsHint;
      brain.pivotPreferRolldown = plan.preferRolldown;

      brain.lastCompDecision = {
        decision: plan.decision,
        compId: plan.activeComp.id,
        compName: plan.activeComp.name,
        total: analysis.recommended.total,
        margin: analysis.margin,
        reason: plan.reason,
        blockedReason: plan.blockedReason,
      };

      // hard/soft 전환 직후 벤치 정리로 슬롯 확보
      if (plan.decision === 'hard-pivot' || plan.decision === 'soft-flex') {
        this.cleanupBenchIfFull(bot, brain, sharedPool);
      }

      // Stage3: 컴프 keep/buy가 정해진 뒤 견제 대상 재선정 (듀얼 목적 반영)
      const denyRefresh = selectDenyTargets({
        ledger: contestLedger,
        self: bot,
        keepUnitIds: brain.keepUnitIds,
        buyPriorityUnitIds: brain.buyPriorityUnitIds,
        alreadyDenying: brain.unitsToDenyCache,
        maxTargets: 3,
        minDenyValue: 40,
      });
      for (const id of denyRefresh) brain.unitsToDenyCache.add(id);
      brain.denyHoldUnitIds = new Set(brain.unitsToDenyCache);
    } catch {
      // 분석/플래너 실패해도 봇 루프는 계속
    }

    const persona = brain.persona;
    const isEmergencySurvival = bot.hp <= 30;
    // 고블린 금고 메커니즘(시너지 스택) — 페르소나 하드분기가 아니라 금고 상태
    const isGoblinCashoutTurn =
      bot.goblinVaultStacks >= 12 &&
      (bot.hp <= 35 || bot.goblinVaultStacks >= 55);

    // Stage4: EconomyPlanner (Stage5: 페르소나는 bias delta만)
    let economyPlan = buildEconomyPlan({
      bot,
      persona,
      stage: stageNum,
      // Stage6: 매크로는 보정층에서 처리 — 플래너에는 힌트만 약하게 전달
      macroAction: neuralResult.macroAction,
      levelHint: brain.activeCompLevelHint ?? null,
      pivotDecision: (brain.lastCompDecision?.decision as
        | 'stay'
        | 'soft-flex'
        | 'hard-pivot'
        | undefined) ?? null,
      pivotGoldFloorHint: brain.pivotGoldFloorHint,
      pivotMaxRerollsHint: brain.pivotMaxRerollsHint,
      pivotPreferRolldown: brain.pivotPreferRolldown,
      isEmergencySurvival,
      isGoblinCashoutTurn,
      skillLevel: aiParams.skillLevel,
    });

    // Stage6: 신경망 보정층 — 플래너 출력에 delta
    const neuralCorr = applyNeuralCorrection({
      economy: economyPlan,
      neural: neuralResult,
      skillLevel: aiParams.skillLevel,
      isEmergency: isEmergencySurvival || isGoblinCashoutTurn,
    });
    brain.lastNeuralCorrection = {
      applied: neuralCorr.applied,
      reason: neuralCorr.reason,
      goldFloorDelta: neuralCorr.goldFloorDelta,
      maxRerollsDelta: neuralCorr.maxRerollsDelta,
      tempoHint: neuralCorr.tempoHint,
      slamAggressivenessDelta: neuralCorr.slamAggressivenessDelta,
    };
    brain.neuralSlamDelta = neuralCorr.applied
      ? neuralCorr.slamAggressivenessDelta
      : 0;
    if (neuralCorr.applied) {
      brain.neuralCorrectionAppliedCount += 1;
      economyPlan = mergeEconomyWithCorrection(economyPlan, neuralCorr);
    }

    this.applyEconomyPlanToBrain(brain, economyPlan, aiParams, isEmergencySurvival, isGoblinCashoutTurn);

    // 2. 현재 열린 첫 상점에서 유효 기물 즉시 구매 및 기본 배치 수행
    const scouting = this.analyzeScoutingContext(bot, allParticipants);
    if (brain.economyForceBenchPressure) {
      this.runEconomyBenchCleanup(bot, brain, sharedPool);
    }
    this.buyDesirableUnitsFromCurrentShop(
      bot,
      brain,
      brain.unitsToDenyCache,
      sharedPool,
      aiParams,
      scouting
    );
    this.performPersonaLevelUpStep(bot, brain, currentRound, aiParams);
    this.tryUseBotDuplicators(bot, brain, sharedPool);

    this.optimizeBoardAndItems(bot, brain, allParticipants, sharedPool, aiParams);

    // 3. 첫 번째 동적 APM 행동 타이머 설정 (올인 Rolldown: 0.6~1.0초, 평상시: 1.0~5.0초)
    brain.nextActionDelayMs = this.computeNextBotActionDelayMs(brain.isRolldownActive);
  }

  private applyEconomyPlanToBrain(
    brain: BotBrainState,
    plan: EconomyPlan,
    aiParams: AISkillParameters,
    isEmergencySurvival: boolean,
    isGoblinCashoutTurn: boolean
  ): void {
    brain.rerollsExecutedThisRound = 0;
    brain.economySellsThisRound = 0;
    brain.economyTargetLevel = plan.targetLevel;
    brain.economyBuyThresholdBias = plan.buyThresholdBias;
    brain.economyOpportunityCostWeight = plan.opportunityCostWeight;
    brain.economyMaxSellsThisRound = plan.maxSellsThisRound;
    brain.economyForceBenchPressure = plan.forceBenchPressure;
    brain.isRolldownActive = plan.preferRolldown || plan.tempo === 'rolldown';

    let goldFloor = plan.goldFloor;
    let maxRerolls = plan.maxRerolls;
    if (!isEmergencySurvival && !isGoblinCashoutTurn) {
      goldFloor = this.softJitterGoldFloor(goldFloor, aiParams);
      maxRerolls = Math.max(
        0,
        maxRerolls + Math.round(this.softNoise(aiParams, 2.5))
      );
    }
    brain.targetGoldFloorThisRound = goldFloor;
    brain.maxRerollsAllowedThisRound = maxRerolls;
    brain.lastEconomyPlan = {
      tempo: plan.tempo,
      goldFloor,
      maxRerolls,
      targetLevel: plan.targetLevel,
      reason: plan.reason,
      forceBenchPressure: plan.forceBenchPressure,
    };
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
    brain.currentRoundLabel = currentRound;

    brain.nextActionDelayMs -= deltaMs;
    if (brain.nextActionDelayMs > 0) {
      return false;
    }

    const aiParams = this.rankManager.getAISkillParameters();
    const isEmergencySurvival = bot.hp <= 30;
    const isGoblinCashoutTurn =
      bot.goblinVaultStacks >= 12 &&
      (bot.hp <= 35 || bot.goblinVaultStacks >= 55);

    // Stage4: 라운드 계획의 preferRolldown 유지, 위기만 동적 승격
    if (isEmergencySurvival || isGoblinCashoutTurn) {
      brain.isRolldownActive = true;
    }

    // 올인 상태일 때는 하한선을 비상용 0G 또는 10G로 동적 하향하여 '다다다다' 리롤이 실제로 동작하도록 보장!
    const effectiveGoldFloor = brain.isRolldownActive
      ? (isEmergencySurvival || isGoblinCashoutTurn ? 0 : 10)
      : brain.targetGoldFloorThisRound;

    // 다음 액션 딜레이 재설정 (올인 타이밍: 600ms~1000ms 초고속 다다다다 리롤, 평상시: 1000ms~5000ms 여유로운 운영)
    brain.nextActionDelayMs = this.computeNextBotActionDelayMs(brain.isRolldownActive);

    // 1. 레벨업 체크
    this.performPersonaLevelUpStep(bot, brain, currentRound, aiParams);

    const scouting = this.analyzeScoutingContext(bot, allParticipants);

    // Stage4: 리롤 안 해도 벤치 만석이면 선제 정리 (진단 경로1)
    if (brain.economyForceBenchPressure) {
      this.runEconomyBenchCleanup(bot, brain, sharedPool);
    }

    // 2. 상점 리롤 및 기물 쓸어담기 1스텝 실행
    let didAct = false;
    const nextRerollCost = bot.freeRerolls > 0 ? 0 : 2;
    const canReroll =
      brain.rerollsExecutedThisRound < brain.maxRerollsAllowedThisRound &&
      bot.gold - nextRerollCost >= effectiveGoldFloor;
    // Soft noise: 리롤할 수 있어도 가끔 "한 템포 쉬기"
    if (canReroll && !this.softShouldSkip(aiParams, 0.12)) {
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
    } else if (!canReroll && brain.economyForceBenchPressure) {
      // 골드하한 홀드 중에도 만석이면 잡템 매각만 수행
      this.runEconomyBenchCleanup(bot, brain, sharedPool);
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
    currentRound: string,
    aiParams: AISkillParameters
  ): void {
    const targetGoldFloor = brain.targetGoldFloorThisRound;

    // Soft noise: XP 살 타이밍인데 한 템포 미룸
    if (this.softShouldSkip(aiParams, 0.14)) return;

    // Stage4/5: EconomyPlanner targetLevel + PersonaBias (하드 페르소나 게이트 없음)
    const bias = getPersonaBias(brain.persona);
    const levelJitter = Math.round(this.softNoise(aiParams, 1.0));
    let levelCap = Math.min(
      10,
      Math.max(1, (brain.economyTargetLevel || 7) + levelJitter)
    );

    // 롤 선호가 높고 다성 부족하면 목표를 조금 낮춤 (하드 return 대신)
    if (bias.rollAppetite >= 0.65) {
      const threeStarCount = this.countTotalThreeStarUnits(bot);
      if (threeStarCount < 2 && bot.level >= 5) {
        levelCap = Math.min(levelCap, Math.max(5, brain.economyTargetLevel));
      }
    }

    while (bot.gold - 4 >= targetGoldFloor && bot.level < levelCap) {
      if (this.softShouldSkip(aiParams, 0.08)) break;
      if (!bot.buyXp()) break;
      if (brain.lastEconomyPlan?.tempo !== 'spike') break;
    }
    void currentRound;
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
    brain.currentRoundLabel = currentRound;
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
    let boardUnits = 0;
    const copyCounts = new Map<string, number>();
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const u = bot.board[r][c];
        if (u) {
          boardUnits++;
          boardPower += u.cost * 10 + u.starLevel * 25 + u.items.length * 15;
          copyCounts.set(u.unitId, (copyCounts.get(u.unitId) ?? 0) + u.starLevel);
        }
      }
    }
    for (const u of bot.bench) {
      if (u) copyCounts.set(u.unitId, (copyCounts.get(u.unitId) ?? 0) + u.starLevel);
    }
    const boardPowerNorm = Math.min(1, boardPower / 500);
    const boardFillRatio = Math.min(1, boardUnits / Math.max(1, bot.level));

    const winStreakNorm = Math.min(1, bot.winStreak / 10);
    const lossStreakNorm = Math.min(1, bot.loseStreak / 10);

    const brain = this.getOrCreateBrain(bot);
    const scouting = this.analyzeScoutingContext(bot, allParticipants);
    const contestedCount = scouting.traitContestedMap.get(brain.targetTrait) ?? 0;
    const contestedTraitRatio = Math.min(1, contestedCount / 4);
    const emergencyFlag = bot.hp <= 35 ? 1 : 0;

    const interestProgress = Math.min(1, bot.gold / 50);
    const freeRerollNorm = Math.min(1, bot.freeRerolls / 10);
    const augmentCountNorm = Math.min(1, bot.augments.length / 3);

    let hasEconomyAug = 0;
    let hasCombatAug = 0;
    for (const augId of bot.augments) {
      const def = AUGMENT_DEFINITIONS.find((a) => a.id === augId);
      if (!def) continue;
      if (def.category === 'ECONOMY') hasEconomyAug = 1;
      if (def.category === 'COMBAT' || def.category === 'TRAIT') hasCombatAug = 1;
    }

    const threeStarNorm = Math.min(1, this.countTotalThreeStarUnits(bot) / 3);
    const aliveOthers = allParticipants.filter((p) => !p.isEliminated && p.id !== bot.id);
    const aliveOpponentsNorm = Math.min(1, aliveOthers.length / 7);
    const avgEnemyHp =
      aliveOthers.length > 0
        ? aliveOthers.reduce((s, p) => s + p.hp, 0) / aliveOthers.length
        : bot.hp;
    const relativeHpNorm = Math.max(0, Math.min(1, (bot.hp / Math.max(1, avgEnemyHp)) / 2));
    const avgEnemyGold =
      aliveOthers.length > 0
        ? aliveOthers.reduce((s, p) => s + p.gold, 0) / aliveOthers.length
        : bot.gold;
    const goldLeadNorm = Math.max(0, Math.min(1, (bot.gold - avgEnemyGold + 30) / 60));

    let nearPairs = 0;
    for (const count of copyCounts.values()) {
      if (count >= 2) nearPairs++;
    }
    const pairPressureNorm = Math.min(1, nearPairs / 6);
    const stageLateFlag = stageNum >= 5 ? 1 : 0;
    const skillNorm = Math.max(
      0,
      Math.min(1, this.rankManager.getAISkillParameters().skillLevel)
    );

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
      boardFillRatio,
      interestProgress,
      freeRerollNorm,
      augmentCountNorm,
      hasEconomyAug,
      hasCombatAug,
      threeStarNorm,
      aliveOpponentsNorm,
      relativeHpNorm,
      goldLeadNorm,
      pairPressureNorm,
      stageLateFlag,
      skillNorm,
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
      boardFillRatio,
      interestProgress,
      freeRerollNorm,
      augmentCountNorm,
      hasEconomyAug,
      hasCombatAug,
      threeStarNorm,
      aliveOpponentsNorm,
      relativeHpNorm,
      goldLeadNorm,
      pairPressureNorm,
      stageLateFlag,
      skillNorm,
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

    // 신경망 value + combatAugBias 연동
    if (brain.lastNeuralResult) {
      const val = brain.lastNeuralResult.valueScore;
      const combatBias = brain.lastNeuralResult.urgencies?.combatAugBias ?? 0.5;
      if (val < 0.45 && (aug.category === 'ECONOMY' || aug.category === 'HERO')) {
        score += 20;
      }
      if (
        val >= 0.65 &&
        (aug.category === 'COMBAT' || aug.category === 'TRAIT' || aug.tier === 'PRISMATIC')
      ) {
        score += 25;
      }
      if (combatBias > 0.58 && (aug.category === 'COMBAT' || aug.category === 'TRAIT')) {
        score += Math.round((combatBias - 0.5) * 70);
      } else if (combatBias < 0.42 && aug.category === 'ECONOMY') {
        score += Math.round((0.5 - combatBias) * 60);
      }
      if (brain.lastNeuralResult.macroAction === 'HIGHROLL_GREED' && aug.category === 'ECONOMY') {
        score += 28;
      }
      if (brain.lastNeuralResult.macroAction === 'STABILIZE_REROLL' && aug.category === 'COMBAT') {
        score += 22;
      }
    }

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

    // 아이템 관련 증강 여부 (S18 확장)
    const isItemAug =
      aug.effectKey === 'ITEM_PACK_1' ||
      aug.effectKey === 'SMALL_PACK' ||
      aug.effectKey === 'USEFUL_METAL' ||
      aug.effectKey === 'THIEF_GLOVES' ||
      aug.effectKey === 'THIEF_GLOVES_2' ||
      aug.effectKey === 'RADIANT_RELICS' ||
      aug.effectKey === 'LIVING_FORGE' ||
      aug.effectKey === 'MAKE_WAY' ||
      aug.effectKey === 'OVERFLOWING_BLADE' ||
      aug.effectKey === 'OVERFLOWING_ROD' ||
      aug.effectKey === 'OVERFLOWING_BELT' ||
      aug.effectKey === 'PORTABLE_FORGE' ||
      aug.effectKey === 'SWORD_CRAFT' ||
      aug.effectKey === 'ROD_CRAFT' ||
      aug.effectKey === 'PANDORA_ITEMS' ||
      aug.effectKey === 'PANDORA_ITEMS_2' ||
      (aug.immediateRandomCompletedItems ?? 0) > 0 ||
      (aug.immediateRandomBaseItems ?? 0) > 0;

    // 즉발 골드 폭탄 — 시뮬에서 돈폭풍/거래중심지 과픽 방지
    const rawGold = aug.immediateGold ?? 0;
    if (rawGold >= 30) score -= 25;
    else if (rawGold >= 20) score -= 8;
    if ((aug.freeRerollsGranted ?? 0) >= 12) score -= 15;

    if (isCrisis) {
      if (
        aug.effectKey === 'TINY_TITANS' ||
        aug.effectKey === 'CELESTIAL_BLESSING' ||
        aug.effectKey === 'CELESTIAL_BLESSING_2' ||
        aug.effectKey === 'CELESTIAL_BLESSING_3' ||
        aug.effectKey === 'ASCENSION' ||
        aug.effectKey === 'INCOMPLETE_ASCENSION' ||
        aug.effectKey === 'FINAL_ASCENSION' ||
        aug.effectKey === 'GROUP_HUG' ||
        aug.effectKey === 'GROUP_HUG_2' ||
        aug.effectKey === 'STAND_UNITED' ||
        aug.effectKey === 'STAND_UNITED_1' ||
        aug.effectKey === 'STAND_UNITED_2' ||
        aug.effectKey === 'STAND_UNITED_3' ||
        aug.effectKey === 'LAST_STAND' ||
        aug.effectKey === 'HEALING_ORB_1' ||
        aug.effectKey === 'HEALING_ORB_2' ||
        aug.effectKey === 'ARCANE_VICTORY'
      ) {
        score += 90;
      } else if (aug.category === 'COMBAT' || isItemAug) {
        score += 55;
      }

      if (
        aug.effectKey === 'HEDGE_FUND' ||
        aug.effectKey === 'HEDGE_FUND_GOLD' ||
        aug.effectKey === 'DIABOLIC_FINANCE' ||
        aug.effectKey === 'LEVEL_UP' ||
        aug.effectKey === 'RICH_GET_RICHER' ||
        aug.effectKey === 'CAPITAL_GAIN_1' ||
        aug.effectKey === 'CAPITAL_GAIN_2' ||
        aug.effectKey === 'GOLDEN_EGG' ||
        aug.effectKey === 'MONEY_STORM' ||
        aug.effectKey === 'INVESTMENT' ||
        aug.effectKey === 'INVESTMENT_PLUS'
      ) {
        score -= 70;
      } else if (aug.category === 'ECONOMY' && rawGold < 12) {
        score -= 20;
      } else if (aug.category === 'ECONOMY') {
        score -= 35;
      }
    } else if (isHealthy) {
      if (
        aug.category === 'ECONOMY' ||
        aug.effectKey === 'LEVEL_UP' ||
        aug.effectKey === 'DIABOLIC_FINANCE' ||
        aug.effectKey === 'HEDGE_FUND' ||
        aug.effectKey === 'HEDGE_FUND_GOLD' ||
        aug.effectKey === 'EXPLOSIVE_GROWTH' ||
        aug.effectKey === 'SILVER_SPOON'
      ) {
        score += 55;
      }
      // 여유 체력인데 즉발 전투만 과도하면 약간 감점
      if (aug.effectKey === 'FINAL_ASCENSION' || aug.effectKey === 'ARCANE_VICTORY') {
        score -= 10;
      }
    }

    // 4. Stage5: 페르소나 소프트 편향으로 증강 가중 (하드 분기 제거)
    const bias = getPersonaBias(brain.persona);
    const isRerollAug =
      aug.effectKey === 'GOLDEN_TICKET' ||
      aug.effectKey === 'CLEARANCE_SALE' ||
      aug.effectKey === 'PANDORA_BENCH' ||
      aug.effectKey === 'FATED_DUPLICATION' ||
      aug.effectKey === 'TRADE_SECTOR' ||
      aug.effectKey === 'TRADE_SECTOR_PLUS' ||
      aug.effectKey === 'REROLL_DAY' ||
      aug.effectKey === 'HYPER_ROLL' ||
      aug.effectKey === 'PRISMATIC_TICKET' ||
      aug.effectKey === 'EPIC_REROLL' ||
      aug.effectKey === 'MAXED_OUT' ||
      (aug.freeRerollsGranted ?? 0) >= 5;

    const isLevelEconomyAug =
      aug.effectKey === 'LEVEL_UP' ||
      aug.effectKey === 'SILVER_SPOON' ||
      aug.effectKey === 'HEDGE_FUND' ||
      aug.effectKey === 'EXPLOSIVE_GROWTH' ||
      aug.effectKey === 'EXPLOSIVE_GROWTH_PLUS' ||
      aug.effectKey === 'NEW_ERA' ||
      aug.effectKey === 'LATER_GROWTH';

    if (aug.category === 'COMBAT') score += bias.augmentCombatBias;
    if (aug.category === 'ECONOMY' || isLevelEconomyAug) {
      score += bias.augmentEconomyBias;
    }
    if (isRerollAug) score += bias.augmentRerollBias;
    if (isItemAug) score += 20 + bias.augmentCombatBias * 0.3;

    // 롤 선호 + 아직 다성 적으면 리롤/배달 가산
    if (bias.rollAppetite >= 0.6 && threeStarCount < 2) {
      if (
        aug.effectKey === 'BUILD_A_BUDDY' ||
        aug.effectKey === 'FORGE_A_FRIEND' ||
        aug.effectKey === 'CHAMP_DELIVERY' ||
        aug.effectKey === 'COLD_START' ||
        aug.effectKey === 'ONE_TWO_THREE'
      ) {
        score += 40;
      }
    }
    // 레벨 선호 + 저레벨이면 리롤 올인 증강 억제
    if (bias.levelAppetite >= 0.7 && bot.level < 8) {
      if (aug.effectKey === 'BUILD_A_BUDDY' || aug.effectKey === 'FORGE_A_FRIEND') {
        score -= 22;
      }
    }
    // 고레벨이면 전투 가산
    if (bot.level >= 8 && aug.category === 'COMBAT') score += 25;
    if (aug.grantRandomAugmentTier) score += 15;
    if (
      aug.heroUnitId &&
      UNIT_TEMPLATES[aug.heroUnitId]?.traits.includes('GOLDEN_GOBLIN')
    ) {
      score += bias.goblinUnitBias;
    }
    if (
      aug.effectKey === 'GOBLIN_CROWN' ||
      aug.effectKey === 'DIABOLIC_FINANCE' ||
      aug.effectKey === 'CALCULATED_LOSS' ||
      aug.effectKey === 'TACTICAL_RETREAT' ||
      aug.effectKey === 'KINGSLAYER'
    ) {
      score += Math.round(bias.augmentEconomyBias * 0.5);
    }

    // 5. 아이템 보유량 연계
    const totalItems =
      bot.itemBench.length +
      ownedLocations.reduce((acc, l) => acc + l.unit.items.length, 0);
    if (totalItems <= 4 && isItemAug) {
      score += 45;
    }

    // 6. 즉발 유닛/XP 보상 가산 (배달·부스터·성장)
    if (aug.immediateRandomUnits && aug.immediateRandomUnits.length > 0) {
      const unitValue = aug.immediateRandomUnits.reduce(
        (s, r) => s + r.cost * r.count * (r.starLevel ?? 1) * 4,
        0
      );
      score += Math.min(55, unitValue);
    }
    if ((aug.immediateXp ?? 0) >= 10) score += 20;
    if (aug.grantRandomAugmentTier) score += 15;

    return score;
  }

  /**
   * 증강체 라운드(2-1, 3-2, 4-2) 진입 시 AI 봇이 정밀 가치평가(evaluateAugmentValue)를 통해 최적의 증강체를 선택한다.
   */
  public selectAugmentForBot(
    bot: Participant,
    tier: AugmentTier,
    sharedPool: SharedPoolManager,
    allParticipants?: Participant[],
    stage?: '2-1' | '3-2' | '4-2'
  ): AugmentDefinition | null {
    if (bot.isEliminated) return null;
    const brain = this.getOrCreateBrain(bot);
    const choices = DopamineEngine.rollAugmentChoices(
      bot,
      tier,
      [],
      stage,
      3
    );
    if (choices.length === 0) return null;

    const aiParams = this.rankManager.getAISkillParameters();
    const scored: Array<{ aug: AugmentDefinition; score: number }> = [];
    for (const aug of choices) {
      const base = this.evaluateAugmentValue(aug, bot, brain, allParticipants);
      // Soft noise: 증강 가치에 온도 노이즈 → 저티어는 2등 증강을 고르기 쉬움
      scored.push({ aug, score: base + this.softNoise(aiParams, 42) });
    }
    scored.sort((a, b) => b.score - a.score);

    let bestAug = scored[0].aug;
    // Soft noise: 가끔 2등 픽 (사람처럼 "그럴싸한 다른 카드" 선택)
    if (
      scored.length >= 2 &&
      this.softShouldSkip(aiParams, 0.18) &&
      scored[1].score > scored[0].score - 55
    ) {
      bestAug = scored[1].aug;
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
    const unitsToDeny = new Set<string>();

    // 인간 플레이어 대상 고전 견제 (고코스트 카피 임박)
    for (const other of allParticipants) {
      if (other.isEliminated || other.id === bot.id) continue;
      const denyUrge = brain.lastNeuralResult?.urgencies.deny ?? 0.2;
      const neuralWantsDeny =
        brain.lastNeuralResult?.macroAction === 'DENY_HOLD' || denyUrge > 0.6;
      if (!other.isAI && this.softSkillGate(aiParams, neuralWantsDeny ? 0.5 : 0.7)) {
        for (const template of Object.values(UNIT_TEMPLATES)) {
          if (template.cost >= 4) {
            const playerCopies = other.getOwnedUnitCopiesCount(template.id);
            const denyThreshold = template.cost === 5 ? 4 : 5;
            if (
              playerCopies >= denyThreshold &&
              !other.hasThreeStarUnit(template.id)
            ) {
              unitsToDeny.add(template.id);
            }
          }
        }
      }
    }

    // Stage3: ContestLedger 기반 봇↔봇 포함 견제 대상
    const denyUrge = brain.lastNeuralResult?.urgencies.deny ?? 0.2;
    const neuralWantsDeny =
      brain.lastNeuralResult?.macroAction === 'DENY_HOLD' || denyUrge > 0.55;
    if (this.softSkillGate(aiParams, neuralWantsDeny ? 0.4 : 0.62)) {
      const ledger = buildContestLedger(bot, allParticipants, sharedPool);
      const targets = selectDenyTargets({
        ledger,
        self: bot,
        keepUnitIds: brain.keepUnitIds,
        buyPriorityUnitIds: brain.buyPriorityUnitIds,
        alreadyDenying: unitsToDeny,
        maxTargets: neuralWantsDeny ? 4 : 3,
        minDenyValue: neuralWantsDeny ? 36 : 42,
      });
      for (const id of targets) unitsToDeny.add(id);
      brain.denyHoldUnitIds = new Set(unitsToDeny);
    }

    return unitsToDeny;
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
      bot.goblinVaultStacks >= 12 &&
      (bot.hp <= 35 || bot.goblinVaultStacks >= 55);
    const stageNum = parseInt(currentRound.split('-')[0] || '2', 10);

    // Stage4/5/6: 즉시전투 경로 — 경제 계획 + 신경망 보정
    let economyPlan = buildEconomyPlan({
      bot,
      persona,
      stage: stageNum,
      macroAction: brain.lastNeuralResult?.macroAction ?? null,
      levelHint: brain.activeCompLevelHint ?? null,
      pivotDecision: (brain.lastCompDecision?.decision as
        | 'stay'
        | 'soft-flex'
        | 'hard-pivot'
        | undefined) ?? null,
      pivotGoldFloorHint: brain.pivotGoldFloorHint,
      pivotMaxRerollsHint: brain.pivotMaxRerollsHint,
      pivotPreferRolldown: brain.pivotPreferRolldown,
      isEmergencySurvival,
      isGoblinCashoutTurn,
      skillLevel: aiParams.skillLevel,
    });
    const neuralCorr = applyNeuralCorrection({
      economy: economyPlan,
      neural: brain.lastNeuralResult,
      skillLevel: aiParams.skillLevel,
      isEmergency: isEmergencySurvival || isGoblinCashoutTurn,
    });
    brain.lastNeuralCorrection = {
      applied: neuralCorr.applied,
      reason: neuralCorr.reason,
      goldFloorDelta: neuralCorr.goldFloorDelta,
      maxRerollsDelta: neuralCorr.maxRerollsDelta,
      tempoHint: neuralCorr.tempoHint,
      slamAggressivenessDelta: neuralCorr.slamAggressivenessDelta,
    };
    brain.neuralSlamDelta = neuralCorr.applied
      ? neuralCorr.slamAggressivenessDelta
      : 0;
    if (neuralCorr.applied) {
      brain.neuralCorrectionAppliedCount += 1;
      economyPlan = mergeEconomyWithCorrection(economyPlan, neuralCorr);
    }
    this.applyEconomyPlanToBrain(
      brain,
      economyPlan,
      aiParams,
      isEmergencySurvival,
      isGoblinCashoutTurn
    );

    if (brain.economyForceBenchPressure) {
      this.runEconomyBenchCleanup(bot, brain, sharedPool);
    }

    // A. 현재 상점(5칸)에서 즉시 구매할 기물 및 고티어 견제 기물 스캔
    this.buyDesirableUnitsFromCurrentShop(
      bot,
      brain,
      unitsToDenyFromPlayer,
      sharedPool,
      aiParams,
      scouting
    );

    // B. 레벨업 (EconomyPlanner targetLevel)
    this.performPersonaLevelUpStep(bot, brain, currentRound, aiParams);
    // 즉시전투는 틱이 없으므로 spike면 목표까지 추가 XP
    if (
      brain.lastEconomyPlan?.tempo === 'spike' &&
      !this.softShouldSkip(aiParams, 0.12)
    ) {
      const floor = brain.targetGoldFloorThisRound;
      while (
        bot.gold - 4 >= floor &&
        bot.level < brain.economyTargetLevel
      ) {
        if (!bot.buyXp()) break;
      }
    }

    // C. 상점 리롤 및 기물 수집 루프 (계획의 maxRerolls)
    const targetGoldFloor = brain.targetGoldFloorThisRound;
    const maxRerollsThisTurn = brain.maxRerollsAllowedThisRound;
    let rerollsDone = 0;
    while (rerollsDone < maxRerollsThisTurn) {
      const nextRerollCost = bot.freeRerolls > 0 ? 0 : 2;
      if (bot.gold - nextRerollCost < targetGoldFloor) {
        break;
      }
      // Soft noise: 리롤 도중 멈춤
      if (this.softShouldSkip(aiParams, 0.1)) break;

      this.cleanupBenchIfFull(bot, brain, sharedPool);

      if (!bot.rerollShop(sharedPool)) {
        break;
      }
      rerollsDone += 1;
      brain.rerollsExecutedThisRound = rerollsDone;

      this.buyDesirableUnitsFromCurrentShop(
        bot,
        brain,
        unitsToDenyFromPlayer,
        sharedPool,
        aiParams,
        scouting
      );
    }

    // Stage4: 전투 직전 벤치 압박 마무리
    this.finalizePrepEconomy(bot, brain, sharedPool);
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

      // 1) Soft skill gate 견제 구매 (Stage3: 봇 간 ContestLedger 포함)
      // 자해 방지: 이미 벤치 견제 홀드가 2기 이상이면 추가 순수견제 중단
      const currentDenyHolds = brain.deniedUnitInstanceIds.size;
      const dualPurpose =
        brain.buyPriorityUnitIds.has(unitId) || brain.keepUnitIds.has(unitId);
      const goldBuffer = dualPurpose ? 2 : 8;
      const canAffordDeny = bot.gold >= template.cost + goldBuffer;
      const denyCapOk = dualPurpose || currentDenyHolds < 2;
      if (
        this.softSkillGate(aiParams, 0.58) &&
        unitsToDenyFromPlayer.has(unitId) &&
        canAffordDeny &&
        denyCapOk &&
        bot.canBuyUnit(unitId, template.cost) &&
        !this.softShouldSkip(aiParams, 0.12)
      ) {
        if (bot.buyUnit(slotIdx, sharedPool)) {
          brain.denyBuyCount += 1;
          const loc = bot
            .getAllUnitLocations()
            .find((l) => l.area === 'BENCH' && l.unit.unitId === unitId);
          if (loc) {
            // 순수 견제만 denied 표시 — 내 컴프 유닛은 보드에 쓸 수 있게 둠
            if (!dualPurpose) {
              brain.deniedUnitInstanceIds.add(loc.unit.instanceId);
            }
          }
          continue;
        }
      }

      // 2) 일반 기물 구매 가치 — softBuyThreshold + EconomyPlanner 문턱 바이어스
      const utilityScore = this.evaluateShopUnitUtility(
        bot,
        brain,
        template,
        sharedPool,
        aiParams,
        scouting
      );
      const buyThreshold =
        this.softBuyThreshold(aiParams) + (brain.economyBuyThresholdBias || 0);

      if (utilityScore >= buyThreshold) {
        // Soft noise: 좋은 기물인데도 가끔 안 삼 (저티어일수록 자주)
        if (this.softShouldSkip(aiParams, 0.16)) continue;

        let cleanupAttempted = false;
        if (!bot.canBuyUnit(unitId, template.cost)) {
          this.runEconomyBenchCleanup(bot, brain, sharedPool);
          cleanupAttempted = true;
        }
        const bought = bot.buyUnit(slotIdx, sharedPool);
        if (cleanupAttempted && !bought) {
          const round = brain.currentRoundLabel ?? '1-1';
          const stageNum = parseInt(round.split('-')[0] || '1', 10);
          const stageGroup: '2~3' | '4' | '5+' =
            stageNum <= 3 ? '2~3' : stageNum === 4 ? '4' : '5+';
          this.missedDesirableBuyEvents.push({
            botId: bot.id,
            persona: brain.persona,
            roundLabel: round,
            stageGroup,
            unitId,
            cost: template.cost,
          });
        }
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

    // 6. Stage5: 페르소나 소프트 편향 (하드 if 분기 대신)
    {
      const bias = getPersonaBias(brain.persona);
      if (template.cost <= 2) score += bias.lowCostShopBias;
      if (template.cost >= 4) score += bias.highCostShopBias;
      if (template.cost === 5 && bias.highCostShopBias > 0) score += 8;
      if (
        template.cost === 1 &&
        bot.level >= 7 &&
        ownedCopies === 0 &&
        bias.highCostShopBias > 15
      ) {
        score -= 18;
      }
      if (template.traits.includes('GOLDEN_GOBLIN')) {
        score += bias.goblinUnitBias;
      }
      if (
        bot.goblinVaultStacks >= 12 &&
        (bot.hp <= 35 || bot.goblinVaultStacks >= 55) &&
        template.cost >= 4
      ) {
        score += 28;
      }
      // FLEX류 기본 코스트 가산은 highCostShopBias가 낮을 때 약하게
      if (Math.abs(bias.lowCostShopBias) < 5 && Math.abs(bias.highCostShopBias) <= 10) {
        score += template.cost * 4;
      }
    }

    // Stage2: 활성 컴프 구매 우선순위
    if (brain.buyPriorityUnitIds.has(template.id)) {
      score += 42;
    } else if (
      brain.keepUnitIds.size > 0 &&
      !brain.keepUnitIds.has(template.id) &&
      ownedCopies === 0 &&
      template.cost >= 3
    ) {
      score -= 18; // 컴프 밖 고코스트 신규 수집 억제
    }
    // Stage3: 견제 대상이면 소폭 가산 (순수 견제는 deny 경로가 우선)
    if (brain.unitsToDenyCache.has(template.id)) {
      score += 12;
    }

    // Stage4: 벤치 기회비용 — 컴프 기여 − 슬롯 잠금 비용
    const emptyBench = bot.bench.filter((s) => s === null).length;
    score = applyShopOpportunityCost({
      baseScore: score,
      ownedCopies,
      isBuyPriority: brain.buyPriorityUnitIds.has(template.id),
      isKeepUnit: brain.keepUnitIds.has(template.id),
      matchesTargetTrait: matchesTarget,
      cost: template.cost,
      emptyBenchSlots: emptyBench,
      opportunityCostWeight: brain.economyOpportunityCostWeight ?? 0.2,
    });

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
    this.runEconomyBenchCleanup(bot, brain, sharedPool, 1);
  }

  /**
   * Stage4: EconomyPlanner 벤치 압박 — 라운드 매각 예산 내에서 저가치 벤치 정리.
   * 1성 우선, 만석+압박 시 keep 밖 저가치 2성도 1회까지 허용(3성 레이스 제외).
   */
  private runEconomyBenchCleanup(
    bot: Participant,
    brain: BotBrainState,
    sharedPool: SharedPoolManager,
    maxSellsOverride?: number
  ): void {
    const emptyCount = bot.bench.filter((s) => s === null).length;
    if (emptyCount > 1 && !brain.economyForceBenchPressure) return;
    if (emptyCount > 2) return;

    const budget = Math.max(
      0,
      (maxSellsOverride ?? brain.economyMaxSellsThisRound) -
        brain.economySellsThisRound
    );
    if (budget <= 0) return;

    let sold = 0;
    while (sold < budget) {
      const emptyNow = bot.bench.filter((s) => s === null).length;
      // 빈칸 2개 이상이면 충분 (압박 모드가 아니면 중단)
      if (emptyNow >= 2) break;
      if (emptyNow >= 1 && !brain.economyForceBenchPressure && sold > 0) break;

      const candidate = this.pickWorstBenchUnit(bot, brain, emptyNow === 0);
      if (!candidate) break;
      if (!bot.sellUnit(candidate.instanceId, sharedPool)) break;
      brain.economySellsThisRound += 1;
      sold += 1;
    }
  }

  private pickWorstBenchUnit(
    bot: Participant,
    brain: BotBrainState,
    allowWeakTwoStar: boolean
  ): UnitInstance | null {
    let worstBenchUnit: UnitInstance | null = null;
    let worstValue = 9999;

    for (const unit of bot.bench) {
      if (!unit) continue;
      if (brain.deniedUnitInstanceIds.has(unit.instanceId)) continue;
      if (unit.starLevel >= 3) continue;

      const copies = bot.getOwnedUnitCopiesCount(unit.unitId);
      const isKeep = brain.keepUnitIds.has(unit.unitId);
      const isPriority = brain.buyPriorityUnitIds.has(unit.unitId);

      if (unit.starLevel >= 2) {
        // 2성: 만석+압박이고 컴프 밖이며 3성 레이스(copies>=6)가 아닐 때만
        if (!allowWeakTwoStar) continue;
        if (isKeep || isPriority) continue;
        if (copies >= 6) continue;
        if (unit.traits.includes(brain.targetTrait)) continue;
      }

      let keepScore = unit.cost * 6 + copies * 12;
      if (unit.starLevel >= 2) keepScore += 50;
      if (unit.traits.includes(brain.targetTrait)) keepScore += 30;
      if (unit.traits.includes('GOLDEN_GOBLIN')) {
        keepScore += getPersonaBias(brain.persona).goblinUnitBias;
      }
      if (isKeep) keepScore += 40;
      else if (brain.keepUnitIds.size > 0) keepScore -= 25;
      if (isPriority) keepScore += 20;

      // 페어(2장)/합성 직전은 보존
      if (copies === 2 || copies === 5 || copies === 8) keepScore += 55;

      if (keepScore < worstValue) {
        worstValue = keepScore;
        worstBenchUnit = unit;
      }
    }

    if (!worstBenchUnit) return null;
    // 빈칸 1개일 때는 정말 낮은 가치만, 만석이면 강제
    const emptyCount = bot.bench.filter((s) => s === null).length;
    if (emptyCount === 0 || worstValue < 70 || brain.economyForceBenchPressure) {
      return worstBenchUnit;
    }
    return null;
  }

  /**
   * 전투 진입 직전: EconomyPlanner 벤치 압박 마무리 (실험 플래그 없이 상시).
   */
  public finalizePrepEconomy(
    bot: Participant,
    brain: BotBrainState,
    sharedPool: SharedPoolManager
  ): void {
    const empty = bot.bench.filter((s) => s === null).length;
    if (empty === 0 || (empty <= 1 && bot.gold >= 15)) {
      brain.economyForceBenchPressure = true;
      this.runEconomyBenchCleanup(bot, brain, sharedPool);
    }
  }

  /**
   * [Step 5 B] EXPERIMENT_BENCH_CLEAR 실험용 대기석 정리
   * 환경변수 EXPERIMENT_BENCH_CLEAR=1일 때만 활성화 (기본 0, 비활성 시 완전히 건너뜀).
   * 정비 단계 종료 직전(전투 진입 직전)에 대기석 빈칸이 1개 이하이면,
   * cleanupBenchIfFull과 같은 keepScore 기준으로 가장 낮은 1성 기물
   * (targetTrait가 아니고 2성이 아닌 것)을 최대 2기까지 매각.
   */
  public executeExperimentalBenchClear(
    bot: Participant,
    brain: BotBrainState,
    sharedPool: SharedPoolManager
  ): { soldCount: number; goldGained: number } {
    if (typeof process === 'undefined' || process.env?.EXPERIMENT_BENCH_CLEAR !== '1') {
      return { soldCount: 0, goldGained: 0 };
    }

    const emptyCount = bot.bench.filter((s) => s === null).length;
    if (emptyCount > 1) {
      return { soldCount: 0, goldGained: 0 };
    }

    const candidates: { unit: UnitInstance; score: number }[] = [];
    for (const unit of bot.bench) {
      if (!unit) continue;
      if (unit.starLevel >= 2) continue; // 2성이 아닌 것
      if (unit.traits.includes(brain.targetTrait)) continue; // targetTrait가 아닌 것
      if (brain.deniedUnitInstanceIds?.has(unit.instanceId)) continue; // 견제 기물 보호

      let keepScore = unit.cost * 6 + bot.getOwnedUnitCopiesCount(unit.unitId) * 12;
      if (unit.traits.includes('GOLDEN_GOBLIN')) {
        keepScore += getPersonaBias(brain.persona).goblinUnitBias;
      }
      candidates.push({ unit, score: keepScore });
    }

    candidates.sort((a, b) => a.score - b.score);
    const toSell = candidates.slice(0, 2);
    let soldCount = 0;
    let goldGained = 0;
    for (const item of toSell) {
      const gBefore = bot.gold;
      if (bot.sellUnit(item.unit.instanceId, sharedPool)) {
        soldCount++;
        goldGained += bot.gold - gBefore;
      }
    }
    return { soldCount, goldGained };
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
      getPersonaBias(brain.persona).allowGoblinSandbag &&
      bot.hp > 35 &&
      bot.goblinVaultStacks >= 1 &&
      bot.goblinVaultStacks < 55;

    // 2. 보드에 배치할 정예 기물(최대 bot.level기) 선정 (중복 unitId보다는 고유 기물 우선)
    // Stage5: 활성 컴프 캐리/탱 보드 우선
    const scoredUnits = allUnits.map((unit) => {
      let power =
        unit.starLevel * 38 +
        unit.cost * 14 +
        unit.items.length * 15;
      if (unit.traits.includes(brain.targetTrait)) power += 24;
      if (unit.traits.includes(brain.secondaryTrait)) power += 12;
      if (brain.buyPriorityUnitIds.has(unit.unitId)) power += 18;
      if (brain.keepUnitIds.has(unit.unitId)) power += 12;
      if (unit.traits.includes('GOLDEN_GOBLIN')) {
        power += Math.max(
          20,
          getPersonaBias(brain.persona).goblinUnitBias + 15
        );
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

    // 3. Stage5 ItemBoardPlanner — 위협 열·캐리/탱·배치 stance
    const threatCol = this.findThreatCarryCol(
      allParticipantsList,
      bot,
      aiParams,
      humanPlayer
    );
    const stageNum = parseInt(
      (brain.currentRoundLabel ?? '1-1').split('-')[0] || '1',
      10
    );
    const itemU =
      brain.lastNeuralResult?.urgencies?.item ??
      brain.lastNeuralResult?.itemUrgency ??
      0;
    const itemPlan = buildItemBoardPlan({
      bot,
      deployedUnits,
      activeCompId: brain.activeCompId,
      stage: stageNum,
      scout: {
        opponentHighHpCount: scouting.opponentHighHpCount,
        opponentHealShieldTraits: scouting.opponentHealShieldTraits,
        opponentVanguardCount: scouting.opponentVanguardCount,
        opponentMagicCount: scouting.opponentMagicCount,
        threatCol,
      },
      itemUrgency: itemU,
      macroAction: brain.lastNeuralResult?.macroAction ?? null,
      economyTempo: brain.lastEconomyPlan?.tempo ?? null,
    });
    brain.lastItemBoardPlan = {
      primaryCarryUnitId: itemPlan.primaryCarryUnitId,
      primaryTankUnitId: itemPlan.primaryTankUnitId,
      positionStance: itemPlan.positionStance,
      slamAggressiveness: itemPlan.slamAggressiveness,
      holdForBis: itemPlan.holdForBis,
      reason: itemPlan.reason,
      preferredItemCount: itemPlan.preferredCompletedItems.length,
    };

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

    // CC 탱 + 계획상 primary tank 우선
    const ccTankIds = new Set([
      'u2_jeanne',
      'u2_ent',
      'u3_sieg',
      'u4_arthur',
      'u5_goldtooth',
    ]);
    frontlineUnits.sort((a, b) => {
      const aPri =
        (a.unitId === itemPlan.primaryTankUnitId ? 2 : 0) +
        (ccTankIds.has(a.unitId) ? 1 : 0);
      const bPri =
        (b.unitId === itemPlan.primaryTankUnitId ? 2 : 0) +
        (ccTankIds.has(b.unitId) ? 1 : 0);
      if (aPri !== bPri) return bPri - aPri;
      return b.maxHp - a.maxHp;
    });

    // Soft noise: 열 순서를 ±1 흔들기
    let frontCols = [...itemPlan.frontColOrder];
    let backCols = [...itemPlan.backColOrder];
    let assassinCols = [...itemPlan.assassinColOrder];
    if (this.softShouldSkip(aiParams, 0.18)) {
      const jitter = Math.random() < 0.5 ? -1 : 1;
      frontCols = frontCols.map((c) =>
        Math.max(0, Math.min(6, c + jitter))
      );
      frontCols = frontCols.filter((c, i, a) => a.indexOf(c) === i);
    }

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

    // 캐리는 후열 우선 배치 순서에서 앞으로
    backlineUnits.sort((a, b) => {
      const aPri =
        a.unitId === itemPlan.primaryCarryUnitId
          ? 2
          : a.unitId === itemPlan.secondaryCarryUnitId
            ? 1
            : 0;
      const bPri =
        b.unitId === itemPlan.primaryCarryUnitId
          ? 2
          : b.unitId === itemPlan.secondaryCarryUnitId
            ? 1
            : 0;
      return bPri - aPri;
    });

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
    this.dynamicallyCraftAndEquipItems(
      bot,
      brain,
      deployedUnits,
      aiParams,
      scouting,
      itemPlan
    );
  }

  /** Stage5: 상대(또는 전 테이블)에서 가장 위협적인 캐리 열 */
  private findThreatCarryCol(
    allParticipants: Participant[],
    self: Participant,
    aiParams: AISkillParameters,
    humanPlayer: Participant | null
  ): number {
    let threatCol = 3;
    if (!this.softSkillGate(aiParams, 0.55)) return threatCol;

    let highest = -1;
    const scan = (p: Participant) => {
      for (let r = 0; r < Participant.BOARD_ROWS; r++) {
        for (let c = 0; c < Participant.BOARD_COLS; c++) {
          const pu = p.board[r][c];
          if (!pu) continue;
          const score =
            pu.items.length * 40 + pu.starLevel * 25 + pu.cost * 12 + pu.atk;
          if (score > highest) {
            highest = score;
            threatCol = c;
          }
        }
      }
    };

    if (humanPlayer && !humanPlayer.isEliminated) {
      scan(humanPlayer);
    } else {
      for (const p of allParticipants) {
        if (p.id === self.id || p.isEliminated) continue;
        scan(p);
      }
    }

    if (this.softShouldSkip(aiParams, 0.22)) {
      threatCol = Math.max(
        0,
        Math.min(6, threatCol + (Math.random() < 0.5 ? -1 : 1))
      );
    }
    return threatCol;
  }

  /**
   * 보드 유닛과 아이템 간의 유틸리티 점수를 평가한다.
   * - 역할군 적합도 (ITEM_ROLE_AFFINITY)
   * - 상대방 스카우팅 메타 카운터 (거학, 모렐로, 덤불조끼 등)
   * - 유닛의 성급 (3성 / 2성) 및 캐리 비중
   * - Stage5 ItemBoardPlanner BiS/캐리 우선
   */
  public evaluateCompletedItemForUnit(
    itemId: CompletedItemId,
    unit: UnitInstance,
    scouting?: ScoutingContext,
    itemPlan?: ItemBoardPlan | null
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

    if (itemPlan) {
      score += itemPlanPriorityBonus(itemPlan, itemId, unit);
    } else {
      const bis = getUnitRecommendedItems(unit.unitId);
      if (bis.includes(itemId)) score += 18;
    }

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
    aiParams: AISkillParameters,
    scouting?: ScoutingContext,
    itemPlan?: ItemBoardPlan | null
  ): void {
    if (bot.itemBench.length === 0 || allBoardUnits.length === 0) return;

    // Soft noise: 아이템 슬램 자체를 한 템포 미룸 (슬램 공격성 높으면 덜 미룸)
    const skipBase = itemPlan ? 0.12 * (1 - itemPlan.slamAggressiveness * 0.7) : 0.12;
    if (this.softShouldSkip(aiParams, skipBase)) return;

    const slam = Math.max(
      0,
      Math.min(
        1,
        (itemPlan?.slamAggressiveness ?? 0.35) + (brain.neuralSlamDelta ?? 0)
      )
    );

    // 1. 이미 itemBench에 있는 완성 아이템들을 먼저 최적 유닛에게 장착
    for (let i = bot.itemBench.length - 1; i >= 0; i--) {
      const itemId = bot.itemBench[i];
      const itemDef = ITEM_DEFINITIONS[itemId];
      if (!itemDef || !itemDef.isCompleted) continue;

      let bestUnit: UnitInstance | null = null;
      let bestScore = -999;
      let secondUnit: UnitInstance | null = null;
      let secondScore = -999;

      for (const unit of allBoardUnits) {
        if (unit.items.length >= 3) continue;
        const score =
          this.evaluateCompletedItemForUnit(
            itemId as CompletedItemId,
            unit,
            scouting,
            itemPlan
          ) + this.softNoise(aiParams, 18);
        if (score > bestScore) {
          secondScore = bestScore;
          secondUnit = bestUnit;
          bestScore = score;
          bestUnit = unit;
        } else if (score > secondScore) {
          secondScore = score;
          secondUnit = unit;
        }
      }

      const equipThreshold = 35 - slam * 18 + this.softNoise(aiParams, 12);
      // Soft noise: 가끔 2등 유닛에게 슬램
      const target =
        secondUnit &&
        this.softShouldSkip(aiParams, 0.2) &&
        secondScore > bestScore - 25
          ? secondUnit
          : bestUnit;
      if (target && bestScore >= equipThreshold) {
        brain.itemEquipAttempts += 1;
        if (bot.equipItemToUnit(i, target.instanceId)) {
          brain.itemSlamCount += 1;
          const bis = getUnitRecommendedItems(target.unitId);
          if (bis.includes(itemId as CompletedItemId)) {
            brain.itemBisHitCount += 1;
          }
        }
      }
    }

    // 2. 대기석의 기본 조합 재료들로 동적 최적 합성 탐색
    let canStillCraft = true;
    while (canStillCraft) {
      canStillCraft = false;
      if (this.softShouldSkip(aiParams, 0.1 * (1 - slam * 0.5))) break;

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
      let bestCraftedId: CompletedItemId | null = null;

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
            if (
              itemPlan &&
              shouldDeferNonBisCraft(itemPlan, craftedId, unit)
            ) {
              continue;
            }

            let score = this.evaluateCompletedItemForUnit(
              craftedId,
              unit,
              scouting,
              itemPlan
            );

            if (baseIndices.length >= 4) score += 30;
            else if (baseIndices.length >= 3) score += 15;

            const itemU =
              brain.lastNeuralResult?.urgencies?.item ??
              brain.lastNeuralResult?.itemUrgency ??
              0;
            if (brain.lastNeuralResult && itemU > 0.55) {
              score += Math.round(itemU * 30);
            }
            if (brain.lastNeuralResult?.macroAction === 'SLAM_ITEMS') {
              score += 35;
            }

            if (brain.heroTargetUnitId === unit.unitId) score += 25;
            score += this.softNoise(aiParams, 14);

            if (score > bestCraftScore) {
              bestCraftScore = score;
              bestMatIdx1 = idxA;
              bestMatIdx2 = idxB;
              bestTargetUnit = unit;
              bestCraftedId = craftedId;
            }
          }
        }
      }

      // Soft noise + Stage5 slamAggressiveness로 문턱 완화
      const baseThreshold =
        baseIndices.length >= 4 ? 40 : baseIndices.length >= 3 ? 55 : 68;
      const threshold =
        baseThreshold - slam * 22 + this.softNoise(aiParams, 14);

      if (
        bestTargetUnit &&
        bestCraftScore >= threshold &&
        bestMatIdx1 !== -1 &&
        bestMatIdx2 !== -1
      ) {
        const firstIdx = Math.max(bestMatIdx1, bestMatIdx2);
        const secondIdx = Math.min(bestMatIdx1, bestMatIdx2);
        brain.itemEquipAttempts += 1;
        const ok1 = bot.equipItemToUnit(firstIdx, bestTargetUnit.instanceId);
        const ok2 = bot.equipItemToUnit(secondIdx, bestTargetUnit.instanceId);
        if (ok1 || ok2) {
          brain.itemSlamCount += 1;
          if (
            bestCraftedId &&
            getUnitRecommendedItems(bestTargetUnit.unitId).includes(
              bestCraftedId
            )
          ) {
            brain.itemBisHitCount += 1;
          }
        }
        canStillCraft = true;
      }
    }

    // 3. 남은 잉여 단일 재료 — 슬램 공격성 높거나 재료 과다일 때만
    const leftoverBases = bot.itemBench.filter((id) => {
      const d = ITEM_DEFINITIONS[id];
      return d && !d.isCompleted;
    }).length;
    if (slam < 0.45 && leftoverBases < 3 && (bot.hp > 45 || leftoverBases < 2)) {
      return;
    }

    for (let i = bot.itemBench.length - 1; i >= 0; i--) {
      const itemId = bot.itemBench[i];
      const itemDef = ITEM_DEFINITIONS[itemId];
      if (!itemDef || itemDef.isCompleted) continue;
      if (this.softShouldSkip(aiParams, 0.18)) continue;

      let bestUnit: UnitInstance | null = null;
      let highestPower = -1;

      for (const unit of allBoardUnits) {
        if (unit.items.length >= 3) continue;
        const role = getUnitRole(unit.unitId);

        let match = false;
        if (itemId === 'ARMOR' && (role === 'TANK' || role === 'BRUISER'))
          match = true;
        else if (
          (itemId === 'SWORD' || itemId === 'BOW') &&
          (role === 'AD_CARRY' || role === 'BRUISER')
        )
          match = true;
        else if ((itemId === 'ROD' || itemId === 'TEAR') && role === 'AP_CARRY')
          match = true;
        else if (role === 'BRUISER') match = true;

        // Stage5: 캐리/탱에게 재료 우선
        let power =
          unit.starLevel * 30 + unit.cost * 10 + this.softNoise(aiParams, 10);
        if (itemPlan) {
          if (unit.unitId === itemPlan.primaryCarryUnitId) power += 35;
          else if (unit.unitId === itemPlan.secondaryCarryUnitId) power += 18;
          else if (unit.unitId === itemPlan.primaryTankUnitId) power += 22;
        }

        if (match && power > highestPower) {
          highestPower = power;
          bestUnit = unit;
        }
      }

      if (bestUnit) {
        brain.itemEquipAttempts += 1;
        if (bot.equipItemToUnit(i, bestUnit.instanceId)) {
          brain.itemSlamCount += 1;
        }
      }
    }
  }
}
