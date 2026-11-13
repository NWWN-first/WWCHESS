// src/strategy/PivotPlanner.ts
// Stage 2: CompAnalyzer 추천 → 실제 전환 계획 (trait/구매우선/템포)

import { TraitId } from '../GameData';
import { AIPersona, Participant } from '../Participant';
import {
  CompAnalysisResult,
  CompDecision,
  CompReasonCode,
} from './CompAnalyzer';
import { CompDefinition, CompLevelHint } from './CompCatalog';

export interface PivotPlan {
  decision: CompDecision;
  /** hard-pivot 시에만 true — targetTrait 변경 */
  applyTraitChange: boolean;
  /** soft-flex/hard 모두: 구매 우선 유닛 */
  applyBuyBias: boolean;
  targetTrait: TraitId;
  secondaryTrait: TraitId;
  activeComp: CompDefinition;
  buyPriorityUnitIds: string[];
  keepUnitIds: string[];
  reason: CompReasonCode;
  /** 골드 하한 보정 (절대값 힌트, null이면 기존 유지) */
  goldFloorHint: number | null;
  /** 리롤 상한 보정 */
  maxRerollsHint: number | null;
  /** 올인 롤다운 권장 */
  preferRolldown: boolean;
  blockedReason?: string;
}

function secondaryFromComp(comp: CompDefinition): TraitId {
  return comp.secondaryTraits[0] ?? 'VANGUARD';
}

function tempoHints(
  hint: CompLevelHint,
  bot: Participant,
  decision: CompDecision
): Pick<PivotPlan, 'goldFloorHint' | 'maxRerollsHint' | 'preferRolldown'> {
  if (decision === 'stay') {
    return { goldFloorHint: null, maxRerollsHint: null, preferRolldown: false };
  }

  if (hint === 'reroll5') {
    // 리롤 템포: 이자보다 롤, 레벨 5~7 유지 구간
    const floor = bot.level <= 6 ? 10 : 20;
    return {
      goldFloorHint: floor,
      maxRerollsHint: decision === 'hard-pivot' ? 14 : 10,
      preferRolldown: bot.hp <= 40 || bot.level <= 6,
    };
  }
  if (hint === 'fast8') {
    return {
      goldFloorHint: decision === 'hard-pivot' ? 20 : 30,
      maxRerollsHint: decision === 'hard-pivot' ? 10 : null,
      preferRolldown: bot.hp <= 35,
    };
  }
  // fast9
  return {
    goldFloorHint: bot.level < 8 ? 40 : 20,
    maxRerollsHint: bot.level >= 8 ? 12 : 6,
    preferRolldown: bot.level >= 8 && bot.hp <= 45,
  };
}

/**
 * CompAnalyzer 결과를 실행 가능한 피벗 계획으로 변환.
 * - HP 위기 / 고블린 금고 / 피벗 횟수 제한으로 자살 피벗 차단
 * - soft-flex: trait 유지, 구매·세컨더리만 기울임
 * - hard-pivot: trait 교체 + 구매 우선순위 + 템포
 */
