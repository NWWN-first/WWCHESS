// src/strategy/StrategicPlanner.ts

import { AIPersona } from '../Participant';
import { ObservableStateSummary, StrategicPlan } from './types';

export interface StrategicPlanner {
  propose(state: ObservableStateSummary): StrategicPlan;
}

/** Decision lock (Step 7a 추천안): 페르소나 전환 판당 최대 1회 */
export const MAX_PERSONA_SWITCH_PER_GAME = 1;

/** 시너지 피봇은 기존 pivotedCount로 관리. 여기선 참고용 상수만 유지 */
export const MAX_TRAIT_PIVOT_PER_GAME = 2;

export const SWITCH_COOLDOWN_ROUNDS = 5;

export const HYSTERESIS_THRESHOLD = 25;

/**
 * 금지 페르소나 전환 (출발 → 도착).
 * Decision #1: 피봇과 분리하되, 자살성 성향 전환만 차단.
 */
export const FORBIDDEN_PERSONA_TRANSITIONS: ReadonlyArray<
  readonly [AIPersona, AIPersona]
> = [
  ['GOBLIN_GAMBLER', 'HYPER_ROLLER'],
  ['HYPER_ROLLER', 'FAST_NINE_GREEDY'],
  ['GOBLIN_GAMBLER', 'LOW_COST_REROLLER'],
  ['LOW_COST_REROLLER', 'FAST_NINE_GREEDY'],
  ['LOW_COST_REROLLER', 'FAST_NINE_ECONOMIST'],
  ['HYPER_ROLLER', 'FAST_NINE_ECONOMIST'],
];

export function isForbiddenPersonaTransition(
  from: AIPersona,
  to: AIPersona
): boolean {
  return FORBIDDEN_PERSONA_TRANSITIONS.some(([a, b]) => a === from && b === to);
}

/** Decision #3: X-1 / X-2 정비에서만 평가 (스테이지 2+) */
export function isStrategyEvaluationWindow(
  stage: number,
  roundInStage: number
): boolean {
  return stage >= 2 && (roundInStage === 1 || roundInStage === 2);
}

export function isDynamicStrategyExperimentEnabled(): boolean {
  return (
    typeof process !== 'undefined' &&
    process.env?.EXPERIMENT_DYNAMIC_STRATEGY === '1'
  );
}
