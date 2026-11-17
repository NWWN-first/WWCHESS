// src/GameData/traits.ts

import type { TraitId, TraitType } from './types';

// ============================================================================
// B. 13종 판타지 시너지 정의 (TRAIT_DEFINITIONS)
// ============================================================================

export interface TraitEffectTier {
  threshold: number;
  label: string;
  shieldMaxHpRatio?: number;
  bonusDef?: number;
  trueDamageRatio?: number;
  omnivamp?: number;
  atkSpeedPerStack?: number;
  hpRegenRatioPerTick?: number;
  initialBurnMaxHpRatio?: number;
  enableSkillCrit?: boolean;
  bonusCritDamage?: number;
  reviveHpRatio?: number;
  reviveBonusAtkSpeed?: number;
  teamManaPerAttack?: number;
  spellPowerBonus?: number;
  goblinStackMultiplier?: number;
  damageReductionFirst8s?: number;
  berserkAtkMultiplier?: number;
  berserkAtkSpeedMultiplier?: number;
  berserkSplashRatio?: number;
  bonusRange?: number;
  pierceArrowDamageRatio?: number;
  chainLightningDamage?: number;
  bonusCritChance?: number;
  healPerAttack?: number;
  ccDurationReduction?: number;
  holyRadianceDps?: number;
  roundBonusGold?: number;
}

export interface TraitDefinition {
  id: TraitId;
  name: string;
  type: TraitType;
  icon: string;
  color: string;
  thresholds: number[];
  description: string;
  effects: TraitEffectTier[];
}

