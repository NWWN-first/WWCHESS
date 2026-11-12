// src/GameData.ts

export type CostTier = 1 | 2 | 3 | 4 | 5;
export type StarLevel = 1 | 2 | 3;
export type TraitType = 'ORIGIN' | 'CLASS';
export type AugmentTier = 'SILVER' | 'GOLD' | 'PRISMATIC';

export type TraitId =
  | 'HOLY_EMPIRE'
  | 'ABYSSAL_DEMON'
  | 'ELVEN_SYLVAN'
  | 'DRAGONKIN'
  | 'UNDEAD_SCOURGE'
  | 'ARCANE_TOWER'
  | 'GOLDEN_GOBLIN'
  | 'VANGUARD'
  | 'BERSERKER'
  | 'RANGER'
  | 'ARCHMAGE'
  | 'SHADOW_ASSASSIN'
  | 'PALADIN';

export type BaseItemId = 'SWORD' | 'BOW' | 'ROD' | 'TEAR' | 'ARMOR';

export type CompletedItemId =
  | 'INFINITY_EDGE'
  | 'GIANT_SLAYER'
  | 'HEXTECH_GUNBLADE'
  | 'SPEAR_OF_SHOJIN'
  | 'BLOODTHIRSTER'
  | 'RAPID_FIRECANNON'
  | 'GUINSOOS_RAGEBLADE'
  | 'STATIKK_SHIV'
  | 'TITANS_RESOLVE'
  | 'RABADONS_DEATHCAP'
  | 'ARCHANGELS_STAFF'
  | 'SUNFIRE_CAPE'
  | 'BLUE_BUFF'
  | 'PROTECTORS_VOW'
  | 'BRAMBLE_VEST';

export type ItemId = BaseItemId | CompletedItemId;

export type SkillType =
  | 'SELF_SHIELD_SLASH'
  | 'ASSASSIN_GOLD_STRIKE'
  | 'TRIPLE_SNIPE'
  | 'THORN_SMASH'
  | 'ARCANE_BOLT'
  | 'ACID_BOMB_SHRED'
  | 'SHIELD_BASH_HEAL'
  | 'CURRENT_HP_ARROW'
  | 'ROOT_AND_REGEN'
  | 'BACKLINE_CRIT_SLASH'
  | 'GOLD_SCALING_CLEAVE'
  | 'DRAGON_BREATH_ARMOR'
  | 'TORNADO_KNOCKUP'
  | 'BLOOD_DRAIN_TRIO'
  | 'EXCALIBUR_TEAM_SHIELD'
  | 'METEOR_SWARM'
  | 'EXECUTE_RESET'
  | 'APOCALYPSE_BREATH'
  | 'GOLDEN_VAULT_BOMBARD'
  | 'JUDGMENT_BARRAGE';

// ============================================================================
// A. 경제 및 확률 테이블 (Economy & Probability Tables)
// ============================================================================

export const POOL_SIZE_BY_COST: Record<CostTier, number> = {
  1: 30, // 1코스트: 기물당 30개 (3성 다수 가능)
  2: 25, // 2코스트: 기물당 25개 (3성 2명 가능)
  3: 18, // 3코스트: 기물당 18개 (경합 시 3성 어려움)
  4: 10, // 4코스트: 기물당 10개 (상대가 2장만 쥐고 있어도 3성 불가!)
  5: 9,  // 5코스트: 기물당 9개 (누군가 1장이라도 사가면 복제기 없이 3성 절대 불가!)
};

/**
 * 레벨 1~10 각 코스트(1~5) 상점 등장 확률 (%)
 * 배열 인덱스 0 -> 1코스트, 1 -> 2코스트, 2 -> 3코스트, 3 -> 4코스트, 4 -> 5코스트
 */
export const SHOP_ODDS_BY_LEVEL: Record<number, [number, number, number, number, number]> = {
  1: [100, 0, 0, 0, 0],
  2: [100, 0, 0, 0, 0],
  3: [75, 25, 0, 0, 0],
  4: [55, 30, 15, 0, 0],
  5: [45, 33, 20, 2, 0],
  6: [30, 40, 25, 5, 0],
  7: [19, 30, 40, 10, 1],
  8: [18, 27, 32, 20, 3],
  9: [15, 20, 25, 30, 10],
  10: [5, 10, 20, 40, 25],
};

/**
 * 해당 레벨 달성에 필요한 누적/구간 경험치 테이블 (Lv.2 ~ Lv.10)
 */
export const XP_REQUIRED_BY_LEVEL: Record<number, number> = {
  2: 2,
  3: 6,
  4: 10,
  5: 20,
  6: 36,
  7: 56,
  8: 80,
  9: 100,
  10: 124,
};

/**
 * 성급별 스탯 배율 규칙
 * - 1~4코스트: 성급 상승 시 체력/공격력 1.8배씩 증가 (1성: 1.0, 2성: 1.8, 3성: 3.24)
 * - 5코스트: 3성 달성 시 체력 4.0배, 스킬 계수 20배 (절대 권능 God Mode)
 */
export const STAR_STAT_MULTIPLIER: Record<
  CostTier,
  Record<StarLevel, { hpMult: number; atkMult: number; skillMult: number }>
