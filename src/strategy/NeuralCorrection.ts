// src/strategy/NeuralCorrection.ts
// Stage 6 (원안): 플래너 출력 위에 신경망 보정 — 하드 교체가 아니라 delta

import { NeuralInferenceResult, NeuralMacroAction } from '../NeuralBotEngine';
import { EconomyPlan, EconomyTempo } from './EconomyPlanner';
import { ItemBoardPlan } from './ItemBoardPlanner';

export interface NeuralCorrectionResult {
  goldFloorDelta: number;
  maxRerollsDelta: number;
  targetLevelDelta: number;
  buyThresholdBiasDelta: number;
  slamAggressivenessDelta: number;
  /** null이면 플래너 tempo 유지 */
  tempoHint: EconomyTempo | null;
  denyUrgeBoost: number;
  pivotUrgeBoost: number;
  reason: string;
  applied: boolean;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function macroToTempoHint(macro: NeuralMacroAction): EconomyTempo | null {
  switch (macro) {
    case 'SAVE_INTEREST':
    case 'HIGHROLL_GREED':
      return 'interest';
    case 'TEMPO_LEVEL':
      return 'spike';
    case 'ROLLDOWN':
      return 'rolldown';
    case 'STABILIZE_REROLL':
      return 'stabilize';
    default:
      return null;
  }
}

/**
 * 플래너 계획을 신경망 value/macro/urgency로 소폭 보정.
 * 위기·캐시아웃·플래너 확신이 강하면 보정 폭을 줄인다.
 */
export function applyNeuralCorrection(args: {
  economy: EconomyPlan;
  itemPlan?: ItemBoardPlan | null;
  neural: NeuralInferenceResult | null | undefined;
  skillLevel: number;
  isEmergency: boolean;
}): NeuralCorrectionResult {
  const empty: NeuralCorrectionResult = {
    goldFloorDelta: 0,
    maxRerollsDelta: 0,
    targetLevelDelta: 0,
    buyThresholdBiasDelta: 0,
    slamAggressivenessDelta: 0,
    tempoHint: null,
    denyUrgeBoost: 0,
    pivotUrgeBoost: 0,
    reason: 'NO_NEURAL',
    applied: false,
  };

  const { economy, neural, skillLevel, isEmergency } = args;
  if (!neural || isEmergency) {
    return { ...empty, reason: isEmergency ? 'EMERGENCY_SKIP' : 'NO_NEURAL' };
  }

  // 플래너가 주체, 신경망은 약한 보정 (원안 Stage6)
  const strength = clamp(0.15 + skillLevel * 0.35, 0.15, 0.55);
  const value = neural.valueScore;
  const urg = neural.urgencies;
  const macro = neural.macroAction;

  let goldFloorDelta = 0;
  let maxRerollsDelta = 0;
  let targetLevelDelta = 0;
  let buyThresholdBiasDelta = 0;
  let slamAggressivenessDelta = 0;
  // tempo 교체는 극단 value/urgency일 때만
  let tempoHint: EconomyTempo | null = null;
  const extreme =
    value <= 0.32 || value >= 0.72 || urg.item > 0.75 || urg.pivot > 0.7;
  if (extreme) {
    tempoHint = macroToTempoHint(macro);
  }

  if (value >= 0.65) {
    goldFloorDelta += Math.round(4 * strength);
    maxRerollsDelta -= Math.round(1 * strength);
    buyThresholdBiasDelta += 2 * strength;
  } else if (value <= 0.35) {
    goldFloorDelta -= Math.round(5 * strength);
    maxRerollsDelta += Math.round(1 * strength);
    buyThresholdBiasDelta -= 2 * strength;
  }

  switch (macro) {
    case 'SAVE_INTEREST':
    case 'HIGHROLL_GREED':
      goldFloorDelta += Math.round(4 * strength);
      maxRerollsDelta -= Math.round(1 * strength);
      break;
    case 'TEMPO_LEVEL':
      goldFloorDelta -= Math.round(2 * strength);
      if (strength > 0.35) targetLevelDelta += 1;
      break;
    case 'ROLLDOWN':
      goldFloorDelta -= Math.round(5 * strength);
      maxRerollsDelta += Math.round(2 * strength);
      break;
    case 'STABILIZE_REROLL':
      goldFloorDelta -= Math.round(2 * strength);
      maxRerollsDelta += Math.round(1 * strength);
      break;
    case 'SLAM_ITEMS':
      slamAggressivenessDelta += 0.12 * strength;
      break;
    case 'PIVOT_BOARD':
      buyThresholdBiasDelta -= 2 * strength;
      break;
    case 'DENY_HOLD':
      goldFloorDelta -= Math.round(1 * strength);
      break;
    default:
      break;
  }

  slamAggressivenessDelta += (urg.item - 0.45) * 0.15 * strength;
  if (urg.pivot > 0.65) {
    maxRerollsDelta += Math.round(1 * strength);
  }

  if (economy.tempo === 'rolldown' && tempoHint === 'interest') {
    tempoHint = null;
  }
  if (economy.tempo === 'spike' && tempoHint === 'interest') {
    goldFloorDelta = Math.round(goldFloorDelta * 0.4);
    tempoHint = null;
  }

  return {
    goldFloorDelta: clamp(goldFloorDelta, -8, 8),
    maxRerollsDelta: clamp(maxRerollsDelta, -2, 3),
    targetLevelDelta: clamp(targetLevelDelta, -1, 1),
    buyThresholdBiasDelta: clamp(buyThresholdBiasDelta, -5, 5),
    slamAggressivenessDelta: clamp(slamAggressivenessDelta, -0.15, 0.2),
    tempoHint,
    denyUrgeBoost: urg.deny,
    pivotUrgeBoost: urg.pivot,
    reason: `NEURAL_${macro}_v${value.toFixed(2)}`,
    applied: true,
  };
}

/** EconomyPlan에 보정 적용 (새 객체) */
export function mergeEconomyWithCorrection(
  plan: EconomyPlan,
  corr: NeuralCorrectionResult
): EconomyPlan {
  if (!corr.applied) return plan;

  let tempo = plan.tempo;
  let preferRolldown = plan.preferRolldown;
  if (corr.tempoHint && corr.tempoHint !== plan.tempo) {
    // 완전 교체가 아니라 인접 전환만
    const order: EconomyTempo[] = ['interest', 'spike', 'stabilize', 'rolldown'];
    const a = order.indexOf(plan.tempo);
    const b = order.indexOf(corr.tempoHint);
    if (Math.abs(a - b) <= 1) {
      tempo = corr.tempoHint;
      preferRolldown = tempo === 'rolldown';
    }
  }

  return {
    ...plan,
    tempo,
    preferRolldown,
    goldFloor: clamp(plan.goldFloor + corr.goldFloorDelta, 0, 70),
    maxRerolls: clamp(plan.maxRerolls + corr.maxRerollsDelta, 0, 24),
    targetLevel: clamp(plan.targetLevel + corr.targetLevelDelta, 1, 10),
    buyThresholdBias: plan.buyThresholdBias + corr.buyThresholdBiasDelta,
    reason: `${plan.reason}+${corr.reason}`,
  };
}