export const TRAIT_DEFINITIONS: Record<TraitId, TraitDefinition> = {
  // ---- 계열(Origin) 7종 ----
  HOLY_EMPIRE: {
    id: 'HOLY_EMPIRE',
    name: '신성 제국',
    type: 'ORIGIN',
    icon: '🛡️',
    color: '#F5D76E',
    thresholds: [2, 4, 6, 9],
    description:
      '전투 시작 시 제국 기물들이 최대 체력 비례 신성 보호막(Shield)을 얻고 방어력이 증가합니다. 9신성제국 달성 시 불멸의 신화급 보호막!',
    effects: [
      { threshold: 2, label: '(2) 최대 체력 20% 보호막, 방어력 +25', shieldMaxHpRatio: 0.2, bonusDef: 25 },
      { threshold: 4, label: '(4) 최대 체력 40% 보호막, 방어력 +55', shieldMaxHpRatio: 0.4, bonusDef: 55 },
      { threshold: 6, label: '(6) 최대 체력 70% 보호막, 방어력 +95', shieldMaxHpRatio: 0.70, bonusDef: 95 },
      { threshold: 9, label: '(9) [프리즘/문장필수] 최대 체력 150% 보호막, 방어력 +220', shieldMaxHpRatio: 1.5, bonusDef: 220 },
    ],
  },
  ABYSSAL_DEMON: {
    id: 'ABYSSAL_DEMON',
    name: '심연의 악마',
    type: 'ORIGIN',
    icon: '👿',
    color: '#C0392B',
    thresholds: [2, 4, 6, 9],
    description:
      '악마 기물들의 기본 공격 및 스킬이 적에게 추가 고정 피해(True Damage)를 입히고 모든 피해 흡혈(Omnivamp)을 얻습니다.',
    effects: [
      { threshold: 2, label: '(2) 추가 고정 피해 11%, 모든 피해 흡혈 10%', trueDamageRatio: 0.11, omnivamp: 0.10 },
      { threshold: 4, label: '(4) 추가 고정 피해 25%, 모든 피해 흡혈 18%', trueDamageRatio: 0.25, omnivamp: 0.18 },
      { threshold: 6, label: '(6) 추가 고정 피해 45%, 모든 피해 흡혈 28%', trueDamageRatio: 0.45, omnivamp: 0.28 },
      { threshold: 9, label: '(9) [프리즘/문장필수] 추가 고정 피해 85%, 모든 피해 흡혈 55%', trueDamageRatio: 0.85, omnivamp: 0.55 },
    ],
  },
  ELVEN_SYLVAN: {
    id: 'ELVEN_SYLVAN',
    name: '엘프 숲',
    type: 'ORIGIN',
    icon: '🌿',
    color: '#2ECC71',
    thresholds: [2, 4, 6, 8],
    description:
      '매 2초마다 엘프 기물의 공격 속도가 중첩되어 빨라지며 최대 체력의 일정 비율을 회복합니다.',
    effects: [
      { threshold: 2, label: '(2) 2초마다 공속 +8%, 최대 체력 4% 회복', atkSpeedPerStack: 0.08, hpRegenRatioPerTick: 0.04 },
      { threshold: 4, label: '(4) 2초마다 공속 +16%, 최대 체력 8% 회복', atkSpeedPerStack: 0.16, hpRegenRatioPerTick: 0.08 },
      { threshold: 6, label: '(6) 2초마다 공속 +28%, 최대 체력 14% 회복', atkSpeedPerStack: 0.28, hpRegenRatioPerTick: 0.14 },
      { threshold: 8, label: '(8) [프리즘/문장필수] 2초마다 공속 +55% 무한중첩, 최대 체력 28% 회복', atkSpeedPerStack: 0.55, hpRegenRatioPerTick: 0.28 },
    ],
  },
  DRAGONKIN: {
    id: 'DRAGONKIN',
    name: '용족',
    type: 'ORIGIN',
    icon: '🐉',
    color: '#E67E22',
    thresholds: [2, 4, 6],
    description:
      '전투 시작 시 화염 숨결로 적 전체에게 최대 체력 비례 화상 피해를 입히고, 용족 기물의 스킬 치명타가 활성화됩니다.',
    effects: [
      {
        threshold: 2,
        label: '(2) 개전 화상 18%, 스킬 치명타 활성화 (+30% 치명타 피해)',
        initialBurnMaxHpRatio: 0.18,
        enableSkillCrit: true,
        bonusCritDamage: 0.30,
      },
      {
        threshold: 4,
        label: '(4) 개전 화상 42%, 스킬 치명타 활성화 (+85% 치명타 피해)',
        initialBurnMaxHpRatio: 0.42,
        enableSkillCrit: true,
        bonusCritDamage: 0.85,
      },
      {
        threshold: 6,
        label: '(6) [프리즘/문장필수] 개전 화상 70%, 스킬 치명타 활성화 (+180% 치명타 피해)',
        initialBurnMaxHpRatio: 0.70,
        enableSkillCrit: true,
        bonusCritDamage: 1.8,
      },
    ],
  },
  UNDEAD_SCOURGE: {
    id: 'UNDEAD_SCOURGE',
    name: '언데드 군단',
    type: 'ORIGIN',
    icon: '💀',
    color: '#8E44AD',
    thresholds: [2, 4, 6, 8],
    description:
      '전투 중 최초 사망 시 2초 뒤 지정된 체력 상태로 1회 부활(Revive)하며 공격 속도가 폭증합니다.',
    effects: [
      { threshold: 2, label: '(2) 최대 체력 40% 부활, 부활 후 공속 +35%', reviveHpRatio: 0.4, reviveBonusAtkSpeed: 0.35 },
      { threshold: 4, label: '(4) 최대 체력 70% 부활, 부활 후 공속 +65%', reviveHpRatio: 0.7, reviveBonusAtkSpeed: 0.65 },
      { threshold: 6, label: '(6) 최대 체력 95% 부활, 부활 후 공속 +110%', reviveHpRatio: 0.95, reviveBonusAtkSpeed: 1.1 },
      { threshold: 8, label: '(8) [프리즘/문장필수] 최대 체력 140% 부활, 부활 후 공속 +220%', reviveHpRatio: 1.4, reviveBonusAtkSpeed: 2.2 },
    ],
  },
  ARCANE_TOWER: {
    id: 'ARCANE_TOWER',
    name: '마탑',
    type: 'ORIGIN',
    icon: '🔮',
    color: '#3498DB',
    thresholds: [2, 4, 6, 9],
    description:
      '아군 전체의 기본 공격 시 마나 회복량이 증가하고, 마탑 기물들의 주문력(Spell Power)이 대폭 상승합니다.',
    effects: [
      { threshold: 2, label: '(2) 아군 평타 마나 +3, 마탑 주문력 +25%', teamManaPerAttack: 3, spellPowerBonus: 0.25 },
      { threshold: 4, label: '(4) 아군 평타 마나 +6, 마탑 주문력 +55%', teamManaPerAttack: 6, spellPowerBonus: 0.55 },
      { threshold: 6, label: '(6) 아군 평타 마나 +10, 마탑 주문력 +90%', teamManaPerAttack: 10, spellPowerBonus: 0.90 },
      { threshold: 9, label: '(9) [프리즘/문장필수] 아군 평타 마나 +20, 마탑 주문력 +200%', teamManaPerAttack: 20, spellPowerBonus: 2.0 },
    ],
  },
  GOLDEN_GOBLIN: {
    id: 'GOLDEN_GOBLIN',
    name: '황금 고블린',
    type: 'ORIGIN',
    icon: '🪙',
    color: '#F1C40F',
    thresholds: [3, 5, 7],
    description:
      '전투 패배 시 금고 스택이 기하급수적으로 축적됩니다. 전투 승리 시 금고가 폭발(Cash-out)하며 전리품이 쏟아집니다!',
    effects: [
      { threshold: 3, label: '(3) 패배 시 기본 금고 스택 축적 (1.0x), 승리 시 금고 개봉!', goblinStackMultiplier: 1.0 },
      { threshold: 5, label: '(5) 패배 시 금고 스택 2배 축적 (2.0x), 황금/프리즘 보물 대폭 증가!', goblinStackMultiplier: 2.0 },
      { threshold: 7, label: '(7) [프리즘/왕관필수] 패배 금고 스택 4.0배 축적, 초호화 대박 보상 확정!', goblinStackMultiplier: 4.0 },
    ],
  },

  // ---- 직업(Class) 6종 ----
  VANGUARD: {
    id: 'VANGUARD',
    name: '선봉대',
    type: 'CLASS',
    icon: '🏰',
    color: '#95A5A6',
    thresholds: [2, 4, 6, 9],
    description:
      '방어력이 대폭 증가하며 전투 시작 후 8초간 받는 모든 피해량이 추가 감소합니다. 9선봉대 달성 시 불멸의 요새가 됩니다.',
    effects: [
      { threshold: 2, label: '(2) 방어력 +40, 개전 8초간 피해 감소 30%', bonusDef: 40, damageReductionFirst8s: 0.3 },
      { threshold: 4, label: '(4) 방어력 +90, 개전 8초간 피해 감소 30%', bonusDef: 90, damageReductionFirst8s: 0.3 },
      { threshold: 6, label: '(6) 방어력 +160, 개전 8초간 피해 감소 30%', bonusDef: 160, damageReductionFirst8s: 0.3 },
      { threshold: 9, label: '(9) [프리즘/문장필수] 방어력 +350, 개전 8초간 피해 감소 55% 및 기절 면역', bonusDef: 350, damageReductionFirst8s: 0.55, ccDurationReduction: 1.0 },
    ],
  },
  BERSERKER: {
    id: 'BERSERKER',
    name: '광전사',
    type: 'CLASS',
    icon: '🪓',
    color: '#E74C3C',
    thresholds: [2, 4, 6, 9],
    description:
      '체력이 50% 이하로 내려가면 광폭화하여 공격력과 공격속도가 증가하고 기본 공격이 주변에 스플래시 피해를 입힙니다.',
    effects: [
      {
        threshold: 2,
        label: '(2) 광폭화 시 공격력/공속 2배, 주변 35% 스플래시 피해',
        berserkAtkMultiplier: 2.0,
        berserkAtkSpeedMultiplier: 2.0,
        berserkSplashRatio: 0.35,
      },
      {
        threshold: 4,
        label: '(4) 광폭화 시 공격력/공속 2.2배, 주변 60% 스플래시 피해',
        berserkAtkMultiplier: 2.2,
        berserkAtkSpeedMultiplier: 2.2,
        berserkSplashRatio: 0.6,
      },
      {
        threshold: 6,
        label: '(6) 광폭화 시 공격력/공속 2.5배, 주변 90% 스플래시 피해',
        berserkAtkMultiplier: 2.5,
        berserkAtkSpeedMultiplier: 2.5,
        berserkSplashRatio: 0.9,
      },
      {
        threshold: 9,
        label: '(9) [프리즘/문장필수] 광폭화 시 공격력/공속 3.2배, 주변 160% 스플래시 피해',
        berserkAtkMultiplier: 3.2,
        berserkAtkSpeedMultiplier: 3.2,
        berserkSplashRatio: 1.6,
      },
    ],
  },
  RANGER: {
    id: 'RANGER',
    name: '순찰자',
    type: 'CLASS',
    icon: '🏹',
    color: '#27AE60',
    thresholds: [2, 4, 6],
    description:
      '기본 공격 3회마다 관통 화살을 추가로 발사하며 사거리가 증가합니다.',
    effects: [
      { threshold: 2, label: '(2) 사거리 +1, 3타마다 공격력 185% 관통 화살 발사', bonusRange: 1, pierceArrowDamageRatio: 1.85 },
      { threshold: 4, label: '(4) 사거리 +1, 3타마다 공격력 340% 관통 화살 발사', bonusRange: 1, pierceArrowDamageRatio: 3.4 },
      { threshold: 6, label: '(6) [프리즘/문장필수] 사거리 +2, 3타마다 공격력 580% 관통 화살 발사', bonusRange: 2, pierceArrowDamageRatio: 5.8 },
    ],
  },
  ARCHMAGE: {
    id: 'ARCHMAGE',
    name: '대마법사',
    type: 'CLASS',
    icon: '⚡',
    color: '#9B59B6',
    thresholds: [2, 4, 6, 9],
    description:
      '주문력이 크게 증가하며, 최대 마나에 도달해 스킬을 시전할 때 체력이 가장 낮은 적에게 연쇄 번개를 추가로 떨어뜨립니다.',
    effects: [
      { threshold: 2, label: '(2) 주문력 +30%, 스킬 시전 시 180 연쇄 번개', spellPowerBonus: 0.3, chainLightningDamage: 180 },
      { threshold: 4, label: '(4) 주문력 +65%, 스킬 시전 시 380 연쇄 번개', spellPowerBonus: 0.65, chainLightningDamage: 380 },
      { threshold: 6, label: '(6) 주문력 +110%, 스킬 시전 시 700 연쇄 번개', spellPowerBonus: 1.1, chainLightningDamage: 700 },
      { threshold: 9, label: '(9) [프리즘/문장필수] 주문력 +240%, 스킬 시전 시 1600 연쇄 번개', spellPowerBonus: 2.4, chainLightningDamage: 1600 },
    ],
  },
  SHADOW_ASSASSIN: {
    id: 'SHADOW_ASSASSIN',
    name: '그림자 암살자',
    type: 'CLASS',
    icon: '🗡️',
    color: '#34495E',
    thresholds: [2, 4, 6],
    description:
      '전투 시작 시 적진 가장 뒷열로 은신 도약(Leap)하며 치명타 확률과 치명타 피해량이 대폭 증가합니다.',
    effects: [
      { threshold: 2, label: '(2) 후방 도약, 치명타 확률 +25%, 치명타 피해량 +35%', bonusCritChance: 0.25, bonusCritDamage: 0.35 },
      { threshold: 4, label: '(4) 후방 도약, 치명타 확률 +55%, 치명타 피해량 +75%', bonusCritChance: 0.55, bonusCritDamage: 0.75 },
      { threshold: 6, label: '(6) [프리즘/문장필수] 후방 도약, 치명타 확률 +85%, 치명타 피해량 +130%', bonusCritChance: 0.85, bonusCritDamage: 1.30 },
    ],
  },
  PALADIN: {
    id: 'PALADIN',
    name: '성기사',
    type: 'CLASS',
    icon: '✨',
    color: '#F39C12',
    thresholds: [2, 4, 6],
    description:
      '기본 공격 시 주변 아군의 체력을 회복시키고, 아군 전체에게 군중제어(기절) 지속시간 감소 또는 면역을 부여합니다.',
    effects: [
      { threshold: 2, label: '(2) 평타 시 주변 아군 65 회복, 아군 기절 지속시간 50% 감소', healPerAttack: 65, ccDurationReduction: 0.5 },
      { threshold: 4, label: '(4) 평타 시 주변 아군 160 회복, 아군 기절 지속시간 75% 감소', healPerAttack: 160, ccDurationReduction: 0.75 },
      { threshold: 6, label: '(6) [프리즘/문장필수] 평타 시 주변 아군 350 회복, 기절 완전 면역, 방어력 +70', healPerAttack: 350, ccDurationReduction: 1.0, bonusDef: 70 },
    ],
  },
};

