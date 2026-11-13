// src/strategy/EconomyPlanner.ts
// Stage 4: 구매·판매·리롤·레벨을 한 라운드 계획으로 통합

import { AIPersona, Participant } from '../Participant';
import { CompDecision } from './CompAnalyzer';
import { CompLevelHint } from './CompCatalog';

/** 한 라운드 경제 템포 */
export type EconomyTempo = 'interest' | 'stabilize' | 'rolldown' | 'spike';

export interface EconomyPlan {
  tempo: EconomyTempo;
  goldFloor: number;
  maxRerolls: number;
  targetLevel: number;
  preferRolldown: boolean;
  /**
   * 상점 구매 문턱 가산 (양수 = 더 까다로움).
   * 벤치 압박/이자 구간에서 잡템 매수 억제.
   */
  buyThresholdBias: number;
  /** 이번 라운드 벤치 정리로 허용할 최대 매각 수 */
  maxSellsThisRound: number;
  /** 리롤/구매 없어도 벤치 만석이면 선제 정리 */
  forceBenchPressure: boolean;
  /**
   * 기회비용 가중치 0~1.
   * 벤치가 빡빡할수록 컴프 밖·페어 없는 유닛 점수를 깎음.
   */
  opportunityCostWeight: number;
  reason: string;
}

