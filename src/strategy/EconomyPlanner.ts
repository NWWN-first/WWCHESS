// src/strategy/EconomyPlanner.ts
// Stage 4: 구매·판매·리롤·레벨을 한 라운드 계획으로 통합
// Stage 5: 페르소나는 getPersonaBias() 소프트 delta만 (하드 분기 제거)

import { AIPersona, Participant } from '../Participant';
import { CompDecision } from './CompAnalyzer';
import { CompLevelHint } from './CompCatalog';
import { getPersonaBias, PersonaBiasProfile } from './PersonaBias';

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
  /** Neural / RuleBased 매크로 (없으면 null) — Stage6에서 본격 보정 */
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

/** Comp levelHint 우선, 페르소나는 levelBias만 */
function resolveTargetLevel(
  bot: Participant,
  stage: number,
  levelHint: CompLevelHint | null,
  bias: PersonaBiasProfile,
  isGoblinCashoutTurn: boolean
): number {
  let base: number;
  if (levelHint === 'reroll5') {
    // 롤 컴프: 초반에도 최소 5, 중반은 6~7 유지
    if (bot.level < 5) base = 5;
    else if (stage <= 2) base = 6;
    else if (stage >= 5) base = Math.min(9, Math.max(7, bot.level));
    else base = Math.min(7, Math.max(6, stage + 2));
  } else if (levelHint === 'fast8') {
    base = Math.min(8, Math.max(stage + 3, bot.level));
  } else if (levelHint === 'fast9') {
    base = Math.min(9, Math.max(stage + 3, bot.level));
  } else {
    base = Math.min(10, Math.max(4, stage + 3));
  }

  // 고블린 캐시아웃은 메커니즘(시너지)이지 페르소나 하드분기 — 목표만 상향
  if (isGoblinCashoutTurn) {
    base = Math.max(base, 8);
  }

  return clamp(base + bias.levelBias, 1, 10);
}

function pickTempo(args: {
  bot: Participant;
  stage: number;
  macro: string | null;
  levelHint: CompLevelHint | null;
  targetLevel: number;
  pivotPreferRolldown: boolean;
  isEmergencySurvival: boolean;
  isGoblinCashoutTurn: boolean;
  bias: PersonaBiasProfile;
}): { tempo: EconomyTempo; reason: string } {
  const {
    bot,
    stage,
    macro,
    levelHint,
    targetLevel,
    pivotPreferRolldown,
    isEmergencySurvival,
    isGoblinCashoutTurn,
    bias,
  } = args;

  if (isEmergencySurvival || isGoblinCashoutTurn) {
    return { tempo: 'rolldown', reason: 'EMERGENCY_OR_CASHOUT' };
  }

  const pressureRolldown =
    bot.hp <= 45 || stage >= 5 || (stage >= 4 && bot.hp <= 55);
  if ((pivotPreferRolldown || macro === 'ROLLDOWN') && pressureRolldown) {
    return { tempo: 'rolldown', reason: 'PIVOT_OR_MACRO_ROLLDOWN' };
  }
  if (
    macro === 'STABILIZE_REROLL' ||
    (macro === 'ROLLDOWN' && !pressureRolldown)
  ) {
    return { tempo: 'stabilize', reason: 'MACRO_STABILIZE' };
  }
  if (macro === 'SAVE_INTEREST' || macro === 'HIGHROLL_GREED') {
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

  // Stage5: 페르소나 하드 폴백 대신 appetite로 소프트 선택
  if (bias.rollAppetite >= 0.65 && bot.level >= 5 && bot.level <= 7) {
    return { tempo: 'stabilize', reason: 'BIAS_ROLL_WINDOW' };
  }
  if (bias.levelAppetite >= 0.7 && bot.level < targetLevel) {
    return { tempo: 'spike', reason: 'BIAS_LEVEL_PUSH' };
  }
  if (bot.hp <= 40 && stage >= 4) {
    return { tempo: 'stabilize', reason: 'LATE_HP_PRESSURE' };
  }
  if (bias.interestAppetite >= 0.55) {
    return { tempo: 'interest', reason: 'BIAS_INTEREST' };
  }
  return { tempo: 'interest', reason: 'DEFAULT_INTEREST' };
}

/**
 * CompAnalyzer 목표 컴프 + 템포 + 벤치 압박 → 한 라운드 경제 계획.
 * 페르소나는 PersonaBias delta만 적용한다.
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

  const bias = getPersonaBias(persona);
  const maxInterestGold = bot.getMaxInterestCap() * 10;
  const empty = emptyBenchSlots(bot);
  const benchTight = empty <= 1;
  const benchFull = empty === 0;
  const targetLevel = resolveTargetLevel(
    bot,
    stage,
    levelHint,
    bias,
    isGoblinCashoutTurn
  );

  const { tempo, reason } = pickTempo({
    bot,
    stage,
    macro: macroAction,
    levelHint,
    targetLevel,
    pivotPreferRolldown,
    isEmergencySurvival,
    isGoblinCashoutTurn,
    bias,
  });

  // 중립 베이스 + 페르소나 goldFloorBias
  let goldFloor = 30 + bias.goldFloorBias;
  let maxRerolls = 6 + bias.rerollBias;
  let preferRolldown = false;
  let buyThresholdBias = 0;
  let maxSellsThisRound = benchTight ? 2 : 1;
  let forceBenchPressure = benchFull;
  let opportunityCostWeight = benchTight ? 0.55 : 0.2;

  switch (tempo) {
    case 'interest':
      goldFloor = Math.max(goldFloor, Math.min(50, maxInterestGold));
      maxRerolls = Math.max(
        bot.freeRerolls > 0 ? bot.freeRerolls : 1,
        Math.min(maxRerolls, 5)
      );
      buyThresholdBias = 6;
      opportunityCostWeight = Math.max(opportunityCostWeight, 0.35);
      break;
    case 'spike':
      goldFloor = Math.min(goldFloor, 30);
      maxRerolls = Math.max(
        bot.freeRerolls > 0 ? bot.freeRerolls : 1,
        Math.min(maxRerolls, 4)
      );
      buyThresholdBias = 4;
      break;
    case 'stabilize':
      goldFloor = Math.min(goldFloor, 20);
      maxRerolls = Math.max(maxRerolls, 8);
      if (bias.rollAppetite >= 0.65 && bot.level >= 5 && bot.level <= 7) {
        maxRerolls = Math.max(maxRerolls, 11);
      }
      buyThresholdBias = 0;
      opportunityCostWeight = Math.max(opportunityCostWeight, 0.4);
      maxSellsThisRound = Math.max(maxSellsThisRound, 2);
      break;
    case 'rolldown':
      goldFloor = isEmergencySurvival || isGoblinCashoutTurn ? 0 : 10;
      maxRerolls = isEmergencySurvival || isGoblinCashoutTurn ? 20 : 14;
      preferRolldown = true;
      buyThresholdBias = -4;
      maxSellsThisRound = 3;
      forceBenchPressure = true;
      opportunityCostWeight = Math.max(opportunityCostWeight, 0.5);
      break;
  }

  // PivotPlanner 힌트 병합 (위기 올인 제외)
  if (!isEmergencySurvival && !isGoblinCashoutTurn) {
    if (pivotGoldFloorHint !== null) {
      if (tempo === 'interest') {
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