> = {
  1: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.85, atkMult: 1.85, skillMult: 1.0 },
    3: { hpMult: 3.42, atkMult: 3.42, skillMult: 1.0 }, // 1코 3성 뽕맛 강화 (3.24 -> 3.42)
  },
  2: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.85, atkMult: 1.85, skillMult: 1.0 },
    3: { hpMult: 3.42, atkMult: 3.42, skillMult: 1.0 }, // 2코 3성 캐리력 강화
  },
  3: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.85, atkMult: 1.85, skillMult: 1.0 },
    3: { hpMult: 3.42, atkMult: 3.42, skillMult: 1.0 }, // 3코 3성 강력한 트럭
  },
  4: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.85, atkMult: 1.85, skillMult: 1.0 },
    3: { hpMult: 3.35, atkMult: 3.35, skillMult: 1.0 },
  },
  5: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.8, atkMult: 1.8, skillMult: 1.0 },
    3: { hpMult: 4.0, atkMult: 3.5, skillMult: 20.0 },
  },
};

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
    thresholds: [2, 4, 6, 8],
    description:
      '전투 시작 시 제국 기물들이 최대 체력 비례 신성 보호막(Shield)을 얻고 방어력이 증가합니다. 8신성제국 시 전설적 보호막과 방어력 증폭!',
    effects: [
      { threshold: 2, label: '(2) 최대 체력 20% 보호막, 방어력 +25', shieldMaxHpRatio: 0.2, bonusDef: 25 },
      { threshold: 4, label: '(4) 최대 체력 40% 보호막, 방어력 +55', shieldMaxHpRatio: 0.4, bonusDef: 55 },
      { threshold: 6, label: '(6) 최대 체력 75% 보호막, 방어력 +100', shieldMaxHpRatio: 0.75, bonusDef: 100 },
      { threshold: 8, label: '(8) [프리즘] 최대 체력 130% 보호막, 방어력 +190', shieldMaxHpRatio: 1.3, bonusDef: 190 },
    ],
  },
  ABYSSAL_DEMON: {
    id: 'ABYSSAL_DEMON',
    name: '심연의 악마',
    type: 'ORIGIN',
    icon: '👿',
    color: '#C0392B',
    thresholds: [2, 4, 6, 8],
    description:
      '악마 기물들의 기본 공격 및 스킬이 적에게 추가 고정 피해(True Damage)를 입히고 모든 피해 흡혈(Omnivamp)을 얻습니다.',
    effects: [
      { threshold: 2, label: '(2) 추가 고정 피해 11%, 모든 피해 흡혈 10%', trueDamageRatio: 0.11, omnivamp: 0.10 },
      { threshold: 4, label: '(4) 추가 고정 피해 25%, 모든 피해 흡혈 18%', trueDamageRatio: 0.25, omnivamp: 0.18 },
      { threshold: 6, label: '(6) 추가 고정 피해 48%, 모든 피해 흡혈 30%', trueDamageRatio: 0.48, omnivamp: 0.30 },
      { threshold: 8, label: '(8) [프리즘] 추가 고정 피해 75%, 모든 피해 흡혈 48%', trueDamageRatio: 0.75, omnivamp: 0.48 },
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
      { threshold: 6, label: '(6) 2초마다 공속 +30%, 최대 체력 15% 회복', atkSpeedPerStack: 0.3, hpRegenRatioPerTick: 0.15 },
      { threshold: 8, label: '(8) [프리즘] 2초마다 공속 +50% 무한중첩, 최대 체력 25% 회복', atkSpeedPerStack: 0.5, hpRegenRatioPerTick: 0.25 },
    ],
  },
  DRAGONKIN: {
    id: 'DRAGONKIN',
    name: '용족',
    type: 'ORIGIN',
    icon: '🐉',
    color: '#E67E22',
    thresholds: [2, 3, 4, 6],
    description:
      '전투 시작 시 화염 숨결로 적 전체에게 최대 체력 비례 화상 피해를 입히고, 용족 기물의 스킬 치명타가 활성화됩니다.',
    effects: [
      {
        threshold: 2,
        label: '(2) 개전 화상 16%, 스킬 치명타 활성화 (+25% 치명타 피해)',
        initialBurnMaxHpRatio: 0.16,
        enableSkillCrit: true,
        bonusCritDamage: 0.25,
      },
      {
        threshold: 3,
        label: '(3) 개전 화상 28%, 스킬 치명타 활성화 (+50% 치명타 피해)',
        initialBurnMaxHpRatio: 0.28,
        enableSkillCrit: true,
        bonusCritDamage: 0.5,
      },
      {
        threshold: 4,
        label: '(4) 개전 화상 46%, 스킬 치명타 활성화 (+90% 치명타 피해)',
        initialBurnMaxHpRatio: 0.46,
        enableSkillCrit: true,
        bonusCritDamage: 0.9,
      },
      {
        threshold: 6,
        label: '(6) [프리즘] 개전 화상 65%, 스킬 치명타 활성화 (+160% 치명타 피해)',
        initialBurnMaxHpRatio: 0.65,
        enableSkillCrit: true,
        bonusCritDamage: 1.6,
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
      { threshold: 6, label: '(6) 최대 체력 100% 부활, 부활 후 공속 +120%', reviveHpRatio: 1.0, reviveBonusAtkSpeed: 1.2 },
      { threshold: 8, label: '(8) [프리즘] 최대 체력 130% 부활, 부활 후 공속 +200%', reviveHpRatio: 1.3, reviveBonusAtkSpeed: 2.0 },
    ],
  },
  ARCANE_TOWER: {
    id: 'ARCANE_TOWER',
    name: '마탑',
    type: 'ORIGIN',
    icon: '🔮',
    color: '#3498DB',
    thresholds: [2, 4, 6, 8],
    description:
      '아군 전체의 기본 공격 시 마나 회복량이 증가하고, 마탑 기물들의 주문력(Spell Power)이 대폭 상승합니다.',
    effects: [
      { threshold: 2, label: '(2) 아군 평타 마나 +3, 마탑 주문력 +25%', teamManaPerAttack: 3, spellPowerBonus: 0.25 },
      { threshold: 4, label: '(4) 아군 평타 마나 +6, 마탑 주문력 +55%', teamManaPerAttack: 6, spellPowerBonus: 0.55 },
      { threshold: 6, label: '(6) 아군 평타 마나 +12, 마탑 주문력 +100%', teamManaPerAttack: 12, spellPowerBonus: 1.0 },
      { threshold: 8, label: '(8) [프리즘] 아군 평타 마나 +18, 마탑 주문력 +180%', teamManaPerAttack: 18, spellPowerBonus: 1.8 },
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
      { threshold: 7, label: '(7) [프리즘] 패배 금고 스택 3.5배 축적, 초호화 대박 보상 확정!', goblinStackMultiplier: 3.5 },
    ],
  },

  // ---- 직업(Class) 6종 ----
  VANGUARD: {
    id: 'VANGUARD',
    name: '선봉대',
    type: 'CLASS',
    icon: '🏰',
    color: '#95A5A6',
    thresholds: [2, 4, 6, 8],
    description:
      '방어력이 대폭 증가하며 전투 시작 후 8초간 받는 모든 피해량이 추가 감소합니다. 8선봉대 달성 시 철벽의 요새가 됩니다.',
    effects: [
      { threshold: 2, label: '(2) 방어력 +40, 개전 8초간 피해 감소 30%', bonusDef: 40, damageReductionFirst8s: 0.3 },
      { threshold: 4, label: '(4) 방어력 +90, 개전 8초간 피해 감소 30%', bonusDef: 90, damageReductionFirst8s: 0.3 },
      { threshold: 6, label: '(6) 방어력 +180, 개전 8초간 피해 감소 30%', bonusDef: 180, damageReductionFirst8s: 0.3 },
      { threshold: 8, label: '(8) [프리즘] 방어력 +320, 개전 8초간 피해 감소 50% 및 기절 면역', bonusDef: 320, damageReductionFirst8s: 0.5, ccDurationReduction: 1.0 },
    ],
  },
  BERSERKER: {
    id: 'BERSERKER',
    name: '광전사',
    type: 'CLASS',
    icon: '🪓',
    color: '#E74C3C',
    thresholds: [2, 4, 6, 8],
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
        label: '(6) 광폭화 시 공격력/공속 2.5배, 주변 100% 스플래시 피해',
        berserkAtkMultiplier: 2.5,
        berserkAtkSpeedMultiplier: 2.5,
        berserkSplashRatio: 1.0,
      },
      {
        threshold: 8,
        label: '(8) [프리즘] 광폭화 시 공격력/공속 3.0배, 주변 150% 스플래시 피해',
        berserkAtkMultiplier: 3.0,
        berserkAtkSpeedMultiplier: 3.0,
        berserkSplashRatio: 1.5,
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
      { threshold: 2, label: '(2) 사거리 +1, 3타마다 공격력 160% 관통 화살 발사', bonusRange: 1, pierceArrowDamageRatio: 1.6 },
      { threshold: 4, label: '(4) 사거리 +1, 3타마다 공격력 290% 관통 화살 발사', bonusRange: 1, pierceArrowDamageRatio: 2.9 },
      { threshold: 6, label: '(6) [프리즘] 사거리 +2, 3타마다 공격력 450% 관통 화살 발사', bonusRange: 2, pierceArrowDamageRatio: 4.5 },
    ],
  },
  ARCHMAGE: {
    id: 'ARCHMAGE',
    name: '대마법사',
    type: 'CLASS',
    icon: '⚡',
    color: '#9B59B6',
    thresholds: [2, 4, 6, 8],
    description:
      '주문력이 크게 증가하며, 최대 마나에 도달해 스킬을 시전할 때 체력이 가장 낮은 적에게 연쇄 번개를 추가로 떨어뜨립니다.',
    effects: [
      { threshold: 2, label: '(2) 주문력 +30%, 스킬 시전 시 180 연쇄 번개', spellPowerBonus: 0.3, chainLightningDamage: 180 },
      { threshold: 4, label: '(4) 주문력 +65%, 스킬 시전 시 380 연쇄 번개', spellPowerBonus: 0.65, chainLightningDamage: 380 },
      { threshold: 6, label: '(6) 주문력 +120%, 스킬 시전 시 750 연쇄 번개', spellPowerBonus: 1.2, chainLightningDamage: 750 },
      { threshold: 8, label: '(8) [프리즘] 주문력 +220%, 스킬 시전 시 1400 연쇄 번개', spellPowerBonus: 2.2, chainLightningDamage: 1400 },
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
      { threshold: 6, label: '(6) [프리즘] 후방 도약, 치명타 확률 +80%, 치명타 피해량 +120%', bonusCritChance: 0.80, bonusCritDamage: 1.20 },
    ],
  },
  PALADIN: {
    id: 'PALADIN',
    name: '성기사',
    type: 'CLASS',
    icon: '✨',
    color: '#F39C12',
    thresholds: [2, 3, 5],
    description:
      '기본 공격 시 주변 아군의 체력을 회복시키고, 아군 전체에게 군중제어(기절) 지속시간 감소 또는 면역을 부여합니다.',
    effects: [
      { threshold: 2, label: '(2) 평타 시 주변 아군 65 회복, 아군 기절 지속시간 50% 감소', healPerAttack: 65, ccDurationReduction: 0.5 },
      { threshold: 3, label: '(3) 평타 시 주변 아군 150 회복, 아군 전체 군중제어 완전 면역', healPerAttack: 150, ccDurationReduction: 1.0 },
      { threshold: 5, label: '(5) [프리즘] 평타 시 주변 아군 300 회복, 기절 면역, 방어력 +60', healPerAttack: 300, ccDurationReduction: 1.0, bonusDef: 60 },
    ],
  },
};

// ============================================================================
// C. 20종 판타지 챔피언 정의 (UNIT_TEMPLATES)
// ============================================================================

export interface UnitStats {
  hp: number;
  atk: number;
  def: number;
  atkSpeed: number;
  range: number;
  startMana: number;
  maxMana: number;
}

export interface UnitSkillTemplate {
  name: string;
  description: string;
  skillType: SkillType;
  baseValueByStar: [number, number, number];
  secondaryValueByStar?: [number, number, number];
  manaLockMs: number;
}

export interface UnitTemplate {
  id: string;
  name: string;
  cost: CostTier;
  traits: TraitId[];
  icon: string;
  stats: UnitStats;
  skill: UnitSkillTemplate;
}