export interface EconomyPlannerInput {
  bot: Participant;
  persona: AIPersona;
  stage: number;
  /** Neural / RuleBased 매크로 (없으면 null) */
  macroAction: string | null;
  levelHint: CompLevelHint | null;
  pivotDecision: CompDecision | null;
  pivotGoldFloorHint: number | null;
  pivotMaxRerollsHint: number | null;
  pivotPreferRolldown: boolean;
  isEmergencySurvival: boolean;
  isGoblinCashoutTurn: boolean;
  skillLevel: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function emptyBenchSlots(bot: Participant): number {
  return bot.bench.filter((s) => s === null).length;
}

function personaBaseFloor(
  bot: Participant,
  persona: AIPersona,
  maxInterestGold: number
): number {
  if (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') {
    return bot.level >= 8 ? 20 : maxInterestGold;
  }
  if (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') {
    return 20;
  }
  if (persona === 'GOBLIN_GAMBLER') {
    return 40;
  }
  return 30;
}

function personaTargetLevel(
  bot: Participant,
  persona: AIPersona,
  stage: number,
  levelHint: CompLevelHint | null,
  isGoblinCashoutTurn: boolean
): number {
  if (levelHint === 'reroll5') {
    // 리롤 컴프: 5~7 유지, 후반/다성 완성 후 올리기
    if (bot.level < 5) return 5;
    if (stage >= 5) return Math.min(9, bot.level + 1);
    return Math.min(7, Math.max(5, stage + 2));
  }
  if (levelHint === 'fast8') {
    return Math.min(8, Math.max(stage + 3, bot.level));
  }
  if (levelHint === 'fast9') {
    return Math.min(9, Math.max(stage + 3, bot.level));
  }

  if (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') {
    return bot.level < 5 ? 5 : Math.min(8, stage >= 5 ? 8 : 6);
  }
  if (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') {
    return 9;
  }
  if (persona === 'GOBLIN_GAMBLER') {
    return isGoblinCashoutTurn ? 9 : 6;
  }
  return Math.min(10, Math.max(4, stage + 3));
}

function pickTempo(args: {
  bot: Participant;
  persona: AIPersona;
  stage: number;
  macro: string | null;
  levelHint: CompLevelHint | null;
  targetLevel: number;
  pivotPreferRolldown: boolean;
  isEmergencySurvival: boolean;
  isGoblinCashoutTurn: boolean;
}): { tempo: EconomyTempo; reason: string } {
  const {
    bot,
    persona,
    stage,
    macro,
    levelHint,
    targetLevel,
    pivotPreferRolldown,
    isEmergencySurvival,
    isGoblinCashoutTurn,
  } = args;

  if (isEmergencySurvival || isGoblinCashoutTurn) {
    return { tempo: 'rolldown', reason: 'EMERGENCY_OR_CASHOUT' };
  }
  // 올인 롤다운: HP/스테이지 압박이 있을 때만 (매크로만으로 상시 올인 방지)
  const pressureRolldown =
    bot.hp <= 45 || stage >= 5 || (stage >= 4 && bot.hp <= 55);
  if (
    (pivotPreferRolldown || macro === 'ROLLDOWN') &&
    pressureRolldown
  ) {
    return { tempo: 'rolldown', reason: 'PIVOT_OR_MACRO_ROLLDOWN' };
  }
  if (macro === 'STABILIZE_REROLL' || (macro === 'ROLLDOWN' && !pressureRolldown)) {
    return { tempo: 'stabilize', reason: 'MACRO_STABILIZE' };
  }
  if (macro === 'SAVE_INTEREST' || macro === 'HIGHROLL_GREED') {
    // 레벨이 크게 밀리면 이자만 고집하지 않음
    if (bot.level + 2 <= targetLevel && bot.gold >= 40) {
      return { tempo: 'spike', reason: 'INTEREST_BUT_LEVEL_BEHIND' };
    }
    return { tempo: 'interest', reason: 'MACRO_INTEREST' };
  }
  if (macro === 'TEMPO_LEVEL') {
    return { tempo: 'spike', reason: 'MACRO_TEMPO_LEVEL' };
  }

  // 컴프 levelHint 기반 기본 템포
  if (levelHint === 'reroll5') {
    if (bot.level >= 5 && bot.level <= 7 && (bot.hp <= 50 || stage >= 3)) {
      return { tempo: 'stabilize', reason: 'REROLL5_WINDOW' };
    }
    if (bot.level < 5) {
      return { tempo: 'spike', reason: 'REROLL5_REACH_LV5' };
    }
    return { tempo: 'interest', reason: 'REROLL5_BANK' };
  }

  if (levelHint === 'fast8' || levelHint === 'fast9') {
    if (bot.level < targetLevel) {
      return { tempo: 'spike', reason: 'FAST_LEVEL_PUSH' };
    }
    if (bot.hp <= 40 || stage >= 5) {
      return { tempo: 'stabilize', reason: 'AT_CAP_STABILIZE' };
    }
    return { tempo: 'interest', reason: 'AT_CAP_INTEREST' };
  }

  // 페르소나 폴백
  if (
    (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') &&
    bot.level >= 5 &&
    bot.level <= 6
  ) {
    return { tempo: 'stabilize', reason: 'PERSONA_REROLL_WINDOW' };
  }
  if (
    (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') &&
    bot.level < 8
  ) {
    return { tempo: 'spike', reason: 'PERSONA_FAST9' };
  }
  if (bot.hp <= 40 && stage >= 4) {
    return { tempo: 'stabilize', reason: 'LATE_HP_PRESSURE' };
  }
  return { tempo: 'interest', reason: 'DEFAULT_INTEREST' };
}

/**
 * CompAnalyzer 목표 컴프 + 템포 + 벤치 압박 → 한 라운드 경제 계획.
 * 페르소나 if 나열 대신 이 계획이 골드하한·리롤상한·레벨목표·벤치정리를 결정한다.
 */
export function buildEconomyPlan(input: EconomyPlannerInput): EconomyPlan {
  const {
    bot,
    persona,
    stage,
    macroAction,
    levelHint,
    pivotGoldFloorHint,
    pivotMaxRerollsHint,
    pivotPreferRolldown,
    isEmergencySurvival,
    isGoblinCashoutTurn,
    skillLevel,
  } = input;

  const maxInterestGold = bot.getMaxInterestCap() * 10;
  const empty = emptyBenchSlots(bot);
  const benchTight = empty <= 1;
  const benchFull = empty === 0;
  const targetLevel = personaTargetLevel(
    bot,
    persona,
    stage,
    levelHint,
    isGoblinCashoutTurn
  );

  const { tempo, reason } = pickTempo({
    bot,
    persona,
    stage,
    macro: macroAction,
    levelHint,
    targetLevel,
    pivotPreferRolldown,
    isEmergencySurvival,
    isGoblinCashoutTurn,
  });

  let goldFloor = personaBaseFloor(bot, persona, maxInterestGold);
  let maxRerolls = 7;
  let preferRolldown = false;
  let buyThresholdBias = 0;
  let maxSellsThisRound = benchTight ? 2 : 1;
  let forceBenchPressure = benchFull;
  let opportunityCostWeight = benchTight ? 0.55 : 0.2;

  switch (tempo) {
    case 'interest':
      goldFloor = Math.max(goldFloor, Math.min(50, maxInterestGold));
      maxRerolls =
        persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST'
          ? bot.freeRerolls > 0
            ? bot.freeRerolls
            : 1
          : 4;
      buyThresholdBias = 6;
      opportunityCostWeight = Math.max(opportunityCostWeight, 0.35);
      break;
    case 'spike':
      // 레벨 우선: 이자보다 XP, 리롤은 절제
      goldFloor = Math.min(goldFloor, 30);
      maxRerolls =
        persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST'
          ? bot.freeRerolls > 0
            ? bot.freeRerolls
            : 1
          : 3;
      buyThresholdBias = 4;
      break;
    case 'stabilize':
      goldFloor = Math.min(goldFloor, 20);
      maxRerolls =
        (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') &&
        bot.level >= 5 &&
        bot.level <= 6
          ? 12
          : 8;
      buyThresholdBias = 0;
      opportunityCostWeight = Math.max(opportunityCostWeight, 0.4);
      maxSellsThisRound = Math.max(maxSellsThisRound, 2);
      break;
    case 'rolldown':
      goldFloor = isEmergencySurvival || isGoblinCashoutTurn ? 0 : 10;
      maxRerolls = isEmergencySurvival || isGoblinCashoutTurn ? 20 : 14;
      preferRolldown = true;
      buyThresholdBias = -4; // 보드 강화 우선, 문턱 완화
      maxSellsThisRound = 3;
      forceBenchPressure = true;
      opportunityCostWeight = Math.max(opportunityCostWeight, 0.5);
      break;
  }

  // PivotPlanner 힌트 병합 (위기 올인 제외)
  if (!isEmergencySurvival && !isGoblinCashoutTurn) {
    if (pivotGoldFloorHint !== null) {
      if (tempo === 'interest') {
        // 이자 템포: pivot이 더 낮은 하한을 권하면 중간값으로 완화
        goldFloor = Math.round((goldFloor + pivotGoldFloorHint) / 2);
      } else {
        goldFloor = Math.min(goldFloor, pivotGoldFloorHint);
      }
    }
    if (pivotMaxRerollsHint !== null) {
      maxRerolls = preferRolldown
        ? Math.max(maxRerolls, pivotMaxRerollsHint)
        : pivotMaxRerollsHint;
    }
  }

  // 벤치 만석 + 골드 여유: 이자 홀드 중에도 선제 정리 (진단 경로1)
  if (benchFull && bot.gold >= 15) {
    forceBenchPressure = true;
    maxSellsThisRound = Math.max(maxSellsThisRound, 2);
    buyThresholdBias += 10;
    opportunityCostWeight = Math.max(opportunityCostWeight, 0.65);
  } else if (benchTight && bot.gold >= 20) {
    forceBenchPressure = true;
    buyThresholdBias += 6;
    opportunityCostWeight = Math.max(opportunityCostWeight, 0.5);
  }

  // 저티어: 이자 관리 실수
  if (skillLevel < 0.45 && Math.random() < 0.35 && goldFloor > 0) {
    goldFloor = Math.max(0, goldFloor - 20);
  }

  return {
    tempo,
    goldFloor: clamp(Math.round(goldFloor), 0, 70),
    maxRerolls: clamp(Math.round(maxRerolls), 0, 24),
    targetLevel: clamp(targetLevel, 1, 10),
    preferRolldown,
    buyThresholdBias,
    maxSellsThisRound: clamp(maxSellsThisRound, 0, 4),
    forceBenchPressure,
    opportunityCostWeight: clamp(opportunityCostWeight, 0, 1),
    reason,
  };
}

/**
 * 벤치 압박 시 상점 유닛의 기회비용 페널티.
 * 컴프 기여가 낮고 페어/합성이 아니면 점수 하락 → 잡구매로 벤치 잠그는 것 방지.
 */
export function applyShopOpportunityCost(args: {
  baseScore: number;
  ownedCopies: number;
  isBuyPriority: boolean;
  isKeepUnit: boolean;
  matchesTargetTrait: boolean;
  cost: number;
  emptyBenchSlots: number;
  opportunityCostWeight: number;
}): number {
  const {
    baseScore,
    ownedCopies,
    isBuyPriority,
    isKeepUnit,
    matchesTargetTrait,
    cost,
    emptyBenchSlots,
    opportunityCostWeight,
  } = args;

  if (opportunityCostWeight <= 0) return baseScore;

  // 합성/페어·컴프 코어는 기회비용 면제에 가깝게
  if (ownedCopies === 2 || ownedCopies === 5 || ownedCopies === 8) return baseScore;
  if (isBuyPriority) return baseScore;

  let penalty = 0;
  if (!isKeepUnit && !matchesTargetTrait) {
    penalty += 18 + cost * 3;
  } else if (!isKeepUnit) {
    penalty += 10;
  } else if (ownedCopies === 0 && cost >= 3) {
    penalty += 8;
  }

  if (emptyBenchSlots <= 1) {
    penalty += 14;
  } else if (emptyBenchSlots <= 2) {
    penalty += 6;
  }

  return baseScore - penalty * opportunityCostWeight;
}