export function buildPivotPlan(args: {
  bot: Participant;
  persona: AIPersona;
  currentTrait: TraitId;
  pivotedCount: number;
  analysis: CompAnalysisResult;
  stage: number;
}): PivotPlan {
  const { bot, persona, currentTrait, pivotedCount, analysis, stage } = args;
  const recommended = analysis.recommended.comp;
  const decision = analysis.decision;

  const buyPriorityUnitIds = [
    ...recommended.coreUnitIds,
    ...recommended.carryUnitIds,
    ...recommended.flexUnitIds,
  ];
  const keepUnitIds = [
    ...new Set([
      ...recommended.coreUnitIds,
      ...recommended.flexUnitIds,
      ...recommended.tankUnitIds,
      ...recommended.carryUnitIds,
    ]),
  ];

  const base: PivotPlan = {
    decision: 'stay',
    applyTraitChange: false,
    applyBuyBias: false,
    targetTrait: currentTrait,
    secondaryTrait: secondaryFromComp(recommended),
    activeComp: recommended,
    buyPriorityUnitIds,
    keepUnitIds,
    reason: analysis.primaryReason,
    goldFloorHint: null,
    maxRerollsHint: null,
    preferRolldown: false,
  };

  if (decision === 'stay') {
    // stay여도 현재 최고 stay 컴프의 구매 바이어스는 약하게 적용
    const stayComp = analysis.stayComp?.comp ?? recommended;
    return {
      ...base,
      decision: 'stay',
      applyBuyBias: true,
      activeComp: stayComp,
      secondaryTrait: secondaryFromComp(stayComp),
      buyPriorityUnitIds: [
        ...stayComp.coreUnitIds,
        ...stayComp.carryUnitIds,
        ...stayComp.flexUnitIds,
      ],
      keepUnitIds: [
        ...new Set([
          ...stayComp.coreUnitIds,
          ...stayComp.flexUnitIds,
          ...stayComp.tankUnitIds,
          ...stayComp.carryUnitIds,
        ]),
      ],
      reason: analysis.primaryReason,
    };
  }

  // --- 안전 게이트 ---
  if (bot.hp <= 22) {
    return {
      ...base,
      decision: 'stay',
      blockedReason: 'HP_CRITICAL',
      reason: 'TEMPO_TOO_WEAK' as CompReasonCode,
    };
  }

  if (
    persona === 'GOBLIN_GAMBLER' &&
    bot.goblinVaultStacks >= 12 &&
    recommended.primaryTrait !== 'GOLDEN_GOBLIN'
  ) {
    return {
      ...base,
      decision: 'soft-flex',
      applyBuyBias: true,
      blockedReason: 'GOBLIN_VAULT_LOCK',
      ...tempoHints(recommended.levelHint, bot, 'soft-flex'),
    };
  }

  if (decision === 'soft-flex') {
    // trait는 유지하되 secondary + 구매를 추천 컴프 쪽으로
    return {
      ...base,
      decision: 'soft-flex',
      applyTraitChange: false,
      applyBuyBias: true,
      targetTrait: currentTrait,
      secondaryTrait: secondaryFromComp(recommended),
      ...tempoHints(recommended.levelHint, bot, 'soft-flex'),
    };
  }

  // hard-pivot
  if (pivotedCount >= 2) {
    return {
      ...base,
      decision: 'soft-flex',
      applyBuyBias: true,
      blockedReason: 'PIVOT_CAP',
      ...tempoHints(recommended.levelHint, bot, 'soft-flex'),
    };
  }

  // 초반(스테이지1~2) hard는 마진이 커야 함
  if (stage <= 2 && analysis.margin < 14) {
    return {
      ...base,
      decision: 'soft-flex',
      applyBuyBias: true,
      blockedReason: 'EARLY_MARGIN',
      ...tempoHints(recommended.levelHint, bot, 'soft-flex'),
    };
  }

  // 전환 비용이 너무 높고 HP도 낮으면 soft로 강등
  if (
    analysis.recommended.breakdown.transitionEase < 32 &&
    bot.hp <= 40
  ) {
    return {
      ...base,
      decision: 'soft-flex',
      applyBuyBias: true,
      blockedReason: 'TRANSITION_RISKY',
      reason: 'TRANSITION_COSTLY',
      ...tempoHints(recommended.levelHint, bot, 'soft-flex'),
    };
  }

  if (recommended.primaryTrait === currentTrait) {
    // hard라고 했지만 trait 동일 → soft로
    return {
      ...base,
      decision: 'soft-flex',
      applyBuyBias: true,
      ...tempoHints(recommended.levelHint, bot, 'soft-flex'),
    };
  }

  return {
    ...base,
    decision: 'hard-pivot',
    applyTraitChange: true,
    applyBuyBias: true,
    targetTrait: recommended.primaryTrait,
    secondaryTrait: secondaryFromComp(recommended),
    reason: analysis.primaryReason,
    ...tempoHints(recommended.levelHint, bot, 'hard-pivot'),
  };
}