export const UNIT_TEMPLATES: Record<string, UnitTemplate> = {
  // --------------------------------------------------------------------------
  // 1코스트 (5종)
  // --------------------------------------------------------------------------
  u1_garen: {
    id: 'u1_garen',
    name: '제국 보병 가렌',
    cost: 1,
    traits: ['HOLY_EMPIRE', 'VANGUARD'],
    icon: '🛡️',
    stats: {
      hp: 650,
      atk: 50,
      def: 40,
      atkSpeed: 0.6,
      range: 1,
      startMana: 30,
      maxMana: 80,
    },
    skill: {
      name: '심판의 회전참',
      description: '검을 회전시켜 인접한 적에게 물리 피해를 입히고 4초간 신성 보호막을 얻습니다.',
      skillType: 'SELF_SHIELD_SLASH',
      baseValueByStar: [200, 320, 520],
      secondaryValueByStar: [220, 350, 550],
      manaLockMs: 1000,
    },
  },
  u1_pip: {
    id: 'u1_pip',
    name: '고블린 소매치기 핍',
    cost: 1,
    traits: ['GOLDEN_GOBLIN', 'SHADOW_ASSASSIN'],
    icon: '🗡️',
    stats: {
      hp: 580,
      atk: 64,
      def: 24,
      atkSpeed: 0.78,
      range: 1,
      startMana: 20,
      maxMana: 55,
    },
    skill: {
      name: '급소 소매치기',
      description: '적 후방으로 도약한 뒤 단검으로 급소를 찌릅니다. 스킬로 적 처치 시 30% 확률로 1골드를 즉시 드랍합니다!',
      skillType: 'ASSASSIN_GOLD_STRIKE',
      baseValueByStar: [240, 380, 620],
      secondaryValueByStar: [0.3, 0.3, 0.3],
      manaLockMs: 800,
    },
  },
  u1_aria: {
    id: 'u1_aria',
    name: '엘프 궁수 아리아',
    cost: 1,
    traits: ['ELVEN_SYLVAN', 'RANGER'],
    icon: '🏹',
    stats: {
      hp: 480,
      atk: 52,
      def: 15,
      atkSpeed: 0.75,
      range: 4,
      startMana: 0,
      maxMana: 70,
    },
    skill: {
      name: '바람의 3연사',
      description: '단일 대상에게 초고속으로 화살 3발을 연속 발사하여 물리 피해를 입힙니다.',
      skillType: 'TRIPLE_SNIPE',
      baseValueByStar: [270, 420, 680],
      manaLockMs: 700,
    },
  },
  u1_skel: {
    id: 'u1_skel',
    name: '해골 전사 스켈',
    cost: 1,
    traits: ['UNDEAD_SCOURGE', 'BERSERKER'],
    icon: '💀',
    stats: {
      hp: 620,
      atk: 58,
      def: 35,
      atkSpeed: 0.65,
      range: 1,
      startMana: 20,
      maxMana: 75,
    },
    skill: {
      name: '원한의 가시 강타',
      description: '뼈 도끼로 대상을 강타하고 주변 적에게 가시 충격파 피해를 입힙니다.',
      skillType: 'THORN_SMASH',
      baseValueByStar: [230, 360, 580],
      secondaryValueByStar: [90, 150, 260],
      manaLockMs: 900,
    },
  },
  u1_lumi: {
    id: 'u1_lumi',
    name: '견습 마법사 루미',
    cost: 1,
    traits: ['ARCANE_TOWER', 'ARCHMAGE'],
    icon: '🔮',
    stats: {
      hp: 460,
      atk: 42,
      def: 15,
      atkSpeed: 0.65,
      range: 4,
      startMana: 20,
      maxMana: 60,
    },
    skill: {
      name: '비전 구체',
      description: '응축된 비전 구체를 발사하여 단일 대상에게 강력한 마법 피해를 입힙니다.',
      skillType: 'ARCANE_BOLT',
      baseValueByStar: [280, 440, 720],
      manaLockMs: 800,
    },
  },
  u1_valen: {
    id: 'u1_valen',
    name: '성당 수련기사 발렌',
    cost: 1,
    traits: ['HOLY_EMPIRE', 'PALADIN'],
    icon: '✝️',
    stats: {
      hp: 640,
      atk: 48,
      def: 38,
      atkSpeed: 0.6,
      range: 1,
      startMana: 30,
      maxMana: 80,
    },
    skill: {
      name: '축복의 철퇴',
      description: '신성한 철퇴로 적을 강타해 기절시키고 가장 체력이 낮은 아군을 치유합니다.',
      skillType: 'SHIELD_BASH_HEAL',
      baseValueByStar: [180, 280, 450],
      secondaryValueByStar: [210, 330, 520],
      manaLockMs: 950,
    },
  },
  u1_imp: {
    id: 'u1_imp',
    name: '심연 화염임프 렉스',
    cost: 1,
    traits: ['ABYSSAL_DEMON', 'ARCHMAGE'],
    icon: '👿',
    stats: {
      hp: 470,
      atk: 46,
      def: 18,
      atkSpeed: 0.7,
      range: 3,
      startMana: 20,
      maxMana: 65,
    },
    skill: {
      name: '지옥불 탄환',
      description: '심연의 화염구체를 발사하여 대상에게 마법 피해를 입힙니다.',
      skillType: 'ARCANE_BOLT',
      baseValueByStar: [275, 430, 710],
      manaLockMs: 750,
    },
  },
  u1_thorn: {
    id: 'u1_thorn',
    name: '가시덩굴 파수꾼 쏜',
    cost: 1,
    traits: ['ELVEN_SYLVAN', 'VANGUARD'],
    icon: '🌿',
    stats: {
      hp: 680,
      atk: 49,
      def: 42,
      atkSpeed: 0.55,
      range: 1,
      startMana: 35,
      maxMana: 85,
    },
    skill: {
      name: '가시나무 껍질',
      description: '주변 적에게 가시 피해를 입히고 4초간 자연 보호막을 얻습니다.',
      skillType: 'SELF_SHIELD_SLASH',
      baseValueByStar: [190, 300, 490],
      secondaryValueByStar: [240, 380, 600],
      manaLockMs: 1000,
    },
  },
  u1_whelp: {
    id: 'u1_whelp',
    name: '새끼 화염룡 이그니',
    cost: 1,
    traits: ['DRAGONKIN', 'RANGER'],
    icon: '🐉',
    stats: {
      hp: 580,
      atk: 62,
      def: 24,
      atkSpeed: 0.75,
      range: 3,
      startMana: 15,
      maxMana: 60,
    },
    skill: {
      name: '불꽃 3연발',
      description: '작은 화염 브레스를 3연속 내뿜어 단일 대상에게 물리 피해를 입힙니다.',
      skillType: 'TRIPLE_SNIPE',
      baseValueByStar: [265, 415, 670],
      manaLockMs: 750,
    },
  },
  u1_ghoul: {
    id: 'u1_ghoul',
    name: '무덤 도굴꾼 구울',
    cost: 1,
    traits: ['UNDEAD_SCOURGE', 'SHADOW_ASSASSIN'],
    icon: '🧟',
    stats: {
      hp: 520,
      atk: 58,
      def: 22,
      atkSpeed: 0.75,
      range: 1,
      startMana: 20,
      maxMana: 60,
    },
    skill: {
      name: '암흑 발톱 기습',
      description: '적 후방으로 파고들어 치명적인 발톱 할퀴기를 가합니다.',
      skillType: 'BACKLINE_CRIT_SLASH',
      baseValueByStar: [255, 395, 640],
      manaLockMs: 800,
    },
  },
  u1_chrona: {
    id: 'u1_chrona',
    name: '마탑 파수병 크로나',
    cost: 1,
    traits: ['ARCANE_TOWER', 'VANGUARD'],
    icon: '🛡️',
    stats: {
      hp: 660,
      atk: 47,
      def: 40,
      atkSpeed: 0.58,
      range: 1,
      startMana: 30,
      maxMana: 80,
    },
    skill: {
      name: '마력 방벽 전개',
      description: '비전 방패로 적을 밀쳐내고 자신에게 두터운 마력 보호막을 부여합니다.',
      skillType: 'SELF_SHIELD_SLASH',
      baseValueByStar: [185, 295, 480],
      secondaryValueByStar: [250, 390, 620],
      manaLockMs: 950,
    },
  },
  u1_snatch: {
    id: 'u1_snatch',
    name: '고블린 투창병 스내치',
    cost: 1,
    traits: ['GOLDEN_GOBLIN', 'RANGER'],
    icon: '🎯',
    stats: {
      hp: 570,
      atk: 62,
      def: 22,
      atkSpeed: 0.76,
      range: 3,
      startMana: 15,
      maxMana: 60,
    },
    skill: {
      name: '독침 투창',
      description: '예리한 투창을 던져 기본 피해와 대상 현재 체력 비례 추가 피해를 입힙니다.',
      skillType: 'CURRENT_HP_ARROW',
      baseValueByStar: [220, 350, 560],
      secondaryValueByStar: [0.14, 0.2, 0.3],
      manaLockMs: 750,
    },
  },
  u1_shieldmaiden: {
    id: 'u1_shieldmaiden',
    name: '황혼의 도끼병 프레이',
    cost: 1,
    traits: ['HOLY_EMPIRE', 'BERSERKER', 'VANGUARD'],
    icon: '🪓',
    stats: {
      hp: 630,
      atk: 59,
      def: 34,
      atkSpeed: 0.66,
      range: 1,
      startMana: 20,
      maxMana: 75,
    },
    skill: {
      name: '전장의 함성 베기',
      description: '전투 도끼로 대상을 내려찍고 인접 적들에게 충격파 피해를 입힙니다.',
      skillType: 'THORN_SMASH',
      baseValueByStar: [235, 365, 590],
      secondaryValueByStar: [95, 155, 270],
      manaLockMs: 850,
    },
  },
  u1_ember: {
    id: 'u1_ember',
    name: '심연 방패병 모르그',
    cost: 1,
    traits: ['ABYSSAL_DEMON', 'VANGUARD', 'UNDEAD_SCOURGE'],
    icon: '🔥',
    stats: {
      hp: 670,
      atk: 51,
      def: 42,
      atkSpeed: 0.58,
      range: 1,
      startMana: 30,
      maxMana: 85,
    },
    skill: {
      name: '흑요석 갑옷',
      description: '전방에 화염을 뿜어 마법 피해를 입히고 자신의 방어력을 강화합니다.',
      skillType: 'DRAGON_BREATH_ARMOR',
      baseValueByStar: [210, 330, 530],
      secondaryValueByStar: [1.6, 1.7, 1.9],
      manaLockMs: 1000,
    },
  },

  // --------------------------------------------------------------------------
  // 2코스트 (13종)
  // --------------------------------------------------------------------------
  u2_tink: {
    id: 'u2_tink',
    name: '고블린 연금술사 팅크',
    cost: 2,
    traits: ['GOLDEN_GOBLIN', 'ARCANE_TOWER', 'ARCHMAGE'],
    icon: '🧪',
    stats: {
      hp: 580,
      atk: 45,
      def: 25,
      atkSpeed: 0.65,
      range: 3,
      startMana: 30,
      maxMana: 80,
    },
    skill: {
      name: '부식성 산성 폭탄',
      description: '적 무리에 산성 폭탄을 투척하여 주변 1칸 광역 마법 피해를 입히고 방어력을 40% 파쇄합니다.',
      skillType: 'ACID_BOMB_SHRED',
      baseValueByStar: [240, 380, 620],
      secondaryValueByStar: [0.4, 0.4, 0.4],
      manaLockMs: 1000,
    },
  },
  u2_jeanne: {
    id: 'u2_jeanne',
    name: '성전사 잔느',
    cost: 2,
    traits: ['HOLY_EMPIRE', 'PALADIN', 'VANGUARD'],
    icon: '⚜️',
    stats: {
      hp: 780,
      atk: 55,
      def: 45,
      atkSpeed: 0.6,
      range: 1,
      startMana: 40,
      maxMana: 90,
    },
    skill: {
      name: '성녀의 방패 강타',
      description: '방패로 대상을 내려쳐 마법 피해와 함께 1.5초간 기절시키고, 체력이 가장 낮은 아군을 치유합니다.',
      skillType: 'SHIELD_BASH_HEAL',
      baseValueByStar: [220, 340, 560],
      secondaryValueByStar: [260, 420, 700],
      manaLockMs: 1000,
    },
  },
  u2_kyle: {
    id: 'u2_kyle',
    name: '심연의 사냥꾼 카일',
    cost: 2,
    traits: ['ABYSSAL_DEMON', 'RANGER'],
    icon: '🏹',
    stats: {
      hp: 560,
      atk: 64,
      def: 20,
      atkSpeed: 0.78,
      range: 4,
      startMana: 15,
      maxMana: 70,
    },
    skill: {
      name: '심연의 파멸 화살',
      description: '악마의 마력이 깃든 화살을 쏘아 기본 피해와 대상 현재 체력 비례 추가 피해를 입힙니다.',
      skillType: 'CURRENT_HP_ARROW',
      baseValueByStar: [260, 410, 680],
      secondaryValueByStar: [0.18, 0.25, 0.38],
      manaLockMs: 750,
    },
  },
  u2_ent: {
    id: 'u2_ent',
    name: '숲의 수호신 엔트',
    cost: 2,
    traits: ['ELVEN_SYLVAN', 'VANGUARD', 'PALADIN'],
    icon: '🌳',
    stats: {
      hp: 850,
      atk: 52,
      def: 50,
      atkSpeed: 0.55,
      range: 1,
      startMana: 40,
      maxMana: 100,
    },
    skill: {
      name: '대자연의 뿌리 감옥',
      description: '대지의 뿌리로 주변 적들을 1.2초간 묶어 피해를 입히고 자신의 체력을 대량 회복합니다.',
      skillType: 'ROOT_AND_REGEN',
      baseValueByStar: [200, 320, 520],
      secondaryValueByStar: [340, 540, 900],
      manaLockMs: 1100,
    },
  },
  u2_zed: {
    id: 'u2_zed',
    name: '그림자 칼날 제드',
    cost: 2,
    traits: ['UNDEAD_SCOURGE', 'SHADOW_ASSASSIN'],
    icon: '🥷',
    stats: {
      hp: 600,
      atk: 68,
      def: 25,
      atkSpeed: 0.8,
      range: 1,
      startMana: 20,
      maxMana: 65,
    },
    skill: {
      name: '사망 표식 베기',
      description: '적진의 핵심 원거리 딜러 뒤로 그림자 이동하여 치명타가 확정 적용되는 암살 베기를 가합니다.',
      skillType: 'BACKLINE_CRIT_SLASH',
      baseValueByStar: [310, 480, 790],
      manaLockMs: 750,
    },
  },
  u2_zephyr: {
    id: 'u2_zephyr',
    name: '심연 암살자 제피르',
    cost: 2,
    traits: ['ABYSSAL_DEMON', 'SHADOW_ASSASSIN'],
    icon: '🗡️',
    stats: {
      hp: 590,
      atk: 66,
      def: 24,
      atkSpeed: 0.78,
      range: 1,
      startMana: 20,
      maxMana: 65,
    },
    skill: {
      name: '황혼의 그림자 습격',
      description: '적 후방 딜러의 등 뒤로 이동해 악마의 쌍단검으로 치명타 일격을 가합니다.',
      skillType: 'BACKLINE_CRIT_SLASH',
      baseValueByStar: [300, 470, 770],
      manaLockMs: 750,
    },
  },
  u2_elowen: {
    id: 'u2_elowen',
    name: '숲의 무녀 엘로웬',
    cost: 2,
    traits: ['ELVEN_SYLVAN', 'PALADIN'],
    icon: '🌸',
    stats: {
      hp: 650,
      atk: 50,
      def: 30,
      atkSpeed: 0.68,
      range: 3,
      startMana: 35,
      maxMana: 85,
    },
    skill: {
      name: '요정의 치유 물결',
      description: '자연의 지팡이로 적을 기절시키고 가장 체력이 낮은 아군을 대폭 치유합니다.',
      skillType: 'SHIELD_BASH_HEAL',
      baseValueByStar: [210, 330, 540],
      secondaryValueByStar: [290, 460, 760],
      manaLockMs: 950,
    },
  },
  u2_boulder: {
    id: 'u2_boulder',
    name: '룬 거석병 볼더',
    cost: 2,
    traits: ['ARCANE_TOWER', 'VANGUARD'],
    icon: '🗿',
    stats: {
      hp: 860,
      atk: 54,
      def: 52,
      atkSpeed: 0.55,
      range: 1,
      startMana: 40,
      maxMana: 95,
    },
    skill: {
      name: '화강암 과부하',
      description: '주변 적들을 지진으로 속박하고 마력 핵으로 자신의 체력을 회복합니다.',
      skillType: 'ROOT_AND_REGEN',
      baseValueByStar: [210, 330, 540],
      secondaryValueByStar: [320, 520, 860],
      manaLockMs: 1050,
    },
  },
  u2_boom: {
    id: 'u2_boom',
    name: '고블린 폭격수 붐',
    cost: 2,
    traits: ['GOLDEN_GOBLIN', 'RANGER'],
    icon: '💣',
    stats: {
      hp: 670,
      atk: 72,
      def: 26,
      atkSpeed: 0.76,
      range: 3,
      startMana: 25,
      maxMana: 70,
    },
    skill: {
      name: '도화선 연쇄 폭탄',
      description: '적 밀집 지역에 폭탄을 던져 광역 마법 피해와 함께 방어력을 35% 감소시킵니다.',
      skillType: 'ACID_BOMB_SHRED',
      baseValueByStar: [255, 395, 650],
      secondaryValueByStar: [0.35, 0.35, 0.35],
      manaLockMs: 900,
    },
  },
  u2_vayne: {
    id: 'u2_vayne',
    name: '제국 석궁병 베인',
    cost: 2,
    traits: ['HOLY_EMPIRE', 'RANGER'],
    icon: '🏹',
    stats: {
      hp: 560,
      atk: 65,
      def: 22,
      atkSpeed: 0.78,
      range: 4,
      startMana: 15,
      maxMana: 65,
    },
    skill: {
      name: '은화살 3연사',
      description: '성스러운 은화살 3발을 연속 발사하여 대상의 방어를 꿰뚫는 피해를 입힙니다.',
      skillType: 'TRIPLE_SNIPE',
      baseValueByStar: [295, 460, 750],
      manaLockMs: 700,
    },
  },
  u2_pyre: {
    id: 'u2_pyre',
    name: '화염 비늘 전사 파이어',
    cost: 2,
    traits: ['DRAGONKIN', 'BERSERKER'],
    icon: '🔥',
    stats: {
      hp: 850,
      atk: 74,
      def: 42,
      atkSpeed: 0.72,
      range: 1,
      startMana: 25,
      maxMana: 70,
    },
    skill: {
      name: '용염 대검 내려찍기',
      description: '타오르는 대검으로 대상을 강타하고 주변 적에게 화염 충격파를 퍼뜨립니다.',
      skillType: 'THORN_SMASH',
      baseValueByStar: [260, 410, 670],
      secondaryValueByStar: [120, 190, 320],
      manaLockMs: 850,
    },
  },
  u2_boneknight: {
    id: 'u2_boneknight',
    name: '망자 기병 데스나이트',
    cost: 2,
    traits: ['UNDEAD_SCOURGE', 'VANGUARD', 'BERSERKER'],
    icon: '💀',
    stats: {
      hp: 820,
      atk: 56,
      def: 48,
      atkSpeed: 0.6,
      range: 1,
      startMana: 30,
      maxMana: 85,
    },
    skill: {
      name: '망자의 방패 돌격',
      description: '주변 적을 베어 넘기고 자신에게 망자의 영혼 보호막을 씌웁니다.',
      skillType: 'SELF_SHIELD_SLASH',
      baseValueByStar: [230, 360, 580],
      secondaryValueByStar: [280, 440, 720],
      manaLockMs: 950,
    },
  },
  u2_malice: {
    id: 'u2_malice',
    name: '심연 흑마법사 말리스',
    cost: 2,
    traits: ['ABYSSAL_DEMON', 'ARCHMAGE'],
    icon: '🔮',
    stats: {
      hp: 590,
      atk: 48,
      def: 22,
      atkSpeed: 0.68,
      range: 4,
      startMana: 25,
      maxMana: 75,
    },
    skill: {
      name: '생명력 착취 사슬',
      description: '가까운 적 3명의 생명력을 흡수하여 마법 피해를 입히고 자신의 체력을 회복합니다.',
      skillType: 'BLOOD_DRAIN_TRIO',
      baseValueByStar: [210, 330, 540],
      manaLockMs: 900,
    },
  },

  // --------------------------------------------------------------------------
  // 3코스트 (13종)
  // --------------------------------------------------------------------------
  u3_grom: {
    id: 'u3_grom',
    name: '고블린 용병대장 그롬',
    cost: 3,
    traits: ['GOLDEN_GOBLIN', 'BERSERKER'],
    icon: '🪓',
    stats: {
      hp: 980,
      atk: 82,
      def: 44,
      atkSpeed: 0.74,
      range: 1,
      startMana: 30,
      maxMana: 80,
    },
    skill: {
      name: '황금욕의 대지분쇄',
      description: '거대한 도끼로 전방을 내려찍어 광역 물리 피해를 입힙니다. 보유 골드 10골드당 스킬 피해량이 15%씩 추가 증가합니다!',
      skillType: 'GOLD_SCALING_CLEAVE',
      baseValueByStar: [350, 560, 950],
      secondaryValueByStar: [0.15, 0.15, 0.15],
      manaLockMs: 950,
    },
  },
  u3_sieg: {
    id: 'u3_sieg',
    name: '드래곤 나이트 지크',
    cost: 3,
    traits: ['DRAGONKIN', 'VANGUARD'],
    icon: '🐲',
    stats: {
      hp: 1100,
      atk: 74,
      def: 65,
      atkSpeed: 0.65,
      range: 1,
      startMana: 40,
      maxMana: 90,
    },
    skill: {
      name: '용린의 화염 방패',
      description: '전방 부채꼴 범위에 화염을 방사하여 마법 피해를 입히고 5초간 자신의 방어력을 2배로 증가시킵니다.',
      skillType: 'DRAGON_BREATH_ARMOR',
      baseValueByStar: [290, 450, 760],
      secondaryValueByStar: [2.0, 2.0, 2.0],
      manaLockMs: 1000,
    },
  },
  u3_sylphie: {
    id: 'u3_sylphie',
    name: '엘프 바람술사 실피',
    cost: 3,
    traits: ['ELVEN_SYLVAN', 'ARCHMAGE'],
    icon: '🌪️',
    stats: {
      hp: 660,
      atk: 52,
      def: 25,
      atkSpeed: 0.72,
      range: 4,
      startMana: 30,
      maxMana: 85,
    },
    skill: {
      name: '폭풍의 회오리',
      description: '적이 가장 밀집한 지역에 거대한 회오리바람을 일으켜 광역 마법 피해와 함께 1초간 에어본(기절)시킵니다.',
      skillType: 'TORNADO_KNOCKUP',
      baseValueByStar: [310, 490, 840],
      manaLockMs: 1000,
    },
  },
  u3_vlad: {
    id: 'u3_vlad',
    name: '블러드 로드 블라드',
    cost: 3,
    traits: ['ABYSSAL_DEMON', 'ARCANE_TOWER'],
    icon: '🩸',
    stats: {
      hp: 820,
      atk: 58,
      def: 38,
      atkSpeed: 0.68,
      range: 2,
      startMana: 25,
      maxMana: 75,
    },
    skill: {
      name: '선혈의 향연',
      description: '가장 가까운 적 3명의 생명력을 흡수하여 마법 피해를 입히고, 입힌 피해의 100%만큼 자신의 체력을 회복합니다.',
      skillType: 'BLOOD_DRAIN_TRIO',
      baseValueByStar: [250, 390, 680],
      manaLockMs: 900,
    },
  },
  u3_drake: {
    id: 'u3_drake',
    name: '적염의 용기병 드레이크',
    cost: 3,
    traits: ['DRAGONKIN', 'BERSERKER', 'VANGUARD'],
    icon: '🔱',
    stats: {
      hp: 1020,
      atk: 85,
      def: 48,
      atkSpeed: 0.74,
      range: 1,
      startMana: 30,
      maxMana: 75,
    },
    skill: {
      name: '홍련의 창격',
      description: '붉은 용창으로 대상을 꿰뚫고 인접 적들에게 용염 폭발 피해를 입힙니다.',
      skillType: 'THORN_SMASH',
      baseValueByStar: [360, 560, 950],
      secondaryValueByStar: [180, 290, 500],
      manaLockMs: 900,
    },
  },
  u3_leona: {
    id: 'u3_leona',
    name: '태양의 성기사 레오나',
    cost: 3,
    traits: ['HOLY_EMPIRE', 'VANGUARD', 'PALADIN'],
    icon: '☀️',
    stats: {
      hp: 1020,
      atk: 62,
      def: 65,
      atkSpeed: 0.6,
      range: 1,
      startMana: 45,
      maxMana: 95,
    },
    skill: {
      name: '태양빛 철벽 방패',
      description: '태양의 방패로 주변 적을 강타하고 4초간 거대한 성광 보호막을 얻습니다.',
      skillType: 'SELF_SHIELD_SLASH',
      baseValueByStar: [280, 440, 740],
      secondaryValueByStar: [420, 680, 1150],
      manaLockMs: 1000,
    },
  },
  u3_kazu: {
    id: 'u3_kazu',
    name: '환영의 검객 카즈',
    cost: 3,
    traits: ['ELVEN_SYLVAN', 'SHADOW_ASSASSIN', 'BERSERKER'],
    icon: '🗡️',
    stats: {
      hp: 760,
      atk: 88,
      def: 32,
      atkSpeed: 0.86,
      range: 1,
      startMana: 20,
      maxMana: 60,
    },
    skill: {
      name: '초승달 섬광 베기',
      description: '적 후방 핵심 딜러에게 순간이동하여 치명타 확정 일격을 날립니다.',
      skillType: 'BACKLINE_CRIT_SLASH',
      baseValueByStar: [410, 630, 1050],
      manaLockMs: 750,
    },
  },
  u3_malakor: {
    id: 'u3_malakor',
    name: '영혼 수확자 말라코르',
    cost: 3,
    traits: ['UNDEAD_SCOURGE', 'ARCHMAGE'],
    icon: '💀',
    stats: {
      hp: 750,
      atk: 56,
      def: 32,
      atkSpeed: 0.7,
      range: 3,
      startMana: 30,
      maxMana: 80,
    },
    skill: {
      name: '망자의 영혼 흡수',
      description: '가장 가까운 적 3명의 영혼을 수확해 마법 피해를 입히고 체력을 흡수합니다.',
      skillType: 'BLOOD_DRAIN_TRIO',
      baseValueByStar: [265, 415, 710],
      manaLockMs: 900,
    },
  },
  u3_seraphina: {
    id: 'u3_seraphina',
    name: '빛의 사제 세라피나',
    cost: 3,
    traits: ['HOLY_EMPIRE', 'ARCANE_TOWER', 'PALADIN'],
    icon: '✨',
    stats: {
      hp: 720,
      atk: 54,
      def: 32,
      atkSpeed: 0.7,
      range: 4,
      startMana: 35,
      maxMana: 85,
    },
    skill: {
      name: '성스러운 심판의 빛',
      description: '적을 빛의 기둥으로 기절시키고 가장 위급한 아군의 생명력을 대폭 치유합니다.',
      skillType: 'SHIELD_BASH_HEAL',
      baseValueByStar: [290, 460, 780],
      secondaryValueByStar: [380, 620, 1050],
      manaLockMs: 950,
    },
  },
  u3_grizzle: {
    id: 'u3_grizzle',
    name: '고블린 중장갑차 그리즐',
    cost: 3,
    traits: ['GOLDEN_GOBLIN', 'VANGUARD'],
    icon: '⚙️',
    stats: {
      hp: 1080,
      atk: 76,
      def: 64,
      atkSpeed: 0.65,
      range: 1,
      startMana: 40,
      maxMana: 85,
    },
    skill: {
      name: '증기기관 돌격포',
      description: '전방에 고열 증기를 뿜어 마법 피해를 입히고 방어력을 2배로 강화합니다.',
      skillType: 'DRAGON_BREATH_ARMOR',
      baseValueByStar: [285, 445, 750],
      secondaryValueByStar: [2.0, 2.0, 2.1],
      manaLockMs: 1000,
    },
  },
  u3_orion: {
    id: 'u3_orion',
    name: '별자리 명궁 오리온',
    cost: 3,
    traits: ['ARCANE_TOWER', 'RANGER', 'ARCHMAGE'],
    icon: '🌠',
    stats: {
      hp: 680,
      atk: 74,
      def: 26,
      atkSpeed: 0.8,
      range: 4,
      startMana: 20,
      maxMana: 70,
    },
    skill: {
      name: '성운 관통 화살',
      description: '별빛이 깃든 화살로 기본 물리 피해와 대상 현재 체력 비례 추가 피해를 입힙니다.',
      skillType: 'CURRENT_HP_ARROW',
      baseValueByStar: [320, 510, 860],
      secondaryValueByStar: [0.22, 0.3, 0.45],
      manaLockMs: 750,
    },
  },
  u3_nyx: {
    id: 'u3_nyx',
    name: '심연의 밤마녀 닉스',
    cost: 3,
    traits: ['ABYSSAL_DEMON', 'SHADOW_ASSASSIN', 'ARCHMAGE'],
    icon: '🌙',
    stats: {
      hp: 700,
      atk: 80,
      def: 28,
      atkSpeed: 0.82,
      range: 1,
      startMana: 25,
      maxMana: 70,
    },
    skill: {
      name: '악몽의 급습',
      description: '적 후방으로 도약해 급소를 찌르고 처치 시 35% 확률로 1골드를 약탈합니다.',
      skillType: 'ASSASSIN_GOLD_STRIKE',
      baseValueByStar: [350, 550, 920],
      secondaryValueByStar: [0.35, 0.35, 0.4],
      manaLockMs: 800,
    },
  },
  u3_fenrir: {
    id: 'u3_fenrir',
    name: '서리송곳니 광전사 펜리르',
    cost: 3,
    traits: ['UNDEAD_SCOURGE', 'BERSERKER'],
    icon: '🐺',
    stats: {
      hp: 890,
      atk: 78,
      def: 42,
      atkSpeed: 0.75,
      range: 1,
      startMana: 30,
      maxMana: 80,
    },
    skill: {
      name: '혹한의 포효 강타',
      description: '주변 적들을 얼음 뿌리로 속박하고 자신의 잃은 체력을 대량 회복합니다.',
      skillType: 'ROOT_AND_REGEN',
      baseValueByStar: [270, 430, 720],
      secondaryValueByStar: [390, 620, 1050],
      manaLockMs: 950,
    },
  },

  // --------------------------------------------------------------------------
  // 4코스트 (12종 - 덱의 메인 캐리 및 메인 탱커)
  // --------------------------------------------------------------------------
  u4_arthur: {
    id: 'u4_arthur',
    name: '성검의 집행자 아서',
    cost: 4,
    traits: ['HOLY_EMPIRE', 'BERSERKER', 'PALADIN'],
    icon: '⚔️',
    stats: {
      hp: 1150,
      atk: 88,
      def: 65,
      atkSpeed: 0.75,
      range: 1,
      startMana: 40,
      maxMana: 90,
    },
    skill: {
      name: '성검 엑스칼리버 강림',
      description:
        '하늘에서 거대한 성검 엑스칼리버를 내리꽂아 대상과 주변 적들에게 막대한 물리 피해를 입히고 아군 전체에게 신성 보호막을 부여합니다.',
      skillType: 'EXCALIBUR_TEAM_SHIELD',
      baseValueByStar: [480, 760, 1850],
      secondaryValueByStar: [240, 380, 900],
      manaLockMs: 1000,
    },
  },
  u4_merlin: {
    id: 'u4_merlin',
    name: '대마도사 멀린',
    cost: 4,
    traits: ['ARCANE_TOWER', 'ARCHMAGE'],
    icon: '☄️',
    stats: {
      hp: 820,
      atk: 60,
      def: 30,
      atkSpeed: 0.75,
      range: 4,
      startMana: 30,
      maxMana: 85,
    },
    skill: {
      name: '메테오 스웜',
      description: '전장에 불타는 운석 5발을 연속으로 떨어뜨려 적 진영을 광역 마법 피해로 초토화합니다.',
      skillType: 'METEOR_SWARM',
      baseValueByStar: [460, 740, 1950],
      manaLockMs: 1100,
    },
  },
  u4_thanatos: {
    id: 'u4_thanatos',
    name: '칠흑의 사신 타나토스',
    cost: 4,
    traits: ['UNDEAD_SCOURGE', 'SHADOW_ASSASSIN'],
    icon: '⚰️',
    stats: {
      hp: 900,
      atk: 95,
      def: 40,
      atkSpeed: 0.85,
      range: 1,
      startMana: 30,
      maxMana: 70,
    },
    skill: {
      name: '사신의 연쇄 처형',
      description:
        '체력이 가장 낮은 적의 등 뒤로 이동해 치명적인 사신의 낫으로 처형합니다. 적 처치 성공 시 즉시 마나를 100% 회복하여 연쇄 암살을 발동합니다!',
      skillType: 'EXECUTE_RESET',
      baseValueByStar: [520, 820, 2100],
      manaLockMs: 650,
    },
  },
  u4_sylph: {
    id: 'u4_sylph',
    name: '신궁 여왕 실바나',
    cost: 4,
    traits: ['ELVEN_SYLVAN', 'RANGER'],
    icon: '🏹',
    stats: {
      hp: 850,
      atk: 92,
      def: 32,
      atkSpeed: 0.86,
      range: 4,
      startMana: 20,
      maxMana: 70,
    },
    skill: {
      name: '달빛 폭풍 연사',
      description: '달빛 마력이 응축된 신성 화살 3발을 초고속 연사하여 대상을 꿰뚫습니다.',
      skillType: 'TRIPLE_SNIPE',
      baseValueByStar: [510, 810, 2050],
      manaLockMs: 700,
    },
  },
  u4_astaroth: {
    id: 'u4_astaroth',
    name: '심연의 대공 아스타로트',
    cost: 4,
    traits: ['ABYSSAL_DEMON', 'BERSERKER'],
    icon: '😈',
    stats: {
      hp: 1180,
      atk: 94,
      def: 60,
      atkSpeed: 0.78,
      range: 1,
      startMana: 35,
      maxMana: 85,
    },
    skill: {
      name: '지옥참마도 강림',
      description: '지옥의 대검으로 적 진영을 가르고 아군 전체에게 피의 보호막을 부여합니다.',
      skillType: 'EXCALIBUR_TEAM_SHIELD',
      baseValueByStar: [490, 780, 1920],
      secondaryValueByStar: [220, 350, 850],
      manaLockMs: 950,
    },
  },
  u4_velkora: {
    id: 'u4_velkora',
    name: '공허의 여제 벨코라',
    cost: 4,
    traits: ['ABYSSAL_DEMON', 'ARCANE_TOWER', 'ARCHMAGE'],
    icon: '🔮',
    stats: {
      hp: 840,
      atk: 62,
      def: 32,
      atkSpeed: 0.76,
      range: 4,
      startMana: 30,
      maxMana: 85,
    },
    skill: {
      name: '심연의 유성우',
      description: '공허의 균열을 열어 적 진영에 5발의 암흑 운석을 연속 투하합니다.',
      skillType: 'METEOR_SWARM',
      baseValueByStar: [470, 750, 1980],
      manaLockMs: 1050,
    },
  },
  u4_valkyrie: {
    id: 'u4_valkyrie',
    name: '천상의 발키리 브륜힐드',
    cost: 4,
    traits: ['HOLY_EMPIRE', 'PALADIN', 'RANGER'],
    icon: '🪽',
    stats: {
      hp: 1120,
      atk: 84,
      def: 62,
      atkSpeed: 0.76,
      range: 1,
      startMana: 35,
      maxMana: 85,
    },
    skill: {
      name: '발할라의 천공창',
      description: '하늘에서 빛의 창을 내리꽂아 광역 물리 피해를 입히고 아군 전체에게 보호막을 내립니다.',
      skillType: 'EXCALIBUR_TEAM_SHIELD',
      baseValueByStar: [460, 740, 1800],
      secondaryValueByStar: [280, 440, 1050],
      manaLockMs: 950,
    },
  },
  u4_fafnir: {
    id: 'u4_fafnir',
    name: '황금 갑주룡 파프니르',
    cost: 4,
    traits: ['DRAGONKIN', 'GOLDEN_GOBLIN', 'VANGUARD'],
    icon: '🐉',
    stats: {
      hp: 1280,
      atk: 80,
      def: 75,
      atkSpeed: 0.65,
      range: 1,
      startMana: 40,
      maxMana: 95,
    },
    skill: {
      name: '용황의 불멸 비늘',
      description: '황금 화염 브레스로 전방을 휩쓸고 자신의 방어력을 2.5배로 증폭시킵니다.',
      skillType: 'DRAGON_BREATH_ARMOR',
      baseValueByStar: [450, 720, 1850],
      secondaryValueByStar: [2.5, 2.5, 3.0],
      manaLockMs: 1000,
    },
  },
  u4_lichking: {
    id: 'u4_lichking',
    name: '절대영도 리치왕 칼드로스',
    cost: 4,
    traits: ['UNDEAD_SCOURGE', 'ARCANE_TOWER', 'ARCHMAGE'],
    icon: '❄️',
    stats: {
      hp: 920,
      atk: 64,
      def: 38,
      atkSpeed: 0.74,
      range: 3,
      startMana: 30,
      maxMana: 85,
    },
    skill: {
      name: '칠흑의 눈보라 폭풍',
      description: '적 밀집 지역에 죽음의 눈보라 회오리를 소환해 광역 마법 피해와 기절을 부여합니다.',
      skillType: 'TORNADO_KNOCKUP',
      baseValueByStar: [480, 770, 1980],
      manaLockMs: 1000,
    },
  },
  u4_midas: {
    id: 'u4_midas',
    name: '황금 연금술사 미다스',
    cost: 4,
    traits: ['GOLDEN_GOBLIN', 'ARCHMAGE', 'ARCANE_TOWER'],
    icon: '🪙',
    stats: {
      hp: 940,
      atk: 78,
      def: 42,
      atkSpeed: 0.76,
      range: 3,
      startMana: 30,
      maxMana: 80,
    },
    skill: {
      name: '황금 연성 대폭발',
      description: '보유 골드에 비례해 증폭되는 황금 파동을 터뜨려 주변 적들을 분쇄합니다.',
      skillType: 'GOLD_SCALING_CLEAVE',
      baseValueByStar: [470, 750, 1900],
      secondaryValueByStar: [0.18, 0.18, 0.22],
      manaLockMs: 900,
    },
  },
  u4_artemis: {
    id: 'u4_artemis',
    name: '용사냥꾼 아르테미스',
    cost: 4,
    traits: ['DRAGONKIN', 'RANGER', 'BERSERKER'],
    icon: '🏹',
    stats: {
      hp: 860,
      atk: 94,
      def: 34,
      atkSpeed: 0.85,
      range: 4,
      startMana: 20,
      maxMana: 70,
    },
    skill: {
      name: '멸룡의 성흔 화살',
      description: '거대 괴수를 꿰뚫는 화살로 강력한 기본 피해와 현재 체력 비례 추가 피해를 입힙니다.',
      skillType: 'CURRENT_HP_ARROW',
      baseValueByStar: [460, 740, 1880],
      secondaryValueByStar: [0.28, 0.38, 0.65],
      manaLockMs: 750,
    },
  },
  u4_diablo: {
    id: 'u4_diablo',
    name: '숲의 고대수호자 오베론',
    cost: 4,
    traits: ['ELVEN_SYLVAN', 'VANGUARD', 'PALADIN'],
    icon: '🦌',
    stats: {
      hp: 1240,
      atk: 76,
      def: 70,
      atkSpeed: 0.65,
      range: 1,
      startMana: 40,
      maxMana: 95,
    },
    skill: {
      name: '세계수의 심판 뿌리',
      description: '주변 적들을 세계수의 뿌리로 구속하고 자신의 체력을 대폭 회복합니다.',
      skillType: 'ROOT_AND_REGEN',
      baseValueByStar: [420, 680, 1750],
      secondaryValueByStar: [580, 940, 2400],
      manaLockMs: 1050,
    },
  },

  // --------------------------------------------------------------------------
  // 5코스트 (8종 - 전설 기물, 기물당 풀 9개, 3성 달성 시 계수 20배 폭증 보드 전체 즉사급)
  // --------------------------------------------------------------------------
  u5_ignis: {
    id: 'u5_ignis',
    name: '고대 종말룡 이그니스',
    cost: 5,
    traits: ['DRAGONKIN', 'ABYSSAL_DEMON', 'BERSERKER'],
    icon: '🔥',
    stats: {
      hp: 1450,
      atk: 105,
      def: 75,
      atkSpeed: 0.8,
      range: 3,
      startMana: 50,
      maxMana: 100,
    },
    skill: {
      name: '종말의 지옥불 브레스',
      description:
        '공중으로 날아올라 적 보드 전체(8x7)에 지옥불 브레스를 퍼부어 모든 적에게 궤멸적인 피해와 2초 기절을 선사합니다. (3성 달성 시: 99,999 피해로 적 전체 즉사!)',
      skillType: 'APOCALYPSE_BREATH',
      baseValueByStar: [550, 980, 99999],
      manaLockMs: 1200,
    },
  },
  u5_goldtooth: {
    id: 'u5_goldtooth',
    name: '황금 고블린 왕 골드투스',
    cost: 5,
    traits: ['GOLDEN_GOBLIN', 'PALADIN', 'VANGUARD'],
    icon: '👑',
    stats: {
      hp: 1380,
      atk: 98,
      def: 70,
      atkSpeed: 0.82,
      range: 2,
      startMana: 45,
      maxMana: 90,
    },
    skill: {
      name: '황금 제국의 금고 폭격',
      description:
        '하늘에서 거대한 황금 금고 폭격을 내려 적 전체를 기절시키고, 전투마다 골드와 보물을 생성합니다. (3성 달성 시: 전투 시작과 동시에 적 전체 99,999 피해 및 매 라운드 50골드 지급!)',
      skillType: 'GOLDEN_VAULT_BOMBARD',
      baseValueByStar: [480, 880, 99999],
      secondaryValueByStar: [3, 6, 50],
      manaLockMs: 1100,
    },
  },
  u5_luciel: {
    id: 'u5_luciel',
    name: '타락한 대천사 루시엘',
    cost: 5,
    traits: ['HOLY_EMPIRE', 'UNDEAD_SCOURGE', 'RANGER'],
    icon: '👼',
    stats: {
      hp: 1200,
      atk: 115,
      def: 50,
      atkSpeed: 0.92,
      range: 4,
      startMana: 40,
      maxMana: 85,
    },
    skill: {
      name: '빛과 어둠의 심판 난사',
      description:
        '빛과 어둠의 쌍권총으로 전장의 모든 적에게 동시에 심판의 탄환을 난사합니다. (3성 달성 시: 타겟당 50,000 피해로 전장 즉각 정화!)',
      skillType: 'JUDGMENT_BARRAGE',
      baseValueByStar: [460, 840, 50000],
      manaLockMs: 950,
    },
  },
  u5_michael: {
    id: 'u5_michael',
    name: '천군 총사령관 미카엘',
    cost: 5,
    traits: ['HOLY_EMPIRE', 'PALADIN', 'VANGUARD'],
    icon: '⚔️',
    stats: {
      hp: 1520,
      atk: 108,
      def: 85,
      atkSpeed: 0.85,
      range: 1,
      startMana: 45,
      maxMana: 95,
    },
    skill: {
      name: '천상의 성검 대강림',
      description:
        '천상의 빛으로 적 전체를 심판하고 아군 전체에게 불멸의 성광 보호막을 내립니다. (3성 달성 시: 99,999 신성 피해로 전장 정화!)',
      skillType: 'APOCALYPSE_BREATH',
      baseValueByStar: [540, 960, 99999],
      manaLockMs: 1100,
    },
  },
  u5_bahamut: {
    id: 'u5_bahamut',
    name: '성운의 창세룡 바하무트',
    cost: 5,
    traits: ['DRAGONKIN', 'ARCANE_TOWER', 'ARCHMAGE'],
    icon: '🌌',
    stats: {
      hp: 1420,
      atk: 100,
      def: 72,
      atkSpeed: 0.84,
      range: 4,
      startMana: 45,
      maxMana: 95,
    },
    skill: {
      name: '기가 플레어 노바',
      description:
        '우주의 에너지를 응축한 창세의 브레스로 적 진영 전체를 초토화합니다. (3성 달성 시: 99,999 피해로 적 전체 소멸!)',
      skillType: 'APOCALYPSE_BREATH',
      baseValueByStar: [560, 990, 99999],
      manaLockMs: 1150,
    },
  },
  u5_chronos: {
    id: 'u5_chronos',
    name: '시간의 지배자 크로노스',
    cost: 5,
    traits: ['ARCANE_TOWER', 'ARCHMAGE', 'UNDEAD_SCOURGE'],
    icon: '⏳',
    stats: {
      hp: 1260,
      atk: 96,
      def: 55,
      atkSpeed: 0.88,
      range: 4,
      startMana: 40,
      maxMana: 85,
    },
    skill: {
      name: '시공간 붕괴 폭격',
      description:
        '시간의 톱니바퀴를 역전시켜 전장의 모든 적에게 시공간 붕괴 마법 탄환을 퍼붓습니다. (3성 달성 시: 50,000 고정+물리 피해!)',
      skillType: 'JUDGMENT_BARRAGE',
      baseValueByStar: [490, 890, 50000],
      manaLockMs: 950,
    },
  },
  u5_lilith: {
    id: 'u5_lilith',
    name: '심연의 여왕 릴리스',
    cost: 5,
    traits: ['ABYSSAL_DEMON', 'SHADOW_ASSASSIN', 'BERSERKER'],
    icon: '🩸',
    stats: {
      hp: 1320,
      atk: 122,
      def: 58,
      atkSpeed: 0.95,
      range: 1,
      startMana: 30,
      maxMana: 70,
    },
    skill: {
      name: '피의 여왕 연쇄 학살',
      description:
        '가장 약한 적을 처형하고 처치 시 즉시 마나를 100% 회복하여 적 전체를 도륙합니다. (3성 달성 시: 99,999 피해로 연쇄 즉사!)',
      skillType: 'EXECUTE_RESET',
      baseValueByStar: [680, 1180, 99999],
      manaLockMs: 550,
    },
  },
  u5_yggdrasil: {
    id: 'u5_yggdrasil',
    name: '세계수의 화신 이그드라실',
    cost: 5,
    traits: ['ELVEN_SYLVAN', 'VANGUARD', 'PALADIN'],
    icon: '🌳',
    stats: {
      hp: 1650,
      atk: 102,
      def: 90,
      atkSpeed: 0.78,
      range: 2,
      startMana: 45,
      maxMana: 95,
    },
    skill: {
      name: '대자연의 천지개벽',
      description:
        '세계수의 생명으로 아군 전체에 거대한 보호막을 두르고 적 전체를 뿌리 폭풍으로 짓뭉갭니다. (3성 달성 시: 99,999 피해!)',
      skillType: 'EXCALIBUR_TEAM_SHIELD',
      baseValueByStar: [580, 1020, 99999],
      secondaryValueByStar: [420, 750, 9999],
      manaLockMs: 1100,
    },
  },
};

