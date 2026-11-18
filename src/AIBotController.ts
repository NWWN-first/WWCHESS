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
} from './GameData';
import { AIPersona, Participant, UnitInstance } from './Participant';
import { AISkillParameters, RankManager } from './RankManager';
import { SharedPoolManager } from './SharedPoolManager';
import { SynergyEngine } from './SynergyEngine';
import { NeuralBotEngine, NeuralInferenceResult } from './NeuralBotEngine';
import {
  isHighPriorityFrontCc,
  placementColPriority,
  placementRowPriority,
  primaryPlacementBucket,
} from './set6/botPlacementHints';
import {
  BOT_NEURAL_FEATURE_DIM,
  activeSynergyNorm,
  augmentSlotsNorm,
  augmentTierNorm,
  countBoardItems,
  countBoardUnits,
  equippedItemPressure,
  traitBreakpointProgress,
} from './set6/botNeuralFeatures';
import {
  PERSONA_MACRO_LOGIT_BIAS,
  PERSONA_POLICY_TEMPERATURE_HILLCLIMB,
} from './set6/botPersonaTuning';

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
  lastNeuralResult?: NeuralInferenceResult;
  /** 동일 상태에서도 매크로가 갈라지도록 하는 결정론적 시드 */
  decisionSeed: number;
  policyTemperature: number;
  preferOnnxBackend: boolean;
  macroPickNonce: number;
  /** 게임당 1회 DevTools용 추론 백엔드 로그 */
  inferenceBackendLogged: boolean;
}


/** ONNX Runtime 경로를 우선 시도하는 페르소나 (인라인 행렬과 혼합해 봇 전략 다양화) */
const ONNX_PREFERRED_PERSONAS: ReadonlySet<AIPersona> = new Set([
  'MERCENARY_GAMBLER',
  'HYPER_ROLLER',
  'FAST_NINE_GREEDY',
  'LOW_COST_REROLLER',
]);

const PERSONA_POLICY_TEMPERATURE = PERSONA_POLICY_TEMPERATURE_HILLCLIMB;

