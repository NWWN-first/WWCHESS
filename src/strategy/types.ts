// src/strategy/types.ts
// Step 7b: StrategicPlanner 관측/계획 타입 (docs/persona-switch-design.md Part D)

import { TraitId } from '../GameData';
import { AIPersona } from '../Participant';

export type StrategyChangeCode =
  | 'EMERGENCY_STABILIZE'
  | 'CONTESTED_ESCAPE'
  | 'SNOWBALL_VALUE'
  | 'CASHOUT_TRANSITION'
  | 'NO_CHANGE';

export interface StrategyChangeReason {
  code: StrategyChangeCode;
  koreanSummary: string;
  metrics: {
    hp: number;
    gold: number;
    stage: string;
    triggerMetric: string;
  };
}

/**
 * 봇이 관측할 수 있는 전장 요약.
 * 제외: 상대 미공개 상점 패, 비공개 리롤 시드, 이자 구간 외 정확한 1원 단위 골드.
 */
export interface ObservableStateSummary {
  botId: string;
  self: {
    hp: number;
    gold: number;
    level: number;
    xp: number;
    streak: number;
    boardValue: number;
    benchUnitCount: number;
    currentMainTrait: TraitId;
    coreUnitsRemainingRatio: number;
    persona: AIPersona;
    threeStarCount: number;
    goblinVaultStacks: number;
  };
  table: {
    stage: string;
    traitContestCounts: Partial<Record<TraitId, number>>;
    relativePowerRank: number;
    averageTableLevel: number;
  };
}

export type EconomyAttitude =
  | 'SAVE_INTEREST'
  | 'TEMPO_LEVEL'
  | 'AGGRESSIVE_ROLL'
  | 'PANIC_ALL_IN';

export type RiskAttitude = 'GREEDY' | 'BALANCED' | 'DEFENSIVE';

export interface StrategicPlan {
  botId: string;
  recommendedPersona: AIPersona;
  recommendedMainTrait: TraitId;
  economyAttitude: EconomyAttitude;
  riskAttitude: RiskAttitude;
  confidence: number;
  reason: StrategyChangeReason;
  /** false면 페르소나 전환만 검토하고 시너지(피봇)는 건드리지 않음 */
  applyTraitChange: boolean;
}

export interface PlanValidationContext {
  currentPersona: AIPersona;
  currentTrait: TraitId;
  boardTwoStarCount: number;
  ownedUnitsOfRecommendedTrait: number;
  personaSwitchCount: number;
  roundsSinceLastSwitch: number | null;
}