export const ALL_UNIT_LIST: UnitTemplate[] = Object.values(UNIT_TEMPLATES);

export const UNITS_BY_COST: Record<CostTier, UnitTemplate[]> = {
  1: ALL_UNIT_LIST.filter((u) => u.cost === 1),
  2: ALL_UNIT_LIST.filter((u) => u.cost === 2),
  3: ALL_UNIT_LIST.filter((u) => u.cost === 3),
  4: ALL_UNIT_LIST.filter((u) => u.cost === 4),
  5: ALL_UNIT_LIST.filter((u) => u.cost === 5),
};

// ============================================================================
// D. 5종 기본 아이템 & 15종 완성 아이템 (ITEM_DEFINITIONS)
// ============================================================================

export interface ItemStats {
  hp?: number;
  atk?: number;
  def?: number;
  atkSpeed?: number;
  spellPower?: number;
  startMana?: number;
  critChance?: number;
  critDamage?: number;
  omnivamp?: number;
  bonusRange?: number;
}

export interface ItemPassiveFlags {
  enableSkillCrit?: boolean;
  giantSlayerBonus?: boolean;
  gunbladeAllyHeal?: boolean;
  shojinBonusMana?: number;
  bloodthirsterShield?: boolean;
  guinsooStackingAtkSpeed?: number;
  statikkChainLightning?: boolean;
  titansResolveStacking?: boolean;
  archangelManaScaling?: boolean;
  sunfireBurnAura?: boolean;
  blueBuffReset?: boolean;
  protectorsVowShield?: boolean;
  brambleReflect?: boolean;
}

