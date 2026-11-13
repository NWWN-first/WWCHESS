// src/strategy/PersonaBias.ts
// Stage 5 (원안): 페르소나는 하드 분기가 아니라 초기/지속 소프트 편향만

import { AIPersona } from '../Participant';

/**
 * 플래너가 소비하는 페르소나 편향.
 * 절대 하한/리롤상한을 직접 결정하지 않고 ±만 준다.
 */
export interface PersonaBiasProfile {
  persona: AIPersona;
  /** 골드하한에 더할 값 (음수=더 공격적) */
  goldFloorBias: number;
  /** 목표 레벨에 더할 값 */
  levelBias: number;
  /** 리롤 상한에 더할 값 */
  rerollBias: number;
  /** 상점: 저코(1~2) 가산 */
  lowCostShopBias: number;
  /** 상점: 고코(4~5) 가산 */
  highCostShopBias: number;
  /** 황금 고블린 유닛 가산 */
  goblinUnitBias: number;
  /** 이자 템포 선호 0~1 */
  interestAppetite: number;
  /** 롤/안정화 선호 0~1 */
  rollAppetite: number;
  /** 레벨 푸시 선호 0~1 */
  levelAppetite: number;
  /** 증강: 리롤/경제/전투 가중 */
  augmentRerollBias: number;
  augmentEconomyBias: number;
  augmentCombatBias: number;
  /** 고블린 금고 샌드백 허용 */
  allowGoblinSandbag: boolean;
}

const DEFAULT_BIAS: Omit<PersonaBiasProfile, 'persona'> = {
  goldFloorBias: 0,
  levelBias: 0,
  rerollBias: 0,
  lowCostShopBias: 0,
  highCostShopBias: 0,
  goblinUnitBias: 0,
  interestAppetite: 0.5,
  rollAppetite: 0.45,
  levelAppetite: 0.45,
  augmentRerollBias: 0,
  augmentEconomyBias: 10,
  augmentCombatBias: 20,
  allowGoblinSandbag: false,
};

/**
 * 페르소나 → 소프트 편향. Comp/Economy/Item 플래너가 최종 결정을 한다.
 */
export function getPersonaBias(persona: AIPersona): PersonaBiasProfile {
  switch (persona) {
    case 'HYPER_ROLLER':
    case 'LOW_COST_REROLLER':
      return {
        ...DEFAULT_BIAS,
        persona,
        goldFloorBias: -8,
        levelBias: -1,
        rerollBias: 4,
        lowCostShopBias: 22,
        highCostShopBias: -14,
        interestAppetite: 0.3,
        rollAppetite: 0.75,
        levelAppetite: 0.25,
        augmentRerollBias: 55,
        augmentEconomyBias: 15,
        augmentCombatBias: 20,
      };
    case 'FAST_NINE_GREEDY':
    case 'FAST_NINE_ECONOMIST':
      return {
        ...DEFAULT_BIAS,
        persona,
        goldFloorBias: 12,
        levelBias: 2,
        rerollBias: -3,
        lowCostShopBias: -12,
        highCostShopBias: 28,
        interestAppetite: 0.65,
        rollAppetite: 0.25,
        levelAppetite: 0.85,
        augmentRerollBias: -10,
        augmentEconomyBias: 50,
        augmentCombatBias: 25,
      };
    case 'GOBLIN_GAMBLER':
      return {
        ...DEFAULT_BIAS,
        persona,
        goldFloorBias: 8,
        levelBias: -1,
        rerollBias: 0,
        lowCostShopBias: 4,
        highCostShopBias: 8,
        goblinUnitBias: 48,
        interestAppetite: 0.55,
        rollAppetite: 0.4,
        levelAppetite: 0.35,
        augmentRerollBias: 5,
        augmentEconomyBias: 60,
        augmentCombatBias: 30,
        allowGoblinSandbag: true,
      };
    case 'FLEX_MASTER':
    default:
      return {
        ...DEFAULT_BIAS,
        persona: 'FLEX_MASTER',
        highCostShopBias: 8, // cost* roughly via bias
        interestAppetite: 0.5,
        rollAppetite: 0.45,
        levelAppetite: 0.5,
        augmentRerollBias: 5,
        augmentEconomyBias: 15,
        augmentCombatBias: 35,
      };
  }
}