function hashBotDecisionSeed(botId: string): number {
  let h = 2166136261;
  for (let i = 0; i < botId.length; i++) {
    h ^= botId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function createSeededRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const STANDARD_ORIGIN_TRAITS: TraitId[] = [
  'ACADEMY',
  'SYNDICATE',
  'SCRAP',
  'MERCENARY',
  'YORDLE',
  'CHEMTECH',
  'IMPERIAL',
  'CLOCKWORK',
];

export type UnitRole = 'TANK' | 'AD_CARRY' | 'AP_CARRY' | 'BRUISER';

export function getUnitRole(unitId: string): UnitRole {
  const template = UNIT_TEMPLATES[unitId];
  if (!template) return 'BRUISER';

  if (
    template.traits.includes('COLOSSUS') ||
    template.traits.includes('BODYGUARD') ||
    template.traits.includes('ENCHANTER') ||
    template.traits.includes('PROTECTOR') ||
    (template.stats.def >= 40 && template.stats.range === 1)
  ) {
    if (
      template.traits.includes('ASSASSIN') ||
      template.traits.includes('BRUISER') ||
      template.traits.includes('CHALLENGER')
    ) {
      return 'BRUISER';
    }
    return 'TANK';
  }

  if (
    template.traits.includes('ARCANIST') ||
    template.traits.includes('SCHOLAR')
  ) {
    return 'AP_CARRY';
  }

  if (
    template.traits.includes('SNIPER') ||
    template.traits.includes('TWINSHOT') ||
    template.traits.includes('ASSASSIN')
  ) {
    return 'AD_CARRY';
  }

  if (
    template.traits.includes('BRUISER') ||
    template.traits.includes('CHALLENGER') ||
    template.stats.range === 1
  ) {
    return 'BRUISER';
  }

  return 'AD_CARRY';
}

export interface ScoutingContext {
  opponentHighHpCount: number;
  opponentHealShieldTraits: number;
  /** Opponents running Set 6 BODYGUARD (경호대) line (2+). */
  opponentBodyguardCount: number;
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
  augmentSlotsNorm: number;
  augmentTierNorm: number;
  targetTraitProgressNorm: number;
  mercenaryVaultNorm: number;
  boardFillRatio: number;
  activeSynergyNorm: number;
  equippedItemPressure: number;
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
  { name: '봇1 [도박꾼 잭]', persona: 'HYPER_ROLLER', initialTrait: 'MUTANT' },
  { name: '봇2 [리롤왕 볼트]', persona: 'LOW_COST_REROLLER', initialTrait: 'YORDLE' },
  { name: '봇3 [용병 도박]', persona: 'MERCENARY_GAMBLER', initialTrait: 'MERCENARY' },
  { name: '봇4 [만수르 골드]', persona: 'FAST_NINE_GREEDY', initialTrait: 'IMPERIAL' },
  { name: '봇5 [이자왕 영희]', persona: 'FAST_NINE_ECONOMIST', initialTrait: 'ACADEMY' },
  { name: '봇6 [정석 마스터 린]', persona: 'FLEX_MASTER', initialTrait: 'SCRAP' },
  { name: '봇7 [유연한 카이]', persona: 'FLEX_BALANCED', initialTrait: 'SYNDICATE' },
];

/** 봇마다 독립 추첨(중복 허용). 가중치는 인구 대표성만 살짝 조정. */
const PERSONA_WEIGHT_TABLE: ReadonlyArray<{ persona: AIPersona; weight: number }> = [
  { persona: 'HYPER_ROLLER', weight: 1.1 },
  { persona: 'LOW_COST_REROLLER', weight: 1.1 },
  { persona: 'FAST_NINE_GREEDY', weight: 1 },
  { persona: 'FAST_NINE_ECONOMIST', weight: 1 },
  { persona: 'MERCENARY_GAMBLER', weight: 1 },
  { persona: 'FLEX_MASTER', weight: 1 },
  { persona: 'FLEX_BALANCED', weight: 1 },
];

export function rollWeightedPersona(rng: () => number = Math.random): AIPersona {
  const total = PERSONA_WEIGHT_TABLE.reduce((s, e) => s + e.weight, 0);
  let roll = rng() * total;
  for (const entry of PERSONA_WEIGHT_TABLE) {
    roll -= entry.weight;
    if (roll <= 0) return entry.persona;
  }
  return PERSONA_WEIGHT_TABLE[PERSONA_WEIGHT_TABLE.length - 1]!.persona;
}

function pickInitialTraitForPersona(
  persona: AIPersona,
  rng: () => number = Math.random
): TraitId {
  if (persona === 'MERCENARY_GAMBLER') return 'MERCENARY';
  const idx = Math.floor(rng() * STANDARD_ORIGIN_TRAITS.length);
  return STANDARD_ORIGIN_TRAITS[idx] ?? 'ACADEMY';
}

function lobbyNameForPersona(persona: AIPersona, botIndex: number): string {
  const preset = BOT_PRESETS.find((p) => p.persona === persona);
  if (preset) {
    return preset.name.replace(/봇\d+/, `봇${botIndex}`);
  }
  return `봇${botIndex} [${persona}]`;
}

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
   * 게임 시작 시 7명 AI 봇을 만들고, 봇마다 독립 가중 랜덤으로 페르소나를 배정한다(중복·전원 동일 허용).
   */
  public createSevenAIBots(): Participant[] {
    this.botBrains.clear();

    return Array.from({ length: 7 }, (_, idx) => {
      const botId = `ai_bot_${idx + 1}`;
      const persona = rollWeightedPersona();
      const bot = new Participant(
        botId,
        lobbyNameForPersona(persona, idx + 1),
        true,
        persona
      );
      this.initializeBotBrain(
        bot,
        persona,
        pickInitialTraitForPersona(persona)
      );
      return bot;
    });
  }

  /**
   * 이미 생성된 AI 봇 배열에 봇마다 독립 가중 랜덤 페르소나를 다시 배정한다.
   */
  public assignPersonasToBots(bots: Participant[]): void {
    this.botBrains.clear();

    bots.forEach((bot, idx) => {
      const persona = rollWeightedPersona();
      bot.persona = persona;
      bot.name = lobbyNameForPersona(persona, idx + 1);
      this.initializeBotBrain(
        bot,
        persona,
        pickInitialTraitForPersona(persona)
      );
    });
  }

  private initializeBotBrain(
    bot: Participant,
    persona: AIPersona,
    initialTrait: TraitId
  ): BotBrainState {
    const secondaryTrait: TraitId =
      initialTrait === 'ACADEMY'
        ? 'BODYGUARD'
        : initialTrait === 'SCRAP'
        ? 'INNOVATOR'
        : initialTrait === 'YORDLE'
        ? 'SNIPER'
        : initialTrait === 'MUTANT'
        ? 'ASSASSIN'
        : initialTrait === 'MERCENARY'
        ? 'BRUISER'
        : initialTrait === 'IMPERIAL'
        ? 'CHALLENGER'
        : initialTrait === 'SYNDICATE'
        ? 'ASSASSIN'
        : initialTrait === 'CHEMTECH'
        ? 'BRUISER'
        : 'ARCANIST';

    const decisionSeed = hashBotDecisionSeed(bot.id);
    const policyTemperature =
      PERSONA_POLICY_TEMPERATURE[persona] + (decisionSeed % 23) * 0.008;
    const preferOnnxBackend =
      ONNX_PREFERRED_PERSONAS.has(persona) || decisionSeed % 5 === 0;

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
      decisionSeed,
      policyTemperature,
      preferOnnxBackend,
      macroPickNonce: 0,
      inferenceBackendLogged: false,
    };
    this.botBrains.set(bot.id, state);
    return state;
  }

  private getOrCreateBrain(bot: Participant): BotBrainState {
    let brain = this.botBrains.get(bot.id);
    if (!brain) {
      const persona = bot.persona ?? 'FLEX_MASTER';
      const trait: TraitId =
        persona === 'MERCENARY_GAMBLER' ? 'MERCENARY' : 'ACADEMY';
      brain = this.initializeBotBrain(bot, persona, trait);
    }
    return brain;
  }

  private applyNeuralMacroToBrain(
    bot: Participant,
    brain: BotBrainState,
    neuralResult: NeuralInferenceResult,
    currentRound: string,
    aiParams: AISkillParameters
  ): void {
    const persona = brain.persona;
    const stageNum = parseInt(currentRound.split('-')[0] || '1', 10);
    const isEmergencySurvival = bot.hp <= 30;
    const isMercenaryCashoutTurn =
      persona === 'MERCENARY_GAMBLER' &&
      (bot.hp <= 35 || bot.mercenaryArmoryLoot >= 8);
    const isHighStageAllIn =
      (stageNum >= 4 && bot.gold >= 40) || bot.gold >= 50;

    brain.isRolldownActive =
      isEmergencySurvival ||
      isMercenaryCashoutTurn ||
      isHighStageAllIn ||
      neuralResult.macroAction === 'ROLLDOWN' ||
      neuralResult.macroAction === 'STABILIZE_REROLL';

    brain.targetGoldFloorThisRound = this.getPersonaGoldFloor(
      bot,
      persona,
      isEmergencySurvival,
      isMercenaryCashoutTurn,
      aiParams
    );

    if (neuralResult.macroAction === 'SAVE_INTEREST') {
      brain.targetGoldFloorThisRound = this.getSaveInterestGoldFloor(
        bot,
        persona,
        brain.targetGoldFloorThisRound
      );
    } else if (neuralResult.macroAction === 'ROLLDOWN' || isEmergencySurvival) {
      brain.targetGoldFloorThisRound = Math.min(brain.targetGoldFloorThisRound, 6);
    } else if (neuralResult.macroAction === 'STABILIZE_REROLL') {
      brain.targetGoldFloorThisRound = Math.min(brain.targetGoldFloorThisRound, 6);
    } else if (neuralResult.macroAction === 'TEMPO_LEVEL') {
      brain.targetGoldFloorThisRound = Math.max(4, brain.targetGoldFloorThisRound - 18);
    }

    if (isEmergencySurvival || isMercenaryCashoutTurn) {
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
  }

  private biasPolicyLogitsForPersona(persona: AIPersona, logits: number[]): number[] {
    const b = [...logits];
    if (b.length < 4) return b;
    const bias = PERSONA_MACRO_LOGIT_BIAS[persona];
    b[0] += bias.save;
    b[1] += bias.tempo;
    b[2] += bias.roll;
    b[3] += bias.stabilize;
    return b;
  }

  private runNeuralInferenceForBrain(
    bot: Participant,
    brain: BotBrainState,
    allParticipants: Participant[],
    currentRound: string,
    aiParams: AISkillParameters
  ): void {
    const stateTensor = this.extractAIStateTensor(bot, allParticipants, currentRound);
    const engine = NeuralBotEngine.getInstance();
    brain.macroPickNonce += 1;
    const predictOpts = {
      temperature: brain.policyTemperature,
      rng: createSeededRng(
        brain.decisionSeed ^
          brain.macroPickNonce ^
          parseInt(currentRound.replace(/\D/g, '') || '1', 10)
      ),
      logitBias: (logits: number[]) =>
        this.biasPolicyLogitsForPersona(brain.persona, logits),
    };

    const rawResult = engine.predictSync(stateTensor.features, predictOpts);
    const neuralResult = this.refineMacroForVisibleTempo(
      bot,
      brain,
      rawResult,
      currentRound,
      predictOpts.rng ?? Math.random
    );
    brain.lastNeuralResult = neuralResult;
    this.applyNeuralMacroToBrain(bot, brain, neuralResult, currentRound, aiParams);
    this.logInferenceBackendOnce(bot, brain, neuralResult.backend);

    if (
      !engine.useHeadlessOnnxInference() &&
      brain.preferOnnxBackend &&
      engine.isOnnxSessionReady()
    ) {
      void engine.predictONNX(stateTensor.features, predictOpts).then((rawOnnx) => {
        if (rawOnnx.backend !== 'ONNX_RUNTIME') return;
        const onnxResult = this.refineMacroForVisibleTempo(
          bot,
          brain,
          rawOnnx,
          currentRound,
          predictOpts.rng ?? Math.random
        );
        brain.lastNeuralResult = onnxResult;
        this.applyNeuralMacroToBrain(bot, brain, onnxResult, currentRound, aiParams);
        this.logInferenceBackendOnce(bot, brain, onnxResult.backend);
      });
    }
  }

  /**
   * 학습 가중치상 TEMPO 로짓이 거의 0 → 레벨 괴리가 있을 때 규칙적으로 TEMPO를 승격(가시적 레벨템포).
   */
  private refineMacroForVisibleTempo(
    bot: Participant,
    brain: BotBrainState,
    result: NeuralInferenceResult,
    currentRound: string,
    rng: () => number
  ): NeuralInferenceResult {
    if (result.macroAction === 'ROLLDOWN' || result.macroAction === 'STABILIZE_REROLL') {
      return result;
    }
    if (bot.hp <= 32 || brain.isRolldownActive) return result;

    const stageNum = parseInt(currentRound.split('-')[0] || '1', 10);
    const idealLevel = Math.min(9, Math.max(4, stageNum + 2));
    const levelBehind = bot.level < idealLevel;
    const goldForLevel = bot.gold >= 26 && bot.gold <= 62;
    if (!levelBehind || !goldForLevel) return result;

    const persona = brain.persona;
    let tempoChance = 0.1;
    if (persona === 'FAST_NINE_ECONOMIST' || persona === 'FAST_NINE_GREEDY') {
      tempoChance = 0.32;
    } else if (persona === 'FLEX_MASTER' || persona === 'FLEX_BALANCED') {
      tempoChance = 0.22;
    } else if (persona === 'MERCENARY_GAMBLER') {
      tempoChance = 0.12;
    } else if (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') {
      tempoChance = 0.08;
    }

    if (rng() < tempoChance) {
      return { ...result, macroAction: 'TEMPO_LEVEL' };
    }
    return result;
  }

  private logInferenceBackendOnce(
    bot: Participant,
    brain: BotBrainState,
    backend: NeuralInferenceResult['backend']
  ): void {
    if (brain.inferenceBackendLogged || typeof console === 'undefined') return;
    brain.inferenceBackendLogged = true;
    const tag = backend === 'ONNX_RUNTIME' ? 'ONNX' : 'SYNC';
    console.debug(
      `[WWCHESS AI] ${bot.name} (${brain.persona}) inference backend: ${tag}`
    );
  }

  private getSaveInterestGoldFloor(
    bot: Participant,
    persona: AIPersona,
    baseFloor: number
  ): number {
    const cap = bot.getMaxInterestCap() * 10;
    if (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') {
      return Math.max(baseFloor, cap);
    }
    if (persona === 'FLEX_MASTER' || persona === 'FLEX_BALANCED') {
      return Math.max(baseFloor, Math.min(cap, 36));
    }
    if (persona === 'MERCENARY_GAMBLER') {
      return Math.max(baseFloor, Math.min(cap, 40));
    }
    if (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') {
      return Math.max(baseFloor, Math.min(cap, 12 + bot.level));
    }
    if (persona === 'FLEX_MASTER' || persona === 'FLEX_BALANCED') {
      return Math.max(baseFloor, Math.min(cap, 20 + Math.floor(bot.level / 2)));
    }
    return Math.max(baseFloor, Math.min(cap, 12 + bot.level * 2));
  }

  /** 시뮬·텔레메트리: stepBotRealTimeAPM과 동일한 골드 하한 */
  public resolveEffectiveGoldFloor(bot: Participant, brain: BotBrainState): number {
    const persona = brain.persona;
    const isEmergencySurvival = bot.hp <= 30;
    const isMercenaryCashoutTurn =
      persona === 'MERCENARY_GAMBLER' &&
      (bot.hp <= 35 || bot.mercenaryArmoryLoot >= 8);
    return this.getEffectiveGoldFloor(
      bot,
      brain,
      isEmergencySurvival,
      isMercenaryCashoutTurn
    );
  }

  private getEffectiveGoldFloor(
    bot: Participant,
    brain: BotBrainState,
    isEmergencySurvival: boolean,
    isMercenaryCashoutTurn: boolean
  ): number {
    if (isEmergencySurvival || isMercenaryCashoutTurn || brain.isRolldownActive) {
      return isEmergencySurvival || isMercenaryCashoutTurn ? 0 : 6;
    }

    let floor = brain.targetGoldFloorThisRound;
    const macro = brain.lastNeuralResult?.macroAction;
    const benchFull = bot.bench.every((u) => u !== null);
    const boardGap = bot.level - bot.getBoardUnitCount();

    if (macro === 'STABILIZE_REROLL' || macro === 'ROLLDOWN') {
      floor = Math.min(floor, 6);
    }
    if (
      !brain.isRolldownActive &&
      (brain.persona === 'HYPER_ROLLER' || brain.persona === 'LOW_COST_REROLLER') &&
      bot.level >= 5 &&
      bot.level <= 7
    ) {
      floor = Math.min(floor, macro === 'SAVE_INTEREST' ? 10 : 14);
    }
    if (
      macro === 'STABILIZE_REROLL' &&
      (brain.persona === 'FLEX_MASTER' || brain.persona === 'FLEX_BALANCED') &&
      bot.gold >= 22
    ) {
      floor = Math.min(floor, 8);
    }
    if (macro === 'TEMPO_LEVEL' && bot.level < 9) {
      floor = Math.min(floor, 10);
    }
    if (benchFull) {
      floor = Math.min(floor, 4);
    }
    if (boardGap > 0) {
      floor = Math.min(floor, Math.max(4, floor - 6));
    }
    return Math.max(0, floor);
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

    brain.rerollsExecutedThisRound = 0;
    this.runNeuralInferenceForBrain(bot, brain, allParticipants, currentRound, aiParams);

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
    this.performPersonaLevelUpStep(bot, brain, currentRound, sharedPool);
    this.tryUseBotDuplicators(bot, brain, sharedPool);

    this.optimizeBoardAndItems(bot, brain, allParticipants, sharedPool, aiParams);
    this.trimExcessBenchUnits(bot, brain, sharedPool);
    this.ensureCombatReadyBoard(bot, brain, sharedPool);

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
    const isMercenaryCashoutTurn =
      brain.persona === 'MERCENARY_GAMBLER' &&
      (bot.hp <= 35 || bot.mercenaryArmoryLoot >= 8);

    const macro = brain.lastNeuralResult?.macroAction;
    brain.isRolldownActive =
      isEmergencySurvival ||
      isMercenaryCashoutTurn ||
      macro === 'ROLLDOWN' ||
      macro === 'STABILIZE_REROLL' ||
      (stageNum >= 5 && bot.hp <= 35 && bot.gold >= 28);

    const effectiveGoldFloor = this.getEffectiveGoldFloor(
      bot,
      brain,
      isEmergencySurvival,
      isMercenaryCashoutTurn
    );

    // 다음 액션 딜레이 재설정 (올인 타이밍: 600ms~1000ms 초고속 다다다다 리롤, 평상시: 1000ms~5000ms 여유로운 운영)
    brain.nextActionDelayMs = this.computeNextBotActionDelayMs(brain.isRolldownActive);

    // 1. 레벨업 체크
    this.performPersonaLevelUpStep(bot, brain, currentRound, sharedPool);

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
    this.trimExcessBenchUnits(bot, brain, sharedPool);

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
    sharedPool?: SharedPoolManager
  ): void {
    const persona = brain.persona;
    const tempoBoost = brain.lastNeuralResult?.macroAction === 'TEMPO_LEVEL';
    const xpGoldFloor = tempoBoost
      ? Math.max(4, brain.targetGoldFloorThisRound - 14)
      : brain.targetGoldFloorThisRound;

    if (tempoBoost && bot.level < 9) {
      const tempoTarget = Math.min(
        9,
        Math.max(bot.level + 1, parseInt(currentRound.split('-')[0] || '2', 10) + 2)
      );
      while (bot.gold - 4 >= xpGoldFloor && bot.level < tempoTarget) {
        if (!bot.buyXp(sharedPool)) break;
      }
    }

    if (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') {
      const threeStarCount = this.countTotalThreeStarUnits(bot);
      if ((bot.level < 5 || threeStarCount >= 2) && bot.level < 10) {
        if (bot.gold - 4 >= xpGoldFloor && bot.level < 9) {
          bot.buyXp(sharedPool);
        }
      }
    } else if (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') {
      while (bot.gold - 4 >= xpGoldFloor && bot.level < 10) {
        if (!bot.buyXp(sharedPool)) break;
      }
    } else if (persona === 'MERCENARY_GAMBLER') {
      const isMercenaryCashoutTurn = bot.hp <= 35 || bot.mercenaryArmoryLoot >= 8;
      const desiredLevel = isMercenaryCashoutTurn ? 9 : tempoBoost ? 8 : 6;
      if (bot.gold - 4 >= xpGoldFloor && bot.level < desiredLevel) {
        bot.buyXp(sharedPool);
      }
    } else {
      const stageNum = parseInt(currentRound.split('-')[0] || '2', 10);
      const standardTargetLevel = Math.min(
        10,
        Math.max(4, stageNum + (tempoBoost ? 4 : 3))
      );
      while (
        bot.gold - 4 >= xpGoldFloor &&
        bot.level < standardTargetLevel
      ) {
        if (!bot.buyXp(sharedPool)) break;
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

    this.runNeuralInferenceForBrain(bot, brain, allParticipants, currentRound, aiParams);

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
    this.trimExcessBenchUnits(bot, brain, sharedPool);
    this.ensureCombatReadyBoard(bot, brain, sharedPool);
  }

  /**
   * 전투 직전: 보드 인원 미달 시 우선 배치하고, 남는 저가 1성은 매각해 대기석 압력을 줄인다.
   */
  public ensureCombatReadyBoard(
    bot: Participant,
    brain: BotBrainState,
    sharedPool: SharedPoolManager
  ): void {
    while (bot.getBoardUnitCount() < bot.level) {
      const benchIdx = bot.bench.findIndex((u) => u !== null && !brain.deniedUnitInstanceIds.has(u.instanceId));
      if (benchIdx === -1) break;

      let placed = false;
      for (let r = 0; r < Participant.BOARD_ROWS && !placed; r++) {
        for (let c = 0; c < Participant.BOARD_COLS && !placed; c++) {
          if (bot.board[r][c] === null) {
            bot.board[r][c] = bot.bench[benchIdx]!;
            bot.bench[benchIdx] = null;
            placed = true;
          }
        }
      }
      if (!placed) break;
    }

    this.trimExcessBenchUnits(bot, brain, sharedPool);
    if (bot.bench.every((u) => u !== null)) {
      this.cleanupBenchIfFull(bot, brain, sharedPool);
    }
  }

  private trimExcessBenchUnits(
    bot: Participant,
    brain: BotBrainState,
    sharedPool: SharedPoolManager
  ): void {
    const emptyBench = bot.bench.filter((s) => s === null).length;
    if (emptyBench > 0) return;

    const boardCount = bot.getBoardUnitCount();
    const onBoardIds = new Set<string>();
    for (let r = 0; r < Participant.BOARD_ROWS; r++) {
      for (let c = 0; c < Participant.BOARD_COLS; c++) {
        const u = bot.board[r][c];
        if (u) onBoardIds.add(u.instanceId);
      }
    }

    const sellCandidates: UnitInstance[] = [];
    for (const u of bot.bench) {
      if (!u) continue;
      if (brain.deniedUnitInstanceIds.has(u.instanceId)) continue;
      if (onBoardIds.has(u.instanceId)) continue;
      if (u.starLevel >= 2) continue;
      sellCandidates.push(u);
    }

    sellCandidates.sort((a, b) => {
      const score = (x: UnitInstance) =>
        x.cost * 8 +
        (x.traits.includes(brain.targetTrait) ? 40 : 0) +
        bot.getOwnedUnitCopiesCount(x.unitId) * 10;
      return score(a) - score(b);
    });

    const excess =
      bot.bench.filter((u) => u !== null).length -
      Math.max(0, Participant.BENCH_SIZE - boardCount);
    const sellCount = Math.min(Math.max(1, excess), sellCandidates.length, 3);

    for (let i = 0; i < sellCount; i++) {
      bot.sellUnit(sellCandidates[i].instanceId, sharedPool);
    }
  }

  /**
   * 상대방 7명의 보드 상태(체력 1,300+ 거대 기물, 힐/보호막 시너지, 경호대, 마법사 수 등)를 종합 정찰(Scouting)한다.
   */
  public analyzeScoutingContext(
    bot: Participant,
    allParticipants: Participant[]
  ): ScoutingContext {
    let opponentHighHpCount = 0;
    let opponentHealShieldTraits = 0;
    let opponentBodyguardCount = 0;
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
        (traits.get('ACADEMY') ?? 0) >= 2 ||
        (traits.get('ENCHANTER') ?? 0) >= 2 ||
        (traits.get('PROTECTOR') ?? 0) >= 2 ||
        (traits.get('SOCIALITE') ?? 0) >= 2 ||
        (traits.get('BODYGUARD') ?? 0) >= 4
      ) {
        opponentHealShieldTraits++;
      }
      if (
        (traits.get('BODYGUARD') ?? 0) >= 2 ||
        (traits.get('COLOSSUS') ?? 0) >= 1
      ) {
        opponentBodyguardCount++;
      }
      if (
        (traits.get('SCHOLAR') ?? 0) >= 2 ||
        (traits.get('ARCANIST') ?? 0) >= 2
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
      opponentBodyguardCount,
      opponentMagicCount,
      traitContestedMap,
    };
  }

  /**
   * 딥러닝/ONNX 모델 추론용 정규화 상태 텐서(Feature Vector)를 추출한다.
   * See `set6/botNeuralFeatures.ts` (18-dim schema).
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

    const traitCounts = bot.getActiveTraitCounts();
    const augmentSlotsN = augmentSlotsNorm(bot.augments);
    const augmentTierN = augmentTierNorm(bot.augments);
    const targetTraitProgressNorm = traitBreakpointProgress(
      traitCounts,
      brain.targetTrait
    );
    const mercenaryVaultNorm = Math.min(1, bot.goblinVaultStacks / 70);
    const boardUnits = countBoardUnits(bot);
    const boardFillRatio = Math.min(1, boardUnits / Math.max(1, bot.level));
    const activeSynergyN = activeSynergyNorm(traitCounts);
    const equippedItemPressureN = equippedItemPressure(
      bot,
      countBoardItems(bot)
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
      augmentSlotsN,
      augmentTierN,
      targetTraitProgressNorm,
      mercenaryVaultNorm,
      boardFillRatio,
      activeSynergyN,
      equippedItemPressureN,
    ];

    if (features.length !== BOT_NEURAL_FEATURE_DIM) {
      throw new Error(
        `Neural feature dim mismatch: expected ${BOT_NEURAL_FEATURE_DIM}, got ${features.length}`
      );
    }

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
      augmentSlotsNorm: augmentSlotsN,
      augmentTierNorm: augmentTierN,
      targetTraitProgressNorm,
      mercenaryVaultNorm,
      boardFillRatio,
      activeSynergyNorm: activeSynergyN,
      equippedItemPressure: equippedItemPressureN,
      features,
    };
  }

  private static isSet6TraitEffectKey(effectKey: string): boolean {
    return /_(HEART|CREST|CROWN|SOUL)$/.test(effectKey);
  }

  private static scoreImmediateUnitGrant(
    unitId: string | undefined,
    brain: BotBrainState,
    ownedUnitIds: Set<string>
  ): number {
    if (!unitId) return 0;
    const tpl = UNIT_TEMPLATES[unitId];
    if (!tpl) return -20;
    let bonus = tpl.cost >= 4 ? 28 : 16;
    if (tpl.traits.includes(brain.targetTrait)) bonus += 42;
    else if (tpl.traits.includes(brain.secondaryTrait)) bonus += 22;
    if (ownedUnitIds.has(unitId)) bonus += 35;
    return bonus;
  }

  /**
   * 증강체 1개의 종합 가치(Valuation / Utility Score)를 산출한다.
   * - Set 6 149-roster: category, bonusTrait, effectKey suffix, immediate grants
   * - 체력 위기(Crisis)에 따른 즉발 vs 장기 밸류 판단
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

    // 신경망 상태 가치 평가 연동 (순위 기대치 Value Score에 따른 증강 최적화)
    if (brain.lastNeuralResult) {
      const val = brain.lastNeuralResult.valueScore;
      // 순위 기대치가 낮아 위기일 때(val < 0.45)는 즉발 전투력/골드 증강에 가산점
      if (val < 0.45 && (aug.category === 'ECONOMY' || aug.category === 'HERO')) {
        score += 20;
      }
      // 순위 기대치가 높아 여유로울 때(val >= 0.65)는 후반 고점/전투/프리즘 증강에 가산점
      if (val >= 0.65 && (aug.category === 'COMBAT' || aug.category === 'TRAIT' || aug.tier === 'PRISMATIC')) {
        score += 25;
      }
    }

    const threeStarCount = this.countTotalThreeStarUnits(bot);
    const ownedLocations = bot.getAllUnitLocations();
    const ownedUnitIds = new Set(ownedLocations.map((l) => l.unit.unitId));
    const isCrisis = bot.hp <= 35;
    const isHealthy = bot.hp >= 70;

    // 1. 시너지 Heart / Crest / Crown / Soul (+bonusTrait)
    if (aug.bonusTrait) {
      if (aug.bonusTrait === brain.targetTrait) {
        score += 95;
        if (aug.effectKey.endsWith('_CROWN') || aug.effectKey.endsWith('_SOUL')) {
          score += 25;
        } else if (aug.effectKey.endsWith('_CREST')) {
          score += 12;
        }
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
      } else if (AIBotController.isSet6TraitEffectKey(aug.effectKey)) {
        score -= 30;
      }
    } else if (
      aug.effectKey.startsWith(`${brain.targetTrait}_`) &&
      AIBotController.isSet6TraitEffectKey(aug.effectKey)
    ) {
      score += 70;
    }

    score += AIBotController.scoreImmediateUnitGrant(
      aug.immediateUnitId,
      brain,
      ownedUnitIds
    );
    if (isCrisis && (aug.immediateGold || aug.immediateHp)) {
      score += (aug.immediateGold ?? 0) + (aug.immediateHp ?? 0);
    }

    // 2. 체력 위기(Crisis Management) 및 템포 가치평가
    // 아이템 관련 증강 여부
    const isItemAug =
      aug.effectKey === 'ITEM_GRAB_BAG_1' ||
      aug.effectKey === 'ITEM_GRAB_BAG_2' ||
      aug.effectKey === 'SALVAGE_BIN' ||
      aug.effectKey === 'BAND_OF_THIEVES' ||
      aug.effectKey === 'BINARY_AIRDROP' ||
      aug.effectKey === 'PORTABLE_FORGE' ||
      aug.effectKey === 'JUNKYARD' ||
      aug.effectKey === 'TINKER';

    if (isCrisis) {
      // 즉발 전투력/체력 증강에 대폭 가산점!
      if (
        aug.effectKey.startsWith('CELESTIAL_BLESSING') ||
        aug.effectKey === 'ASCENSION' ||
        aug.effectKey.startsWith('STAND_UNITED') ||
        aug.effectKey.startsWith('BUILT_DIFFERENT') ||
        aug.effectKey.startsWith('EXILES') ||
        aug.effectKey === 'FIRST_AID_KIT' ||
        aug.effectKey === 'METABOLIC_ACCELERATOR' ||
        aug.effectKey.startsWith('MAKESHIFT_ARMOR') ||
        aug.effectKey === 'DOMINANCE'
      ) {
        score += 90;
      } else if (aug.category === 'COMBAT') {
        score += 55;
      }

      // 장기적 이자/골드 증강은 죽기 전에 쓸모없으므로 강력 감점!
      if (
        aug.effectKey === 'LEVEL_UP' ||
        aug.effectKey === 'RICH_GET_RICHER' ||
        aug.effectKey === 'WINDFALL' ||
        aug.effectKey === 'HIGH_ROLLER'
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
        aug.effectKey === 'RICH_GET_RICHER' ||
        aug.effectKey === 'WISE_SPENDING' ||
        aug.effectKey === 'MARCH_OF_PROGRESS'
      ) {
        score += 55;
      }
    }

    // 4. 페르소나 및 덱 상황별 가치평가
    const isRerollAug =
      aug.effectKey === 'GOLDEN_TICKET' ||
      aug.effectKey === 'PANDORA_S_ITEMS' ||
      aug.effectKey === 'TRADE_SECTOR' ||
      aug.effectKey === 'HYPER_ROLL' ||
      aug.effectKey === 'CALCULATED_LOSS' ||
      aug.effectKey === 'WISE_SPENDING' ||
      aug.effectKey.startsWith('FEATHERWEIGHTS');

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
          aug.effectKey === 'CLEAR_MIND' ||
          aug.effectKey === 'MARCH_OF_PROGRESS'
        ) {
          score += 70;
        }
      } else {
        if (aug.category === 'COMBAT') score += 60;
      }
    } else if (brain.persona === 'MERCENARY_GAMBLER') {
      if (
        aug.effectKey === 'MERCENARY_HEART' ||
        aug.effectKey === 'MERCENARY_CREST' ||
        aug.effectKey === 'MERCENARY_SOUL' ||
        aug.effectKey === 'CALCULATED_LOSS' ||
        aug.effectKey === 'GOLD_RESERVES' ||
        aug.effectKey === 'HIGH_ROLLER' ||
        aug.effectKey === 'PAYDAY' ||
        aug.effectKey === 'PIRATES' ||
        aug.category === 'ECONOMY'
      ) {
        score += 80;
      }
    } else {
      // FLEX_MASTER
      if (aug.category === 'COMBAT') score += 40;
      if (isItemAug) score += 35;
    }

    // 5. 범용 Set 6 전투/경제 스테이플
    if (
      aug.category === 'COMBAT' &&
      (aug.effectKey === 'TITANIC_FORCE' ||
        aug.effectKey === 'SPELL_BLADE' ||
        aug.effectKey === 'ARDENT_CENSER' ||
        aug.effectKey === 'SUNFIRE_BOARD' ||
        aug.effectKey.startsWith('KNIFE_S_EDGE') ||
        aug.effectKey === 'SHARPSHOOTER' ||
        aug.effectKey.startsWith('THRILL_OF_THE_HUNT'))
    ) {
      score += 22;
    }

    // 6. 아이템 보유량 연계 (대기석 및 장착 아이템이 적으면 아이템 증강 우대)
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

    if (bestAug.immediateUnitId) {
      const grant = UNIT_TEMPLATES[bestAug.immediateUnitId];
      if (
        grant &&
        (grant.traits.includes(brain.targetTrait) ||
          grant.traits.includes(brain.secondaryTrait) ||
          grant.cost >= 3)
      ) {
        brain.heroTargetUnitId = bestAug.immediateUnitId;
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
    // 용병 도박꾼이 이미 MERCENARY 금고 스택을 쌓고 있는 경우가 아니라면,
    // 현재 목표 시너지를 다른 2명 이상이 겹쳐서 가고 있을 때 가장 덜 겹치는 시너지로 전환한다.
    const shouldAttemptPivot =
      aiParams.skillLevel >= 0.7 &&
      Math.random() < aiParams.scoutingChance &&
      brain.pivotedCount < 2 &&
      !(brain.persona === 'MERCENARY_GAMBLER' && bot.mercenaryArmoryLoot >= 4);

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
    const isMercenaryCashoutTurn =
      persona === 'MERCENARY_GAMBLER' &&
      (bot.hp <= 35 || bot.mercenaryArmoryLoot >= 8);

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
    brain.targetGoldFloorThisRound = this.getPersonaGoldFloor(
      bot,
      persona,
      isEmergencySurvival,
      isMercenaryCashoutTurn,
      aiParams
    );
    if (brain.lastNeuralResult) {
      this.applyNeuralMacroToBrain(
        bot,
        brain,
        brain.lastNeuralResult,
        currentRound,
        aiParams
      );
    }
    const targetGoldFloor = this.getEffectiveGoldFloor(
      bot,
      brain,
      isEmergencySurvival,
      isMercenaryCashoutTurn
    );

    if (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') {
      // 저코스트 3성 리롤러: 5~6레벨에서 경험치 구매를 멈추고 리롤에 집중.
      // 단, 핵심 1~2코 3성이 2개 이상 완성되었거나 체력이 위험하면 레벨업 재개
      const threeStarCount = this.countTotalThreeStarUnits(bot);
      if ((bot.level < 5 || threeStarCount >= 2) && bot.level < 10) {
        while (bot.gold - 4 >= targetGoldFloor && bot.level < 9) {
          if (!bot.buyXp(sharedPool)) break;
        }
      }
    } else if (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') {
      // 고밸류 운영러: 50골드(또는 사악한 금융 70골드) 칼이자를 지키며 남는 골드로 9~10레벨 직행
      while (bot.gold - 4 >= targetGoldFloor && bot.level < 10) {
        if (!bot.buyXp(sharedPool)) break;
      }
    } else if (persona === 'MERCENARY_GAMBLER') {
      // 황금 고블린 코인충: 평상시에는 50골드를 모으면서 천천히 레벨업,
      // 체력 35 이하 또는 금고 55스택 이상 도달 시 골드를 전부 털어 레벨업+폭풍 리롤!
      const desiredLevel = isMercenaryCashoutTurn ? 9 : 6;
      while (bot.gold - 4 >= targetGoldFloor && bot.level < desiredLevel) {
        if (!bot.buyXp(sharedPool)) break;
      }
    } else {
      // FLEX_MASTER (유연한 정석 밸런스형): 라운드 흐름에 맞춰 정석 레벨업 (후반 Lv.10 도달)
      const stageNum = parseInt(currentRound.split('-')[0] || '2', 10);
      const standardTargetLevel = Math.min(10, Math.max(4, stageNum + 3));
      while (
        bot.gold - 4 >= targetGoldFloor &&
        bot.level < standardTargetLevel
      ) {
        if (!bot.buyXp(sharedPool)) break;
      }
    }

    // C. 페르소나별 상점 리롤(rerollShop) 및 기물 수집 루프
    let maxRerollsThisTurn = 8;
    if (isEmergencySurvival || isMercenaryCashoutTurn) {
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
    isMercenaryCashoutTurn: boolean,
    aiParams: AISkillParameters
  ): number {
    if (isEmergencySurvival || isMercenaryCashoutTurn) {
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

    if (persona === 'MERCENARY_GAMBLER') {
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
    } else if (brain.persona === 'MERCENARY_GAMBLER') {
      if (template.traits.includes('MERCENARY')) {
        score += 55; // MERCENARY 기물 최우선 수집
      }
      if (
        (bot.hp <= 35 || bot.mercenaryArmoryLoot >= 8) &&
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
    if (emptyCount > 2) return;

    let worstBenchUnit: UnitInstance | null = null;
    let worstValue = 9999;

    for (const unit of bot.bench) {
      if (!unit) continue;
      if (brain.deniedUnitInstanceIds.has(unit.instanceId)) continue;
      if (unit.starLevel >= 2) continue;

      let keepScore = unit.cost * 6 + bot.getOwnedUnitCopiesCount(unit.unitId) * 12;
      if (unit.traits.includes(brain.targetTrait)) keepScore += 30;
      if (unit.traits.includes('MERCENARY') && brain.persona === 'MERCENARY_GAMBLER') {
        keepScore += 45;
      }

      if (keepScore < worstValue) {
        worstValue = keepScore;
        worstBenchUnit = unit;
      }
    }

    // 대기석이 완전히 찼을 때(빈칸 0개)는 worstValue 기준치와 무관하게 2성 미완성 기물 중 가장 점수 낮은 1기를 과감히 매각하여 상점 락 해제!
    if (worstBenchUnit && (emptyCount === 0 || emptyCount === 1 || worstValue < 80)) {
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
  private placeUnitWithPlacementHints(
    bot: Participant,
    unit: UnitInstance,
    playerCarryCol: number
  ): boolean {
    const rows = placementRowPriority(unit.unitId);
    const cols = placementColPriority(unit.unitId, playerCarryCol);
    for (const row of rows) {
      for (const col of cols) {
        if (bot.board[row][col] === null) {
          bot.board[row][col] = unit;
          return true;
        }
      }
    }
    return false;
  }

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

    const isMercenarySandbagging =
      brain.persona === 'MERCENARY_GAMBLER' &&
      bot.hp > 35 &&
      bot.mercenaryArmoryLoot < 8;

    // 2. 보드에 배치할 정예 기물(최대 bot.level기) 선정 (중복 unitId보다는 고유 기물 우선)
    const scoredUnits = allUnits.map((unit) => {
      let power =
        unit.starLevel * 38 +
        unit.cost * 14 +
        unit.items.length * 15;
      if (unit.traits.includes(brain.targetTrait)) power += 24;
      if (unit.traits.includes(brain.secondaryTrait)) power += 12;
      if (
        brain.persona === 'MERCENARY_GAMBLER' &&
        unit.traits.includes('MERCENARY')
      ) {
        power += 70; // MERCENARY 시너지 유지 최우선
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
      isMercenarySandbagging && bot.level >= 5
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

    // 4. Set 6 스킬 패턴 기반 배치 (전열 CC → 중열 → 후열 딜 → 암살 도약)
    const frontlineUnits: UnitInstance[] = [];
    const midlineUnits: UnitInstance[] = [];
    const backlineUnits: UnitInstance[] = [];
    const assassinUnits: UnitInstance[] = [];

    for (const u of deployedUnits) {
      switch (primaryPlacementBucket(u.unitId)) {
        case 'assassin':
          assassinUnits.push(u);
          break;
        case 'back':
          backlineUnits.push(u);
          break;
        case 'front':
          frontlineUnits.push(u);
          break;
        default:
          midlineUnits.push(u);
      }
    }

    frontlineUnits.sort((a, b) => {
      const aCC = isHighPriorityFrontCc(a.unitId) ? 1 : 0;
      const bCC = isHighPriorityFrontCc(b.unitId) ? 1 : 0;
      if (aCC !== bCC) return bCC - aCC;
      return b.maxHp - a.maxHp;
    });

    for (const unit of frontlineUnits) {
      this.placeUnitWithPlacementHints(bot, unit, playerCarryCol);
    }
    for (const unit of midlineUnits) {
      this.placeUnitWithPlacementHints(bot, unit, playerCarryCol);
    }
    for (const unit of backlineUnits) {
      this.placeUnitWithPlacementHints(bot, unit, playerCarryCol);
    }
    for (const unit of assassinUnits) {
      this.placeUnitWithPlacementHints(bot, unit, playerCarryCol);
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

            // 신경망 추론: 아이템 긴급도(Item Urgency)가 높으면 템 소진 보너스
            if (brain.lastNeuralResult && brain.lastNeuralResult.itemUrgency > 0.55) {
              score += Math.round(brain.lastNeuralResult.itemUrgency * 30);
            }

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