export interface ItemDefinition {
  id: ItemId;
  name: string;
  isCompleted: boolean;
  components?: [BaseItemId, BaseItemId];
  icon: string;
  description: string;
  stats: ItemStats;
  passiveFlags: ItemPassiveFlags;
}

export const BASE_ITEM_IDS: BaseItemId[] = ['SWORD', 'BOW', 'ROD', 'TEAR', 'ARMOR'];

export const ITEM_DEFINITIONS: Record<ItemId, ItemDefinition> = {
  // ---- 기본 아이템 5종 ----
  SWORD: {
    id: 'SWORD',
    name: '대검',
    isCompleted: false,
    icon: '🗡️',
    description: '공격력 +15',
    stats: { atk: 15 },
    passiveFlags: {},
  },
  BOW: {
    id: 'BOW',
    name: '곡궁',
    isCompleted: false,
    icon: '🏹',
    description: '공격 속도 +15%',
    stats: { atkSpeed: 0.15 },
    passiveFlags: {},
  },
  ROD: {
    id: 'ROD',
    name: '쓸데없이 큰 지팡이',
    isCompleted: false,
    icon: '🪄',
    description: '주문력 +20%',
    stats: { spellPower: 0.2 },
    passiveFlags: {},
  },
  TEAR: {
    id: 'TEAR',
    name: '여신의 눈물',
    isCompleted: false,
    icon: '💧',
    description: '시작 마나 +15',
    stats: { startMana: 15 },
    passiveFlags: {},
  },
  ARMOR: {
    id: 'ARMOR',
    name: '사슬 조끼',
    isCompleted: false,
    icon: '🛡️',
    description: '방어력 +25',
    stats: { def: 25 },
    passiveFlags: {},
  },

  // ---- 완성 아이템 15종 (5종 기본 아이템의 모든 2조합 매트릭스) ----
  INFINITY_EDGE: {
    id: 'INFINITY_EDGE',
    name: '무한의 대검',
    isCompleted: true,
    components: ['SWORD', 'SWORD'],
    icon: '⚔️',
    description: '공격력 +35, 치명타 확률 +35%, 치명타 피해량 +25%. 스킬에 치명타가 적용됩니다.',
    stats: { atk: 35, critChance: 0.35, critDamage: 0.25 },
    passiveFlags: { enableSkillCrit: true },
  },
  GIANT_SLAYER: {
    id: 'GIANT_SLAYER',
    name: '거인 학살자',
    isCompleted: true,
    components: ['SWORD', 'BOW'],
    icon: '🏹',
    description: '공격력 +25, 공격 속도 +20%. 최대 체력이 1,400 이상인 거대 적에게 주는 모든 피해가 35% 증가합니다.',
    stats: { atk: 25, atkSpeed: 0.2 },
    passiveFlags: { giantSlayerBonus: true },
  },
  HEXTECH_GUNBLADE: {
    id: 'HEXTECH_GUNBLADE',
    name: '마법공학 총검',
    isCompleted: true,
    components: ['SWORD', 'ROD'],
    icon: '🔫',
    description: '공격력 +20, 주문력 +25%, 모든 피해 흡혈 +22%. 입힌 피해의 25%만큼 체력이 가장 낮은 아군도 함께 치유합니다.',
    stats: { atk: 20, spellPower: 0.25, omnivamp: 0.22 },
    passiveFlags: { gunbladeAllyHeal: true },
  },
  SPEAR_OF_SHOJIN: {
    id: 'SPEAR_OF_SHOJIN',
    name: '쇼진의 창',
    isCompleted: true,
    components: ['SWORD', 'TEAR'],
    icon: '🔱',
    description: '공격력 +20, 시작 마나 +15, 주문력 +15%. 기본 공격 시마다 마나를 추가로 +10 회복합니다.',
    stats: { atk: 20, startMana: 15, spellPower: 0.15 },
    passiveFlags: { shojinBonusMana: 10 },
  },
  BLOODTHIRSTER: {
    id: 'BLOODTHIRSTER',
    name: '피바라기',
    isCompleted: true,
    components: ['SWORD', 'ARMOR'],
    icon: '🩸',
    description: '공격력 +20, 방어력 +25, 모든 피해 흡혈 +25%. 체력이 40% 이하로 떨어지면 최대 체력 30%의 보호막을 얻습니다.',
    stats: { atk: 20, def: 25, omnivamp: 0.25 },
    passiveFlags: { bloodthirsterShield: true },
  },
  RAPID_FIRECANNON: {
    id: 'RAPID_FIRECANNON',
    name: '고속 연사포',
    isCompleted: true,
    components: ['BOW', 'BOW'],
    icon: '🎯',
    description: '공격 속도 +45%, 공격 사거리 +2칸 증가.',
    stats: { atkSpeed: 0.45, bonusRange: 2 },
    passiveFlags: {},
  },
  GUINSOOS_RAGEBLADE: {
    id: 'GUINSOOS_RAGEBLADE',
    name: '구인수의 격노검',
    isCompleted: true,
    components: ['BOW', 'ROD'],
    icon: '🔥',
    description: '공격 속도 +20%, 주문력 +20%. 기본 공격 시마다 공격 속도가 +6%씩 무한 중첩됩니다.',
    stats: { atkSpeed: 0.2, spellPower: 0.2 },
    passiveFlags: { guinsooStackingAtkSpeed: 0.06 },
  },
  STATIKK_SHIV: {
    id: 'STATIKK_SHIV',
    name: '스태틱의 단검',
    isCompleted: true,
    components: ['BOW', 'TEAR'],
    icon: '⚡',
    description: '공격 속도 +20%, 시작 마나 +15. 기본 공격 3회마다 적 3명에게 90의 연쇄 번개 피해 및 방어력 30% 파쇄.',
    stats: { atkSpeed: 0.2, startMana: 15 },
    passiveFlags: { statikkChainLightning: true },
  },
  TITANS_RESOLVE: {
    id: 'TITANS_RESOLVE',
    name: '거인의 결의',
    isCompleted: true,
    components: ['BOW', 'ARMOR'],
    icon: '🗿',
    description: '공격 속도 +15%, 방어력 +25. 공격하거나 피격될 때마다 공격력과 주문력이 +2%씩 최대 25회 중첩되며 풀중첩 시 방어력 +35.',
    stats: { atkSpeed: 0.15, def: 25 },
    passiveFlags: { titansResolveStacking: true },
  },
  RABADONS_DEATHCAP: {
    id: 'RABADONS_DEATHCAP',
    name: '라바돈의 죽음모자',
    isCompleted: true,
    components: ['ROD', 'ROD'],
    icon: '🎩',
    description: '주문력 +75% 대폭 상승.',
    stats: { spellPower: 0.75 },
    passiveFlags: {},
  },
  ARCHANGELS_STAFF: {
    id: 'ARCHANGELS_STAFF',
    name: '대천사의 지팡이',
    isCompleted: true,
    components: ['ROD', 'TEAR'],
    icon: '🪽',
    description: '주문력 +25%, 시작 마나 +15. 전투 중 매 4초마다 주문력이 +25%씩 영구 상승합니다.',
    stats: { spellPower: 0.25, startMana: 15 },
    passiveFlags: { archangelManaScaling: true },
  },
  SUNFIRE_CAPE: {
    id: 'SUNFIRE_CAPE',
    name: '태양불꽃 망토',
    isCompleted: true,
    components: ['ROD', 'ARMOR'],
    icon: '☀️',
    description: '체력 +250, 방어력 +35. 매 2초마다 주변 적에게 최대 체력 8%의 화상 고정 피해를 입힙니다.',
    stats: { hp: 250, def: 35 },
    passiveFlags: { sunfireBurnAura: true },
  },
  BLUE_BUFF: {
    id: 'BLUE_BUFF',
    name: '푸른 파수꾼',
    isCompleted: true,
    components: ['TEAR', 'TEAR'],
    icon: '💎',
    description: '시작 마나 +35, 주문력 +20%. 스킬 시전 직후 마나를 20 즉시 페이백 받습니다.',
    stats: { startMana: 35, spellPower: 0.2 },
    passiveFlags: { blueBuffReset: true },
  },
  PROTECTORS_VOW: {
    id: 'PROTECTORS_VOW',
    name: '수호자의 맹세',
    isCompleted: true,
    components: ['TEAR', 'ARMOR'],
    icon: '🛡️',
    description: '시작 마나 +30, 방어력 +35. 전투당 1회 체력 40% 도달 시 최대 체력 25% 보호막과 방어력 +30을 얻습니다.',
    stats: { startMana: 30, def: 35 },
    passiveFlags: { protectorsVowShield: true },
  },
  BRAMBLE_VEST: {
    id: 'BRAMBLE_VEST',
    name: '가시 갑옷',
    isCompleted: true,
    components: ['ARMOR', 'ARMOR'],
    icon: '🌵',
    description: '방어력 +70, 체력 +150. 피격 시 주변 적들에게 120의 반사 피해를 입히고 치명타 추가 피해를 무효화합니다.',
    stats: { def: 70, hp: 150 },
    passiveFlags: { brambleReflect: true },
  },
};

