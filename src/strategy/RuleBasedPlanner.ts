// src/strategy/RuleBasedPlanner.ts
// Decision #1: 페르소나 전환만 제안. 시너지 피봇은 applyTraitChange=false로 분리.

import { AIPersona } from '../Participant';
import { StrategicPlanner } from './StrategicPlanner';
import {
  EconomyAttitude,
  ObservableStateSummary,
  RiskAttitude,
  StrategicPlan,
  StrategyChangeReason,
} from './types';

function parseStageNum(stage: string): number {
  return parseInt(stage.split('-')[0] || '1', 10);
}

function loseStreak(streak: number): number {
  return streak < 0 ? Math.abs(streak) : 0;
}

function winStreak(streak: number): number {
  return streak > 0 ? streak : 0;
}

function basePlan(
  state: ObservableStateSummary,
  overrides: Partial<StrategicPlan> & {
    recommendedPersona: AIPersona;
    reason: StrategyChangeReason;
  }
): StrategicPlan {
  return {
    botId: state.botId,
    recommendedPersona: overrides.recommendedPersona,
    recommendedMainTrait: state.self.currentMainTrait,
    economyAttitude: overrides.economyAttitude ?? 'TEMPO_LEVEL',
    riskAttitude: overrides.riskAttitude ?? 'BALANCED',
    confidence: overrides.confidence ?? 0.5,
    reason: overrides.reason,
    applyTraitChange: false,
  };
}

function noChangePlan(state: ObservableStateSummary): StrategicPlan {
  return basePlan(state, {
    recommendedPersona: state.self.persona,
    confidence: 1,
    economyAttitude: economyForPersona(state.self.persona),
    riskAttitude: 'BALANCED',
    reason: {
      code: 'NO_CHANGE',
      koreanSummary: '현재 성향 유지',
      metrics: {
        hp: state.self.hp,
        gold: state.self.gold,
        stage: state.table.stage,
        triggerMetric: 'NONE',
      },
    },
  });
}

function economyForPersona(persona: AIPersona): EconomyAttitude {
  switch (persona) {
    case 'FAST_NINE_GREEDY':
    case 'FAST_NINE_ECONOMIST':
      return 'SAVE_INTEREST';
    case 'HYPER_ROLLER':
    case 'LOW_COST_REROLLER':
      return 'AGGRESSIVE_ROLL';
    case 'GOBLIN_GAMBLER':
      return 'SAVE_INTEREST';
    default:
      return 'TEMPO_LEVEL';
  }
}

/**
 * Part C §3.4 규칙 기반 플래너.
 * 시드 PRNG(Math.random)만 사용 — 오프라인 재현성 유지.
 */
export class RuleBasedPlanner implements StrategicPlanner {
  propose(state: ObservableStateSummary): StrategicPlan {
    const persona = state.self.persona;
    const hp = state.self.hp;
    const stageNum = parseStageNum(state.table.stage);
    const losses = loseStreak(state.self.streak);
    const wins = winStreak(state.self.streak);
    const contested =
      state.table.traitContestCounts[state.self.currentMainTrait] ?? 0;

    // 소량의 노이즈로 동점 트리거 흔들림만 완화 (재현 가능)
    const jitter = Math.random() * 2;

    if (
      (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') &&
      hp <= 38 + jitter &&
      losses >= 3 &&
      state.self.level < 8
    ) {
      return basePlan(state, {
        recommendedPersona: 'FLEX_MASTER',
        confidence: 0.82,
        economyAttitude: 'TEMPO_LEVEL',
        riskAttitude: 'DEFENSIVE',
        reason: {
          code: 'EMERGENCY_STABILIZE',
          koreanSummary: `체력 ${hp}, ${losses}연패 위기 → 유연한 밸런스 덱으로 전환`,
          metrics: {
            hp,
            gold: state.self.gold,
            stage: state.table.stage,
            triggerMetric: `HP_CRITICAL (${hp} <= 38) & LOSE_STREAK=${losses}`,
          },
        },
      });
    }

    if (
      (persona === 'FAST_NINE_GREEDY' || persona === 'FAST_NINE_ECONOMIST') &&
      hp <= 28 + jitter &&
      contested >= 3
    ) {
      return basePlan(state, {
        recommendedPersona: 'HYPER_ROLLER',
        confidence: 0.78,
        economyAttitude: 'PANIC_ALL_IN',
        riskAttitude: 'DEFENSIVE',
        reason: {
          code: 'CONTESTED_ESCAPE',
          koreanSummary: `체력 ${hp}, 경합 ${contested}명 → 저코스트 리롤 생존 모드`,
          metrics: {
            hp,
            gold: state.self.gold,
            stage: state.table.stage,
            triggerMetric: `HP_PANIC (${hp} <= 28) & CONTEST=${contested}`,
          },
        },
      });
    }

    if (
      (persona === 'HYPER_ROLLER' || persona === 'LOW_COST_REROLLER') &&
      stageNum >= 4 &&
      state.self.threeStarCount === 0 &&
      hp <= 40 + jitter
    ) {
      return basePlan(state, {
        recommendedPersona: 'FLEX_MASTER',
        confidence: 0.8,
        economyAttitude: 'TEMPO_LEVEL',
        riskAttitude: 'BALANCED',
        reason: {
          code: 'EMERGENCY_STABILIZE',
          koreanSummary: `4스테이지 3성 0개·체력 ${hp} → 밸류 유연 운영으로 전환`,
          metrics: {
            hp,
            gold: state.self.gold,
            stage: state.table.stage,
            triggerMetric: `STAGE>=4 & THREE_STAR=0 & HP<=40`,
          },
        },
      });
    }

    if (
      persona === 'GOBLIN_GAMBLER' &&
      hp <= 32 + jitter &&
      state.self.goblinVaultStacks < 30
    ) {
      return basePlan(state, {
        recommendedPersona: 'FLEX_MASTER',
        confidence: 0.84,
        economyAttitude: 'PANIC_ALL_IN',
        riskAttitude: 'DEFENSIVE',
        reason: {
          code: 'CASHOUT_TRANSITION',
          koreanSummary: `체력 ${hp}, 금고 ${state.self.goblinVaultStacks} → 금고 포기 후 밸런스 보드`,
          metrics: {
            hp,
            gold: state.self.gold,
            stage: state.table.stage,
            triggerMetric: `HP<=32 & VAULT<30 (${state.self.goblinVaultStacks})`,
          },
        },
      });
    }

    if (
      (persona === 'FLEX_MASTER' || persona === 'FLEX_BALANCED') &&
      hp >= 85 &&
      state.self.gold >= 50 &&
      wins >= 5
    ) {
      return basePlan(state, {
        recommendedPersona: 'FAST_NINE_GREEDY',
        confidence: 0.76,
        economyAttitude: 'SAVE_INTEREST',
        riskAttitude: 'GREEDY',
        reason: {
          code: 'SNOWBALL_VALUE',
          koreanSummary: `체력 ${hp}, ${wins}연승·50G → 9레벨 고밸류 직행`,
          metrics: {
            hp,
            gold: state.self.gold,
            stage: state.table.stage,
            triggerMetric: `HP>=85 & GOLD>=50 & WIN_STREAK=${wins}`,
          },
        },
      });
    }

    return noChangePlan(state);
  }
}

export const defaultRuleBasedPlanner = new RuleBasedPlanner();
