// src/strategy/PlanValidator.ts

import {
  HYSTERESIS_THRESHOLD,
  MAX_PERSONA_SWITCH_PER_GAME,
  SWITCH_COOLDOWN_ROUNDS,
  isForbiddenPersonaTransition,
} from './StrategicPlanner';
import { PlanValidationContext, StrategicPlan } from './types';

/**
 * 불법/비합리적 계획을 기각한다. null이면 현재 상태 유지.
 */
export function validateStrategicPlan(
  plan: StrategicPlan,
  ctx: PlanValidationContext
): StrategicPlan | null {
  if (plan.recommendedPersona === ctx.currentPersona) {
    return plan;
  }

  if (ctx.personaSwitchCount >= MAX_PERSONA_SWITCH_PER_GAME) {
    return null;
  }

  if (
    ctx.roundsSinceLastSwitch !== null &&
    ctx.roundsSinceLastSwitch < SWITCH_COOLDOWN_ROUNDS
  ) {
    return null;
  }

  if (
    isForbiddenPersonaTransition(ctx.currentPersona, plan.recommendedPersona)
  ) {
    return null;
  }

  // 매몰 비용: 추천 시너지 기물이 없는데 보드 2성이 많으면 동시 피봇까지 막음
  if (
    plan.applyTraitChange &&
    plan.recommendedMainTrait !== ctx.currentTrait &&
    ctx.ownedUnitsOfRecommendedTrait <= 0 &&
    ctx.boardTwoStarCount >= 3
  ) {
    return {
      ...plan,
      recommendedMainTrait: ctx.currentTrait,
      applyTraitChange: false,
      confidence: Math.min(plan.confidence, 0.45),
      reason: {
        ...plan.reason,
        koreanSummary: `${plan.reason.koreanSummary} (시너지는 매몰비용으로 유지)`,
      },
    };
  }

  if (plan.confidence * 100 < HYSTERESIS_THRESHOLD) {
    return null;
  }

  return plan;
}