/**
 * 기본 아이템 2종 조합 매트릭스 (순서 무관)
 */
export const ITEM_COMBINATION_MATRIX: Record<BaseItemId, Record<BaseItemId, CompletedItemId>> = {
  SWORD: {
    SWORD: 'INFINITY_EDGE',
    BOW: 'GIANT_SLAYER',
    ROD: 'HEXTECH_GUNBLADE',
    TEAR: 'SPEAR_OF_SHOJIN',
    ARMOR: 'BLOODTHIRSTER',
  },
  BOW: {
    SWORD: 'GIANT_SLAYER',
    BOW: 'RAPID_FIRECANNON',
    ROD: 'GUINSOOS_RAGEBLADE',
    TEAR: 'STATIKK_SHIV',
    ARMOR: 'TITANS_RESOLVE',
  },
  ROD: {
    SWORD: 'HEXTECH_GUNBLADE',
    BOW: 'GUINSOOS_RAGEBLADE',
    ROD: 'RABADONS_DEATHCAP',
    TEAR: 'ARCHANGELS_STAFF',
    ARMOR: 'SUNFIRE_CAPE',
  },
  TEAR: {
    SWORD: 'SPEAR_OF_SHOJIN',
    BOW: 'STATIKK_SHIV',
    ROD: 'ARCHANGELS_STAFF',
    TEAR: 'BLUE_BUFF',
    ARMOR: 'PROTECTORS_VOW',
  },
  ARMOR: {
    SWORD: 'BLOODTHIRSTER',
    BOW: 'TITANS_RESOLVE',
    ROD: 'SUNFIRE_CAPE',
    TEAR: 'PROTECTORS_VOW',
    ARMOR: 'BRAMBLE_VEST',
  },
};

export function combineBaseItems(itemA: BaseItemId, itemB: BaseItemId): CompletedItemId {
  return ITEM_COMBINATION_MATRIX[itemA][itemB];
}

// ============================================================================
// E. 12종 증강체 정의 (AUGMENT_DEFINITIONS - 실버/골드/프리즘)
// ============================================================================

export type AugmentEffectKey =
  | 'PANDORA_BENCH'
  | 'CYBERNETIC_IMPLANT'
  | 'BATTLE_MAGE'
  | 'TINY_TITANS'
  | 'GOLDEN_TICKET'
  | 'DIABOLIC_FINANCE'
  | 'EMPIRE_CREST'
  | 'ARCANE_CREST'
  | 'CELESTIAL_BLESSING'
  | 'GOBLIN_CROWN'
  | 'FATED_DUPLICATION'
  | 'LEVEL_UP';

export interface AugmentDefinition {
  id: string;
  name: string;
  tier: AugmentTier;
  effectKey: AugmentEffectKey;
  icon: string;
  description: string;
  bonusTrait?: TraitId;
  bonusTraitCount?: number;
  immediateGold?: number;
  immediateDuplicators?: number;
  immediateBaseItems?: BaseItemId[];
  immediateUnitId?: string;
}

export const AUGMENT_DEFINITIONS: AugmentDefinition[] = [
  // ---- SILVER (4종) ----
  {
    id: 'AUG_PANDORA_BENCH',
    name: '판도라의 대기석',
    tier: 'SILVER',
    effectKey: 'PANDORA_BENCH',
    icon: '🎲',
    description:
      '매 라운드 시작 시 대기석 우측 3칸(7, 8, 9번 슬롯)에 있는 기물들이 같은 코스트의 랜덤 기물로 변신합니다. 즉시 2골드를 획득합니다.',
    immediateGold: 2,
  },
  {
    id: 'AUG_CYBERNETIC_IMPLANT',
    name: '사이버네틱 임플란트',
    tier: 'SILVER',
    effectKey: 'CYBERNETIC_IMPLANT',
    icon: '🦾',
    description: '아이템을 1개 이상 장착한 아군 기물들의 최대 체력이 +250, 공격력이 +25 증가합니다.',
    immediateBaseItems: ['SWORD'],
  },
  {
    id: 'AUG_BATTLE_MAGE',
    name: '전투 마법사',
    tier: 'SILVER',
    effectKey: 'BATTLE_MAGE',
    icon: '🔥',
    description: '전방 2열(0~1행)에 배치된 아군 기물이 주문력 +35%와 방어력 +35를 얻습니다.',
    immediateBaseItems: ['ROD'],
  },
  {
    id: 'AUG_TINY_TITANS',
    name: '작은 거인',
    tier: 'SILVER',
    effectKey: 'TINY_TITANS',
    icon: '❤️',
    description: '플레이어(전설이)의 체력을 즉시 +30 회복하고 최대 체력 한도가 130으로 증가합니다.',
    immediateGold: 4,
  },

  // ---- GOLD (4종) ----
  {
    id: 'AUG_GOLDEN_TICKET',
    name: '황금 티켓',
    tier: 'GOLD',
    effectKey: 'GOLDEN_TICKET',
    icon: '🎟️',
    description: '상점 새로고침(리롤) 시 40% 확률로 골드를 소모하지 않는 무료 리롤을 획득합니다!',
    immediateGold: 4,
  },
  {
    id: 'AUG_DIABOLIC_FINANCE',
    name: '사악한 금융',
    tier: 'GOLD',
    effectKey: 'DIABOLIC_FINANCE',
    icon: '💰',
    description: '최대 이자 한도가 5골드(50G)에서 7골드(70G)로 증가하며, 즉시 10골드를 획득합니다.',
    immediateGold: 10,
  },
  {
    id: 'AUG_EMPIRE_CREST',
    name: '제국의 문장',
    tier: 'GOLD',
    effectKey: 'EMPIRE_CREST',
    icon: '🛡️',
    description: '[신성 제국] 시너지 카운트가 +1 증가하며, 즉시 [성전사 잔느]와 4골드를 획득합니다.',
    bonusTrait: 'HOLY_EMPIRE',
    bonusTraitCount: 1,
    immediateUnitId: 'u2_jeanne',
    immediateGold: 4,
  },
  {
    id: 'AUG_CELESTIAL_BLESSING',
    name: '천상의 축복',
    tier: 'GOLD',
    effectKey: 'CELESTIAL_BLESSING',
    icon: '✨',
    description: '아군 전체가 모든 피해 흡혈(Omnivamp) 20%를 얻으며 초과 회복량이 최대 350의 보호막으로 전환됩니다.',
  },

  // ---- PRISMATIC (4종) ----
  {
    id: 'AUG_GOBLIN_CROWN',
    name: '고블린의 왕관',
    tier: 'PRISMATIC',
    effectKey: 'GOBLIN_CROWN',
    icon: '👑',
    description:
      '[황금 고블린] 시너지 카운트가 +1 증가하며, 즉시 [고블린 용병대장 그롬]과 6골드를 획득합니다!',
    bonusTrait: 'GOLDEN_GOBLIN',
    bonusTraitCount: 1,
    immediateUnitId: 'u3_grom',
    immediateGold: 6,
  },
  {
    id: 'AUG_FATED_DUPLICATION',
    name: '운명의 복제',
    tier: 'PRISMATIC',
    effectKey: 'FATED_DUPLICATION',
    icon: '🧬',
    description: '기물 등급에 상관없이 즉시 1성 복사본을 생성하는 [챔피언 복제기] 2개와 8골드를 획득합니다!',
    immediateDuplicators: 2,
    immediateGold: 8,
  },
  {
    id: 'AUG_ARCANE_CREST',
    name: '고대 마탑의 왕관',
    tier: 'PRISMATIC',
    effectKey: 'ARCANE_CREST',
    icon: '🔮',
    description:
      '[마탑] 및 [대마법사] 시너지 카운트가 각각 +1씩 증가하며, 즉시 [대천사의 지팡이] 재료(지팡이+눈물)를 획득합니다.',
    bonusTrait: 'ARCANE_TOWER',
    bonusTraitCount: 1,
    immediateBaseItems: ['ROD', 'TEAR'],
  },
  {
    id: 'AUG_LEVEL_UP',
    name: '레벨 업!',
    tier: 'PRISMATIC',
    effectKey: 'LEVEL_UP',
    icon: '🚀',
    description: '경험치 구매(4골드) 시 획득하는 경험치가 4 XP에서 7 XP로 증가하며, 즉시 12골드를 획득합니다.',
    immediateGold: 12,
  },
];
