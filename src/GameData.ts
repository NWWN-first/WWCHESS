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
  | 'BEASTKIN'
  | 'VANGUARD'
  | 'BERSERKER'
  | 'RANGER'
  | 'ARCHMAGE'
  | 'SHADOW_ASSASSIN'
  | 'PALADIN'
  | 'ARTIFICER'
  | 'STRATEGIST';


export type BaseItemId = 'SWORD' | 'BOW' | 'ROD' | 'TEAR' | 'ARMOR' | 'SPATULA';

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
  | 'BRAMBLE_VEST'
  | 'EMBLEM_HOLY_EMPIRE'
  | 'EMBLEM_ABYSSAL_DEMON'
  | 'EMBLEM_ELVEN_SYLVAN'
  | 'EMBLEM_UNDEAD_SCOURGE'
  | 'EMBLEM_ARCANE_TOWER'
  | 'EMBLEM_BEASTKIN'
  | 'EMBLEM_GOLDEN_GOBLIN'
  | 'EMBLEM_DRAGONKIN'
  | 'EMBLEM_VANGUARD'
  | 'EMBLEM_BERSERKER'
  | 'EMBLEM_RANGER'
  | 'EMBLEM_ARCHMAGE'
  | 'EMBLEM_SHADOW_ASSASSIN'
  | 'EMBLEM_PALADIN'
  | 'EMBLEM_ARTIFICER'
  | 'EMBLEM_STRATEGIST';

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
  5: 8,  // 5코스트: 기물당 8개 (경합↑, 순방 과강 완화)
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
    2: { hpMult: 1.9, atkMult: 1.9, skillMult: 1.05 },
    3: { hpMult: 3.75, atkMult: 3.75, skillMult: 1.28 }, // 1코 3성 뽕맛 강화
  },
  2: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.88, atkMult: 1.88, skillMult: 1.05 },
    3: { hpMult: 3.78, atkMult: 3.78, skillMult: 1.35 }, // 2코 3성 캐리력 강화
  },
  3: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.85, atkMult: 1.85, skillMult: 1.0 },
    3: { hpMult: 3.70, atkMult: 3.70, skillMult: 1.40 }, // 3코 3성 트럭: 4코/5코 2성을 꺾고 1등 우승 가능!
  },
  4: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.85, atkMult: 1.85, skillMult: 1.0 },
    3: { hpMult: 3.35, atkMult: 3.35, skillMult: 1.0 },
  },
  5: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.5, atkMult: 1.48, skillMult: 0.9 }, // 2성 캐리력 추가 하향
    3: { hpMult: 3.1, atkMult: 2.85, skillMult: 4.0 }, // 3성도 보드 즉사 제거 방향
  },
};

/**
 * 코스트별 전투력 보정 (플레이 피드백: 저코스트가 지나치게 약함).
 * Participant 스탯 재계산 및 SkillRegistry 스킬 피해에 공통 적용.
 */
/** 코스트 밴드 전투 배율 — 5코 전투승~62%/순방~80%까지 내려왔으나 목표(승~55%/순방~65%) 미달 → 추가 너프 */
export const COST_COMBAT_BALANCE: Record<
  CostTier,
  { hp: number; atk: number; skill: number }
> = {
  1: { hp: 1.3, atk: 1.28, skill: 1.32 },
  2: { hp: 1.22, atk: 1.2, skill: 1.24 },
  3: { hp: 1.18, atk: 1.18, skill: 1.2 },
  4: { hp: 1.14, atk: 1.14, skill: 1.16 },
  5: { hp: 0.58, atk: 0.54, skill: 0.5 },
};

// ============================================================================
// B. 16종 판타지 시너지 정의 (V2.1) (TRAIT_DEFINITIONS)
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
  maxHpBonusRatio?: number;
  backlineDamageAmp?: number;
  frontlineDurability?: number;
  artificerShieldRatio?: number;
  artificerTurretDamage?: number;
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
  HOLY_EMPIRE: {
    id: 'HOLY_EMPIRE',
    name: '신성 제국',
    type: 'ORIGIN',
    icon: '🛡️',
    color: '#F5D76E',
    thresholds: [2, 4, 6, 9],
    description: '전투 시작 시 신성 기물에게 최대 체력 비례 보호막과 방어력을 부여합니다.',
    effects: [
      { threshold: 2, label: '(2) 보호막 18% · 방어 +20', shieldMaxHpRatio: 0.18, bonusDef: 20 },
      { threshold: 4, label: '(4) 보호막 32% · 방어 +45', shieldMaxHpRatio: 0.32, bonusDef: 45 },
      { threshold: 6, label: '(6) 보호막 48% · 방어 +70', shieldMaxHpRatio: 0.48, bonusDef: 70 },
      { threshold: 9, label: '(9) [문장] 보호막 70% · 방어 +120', shieldMaxHpRatio: 0.70, bonusDef: 120 },
    ],
  },
  ABYSSAL_DEMON: {
    id: 'ABYSSAL_DEMON',
    name: '심연의 악마',
    type: 'ORIGIN',
    icon: '👿',
    color: '#C0392B',
    thresholds: [2, 4, 6, 9],
    description: '심연 기물의 기본 공격·스킬이 추가 고정 피해를 입힙니다. (흡혈 없음)',
    effects: [
      { threshold: 2, label: '(2) 추가 고정 피해 8%', trueDamageRatio: 0.08 },
      { threshold: 4, label: '(4) 추가 고정 피해 16%', trueDamageRatio: 0.16 },
      { threshold: 6, label: '(6) 추가 고정 피해 26%', trueDamageRatio: 0.26 },
      { threshold: 9, label: '(9) [문장] 추가 고정 피해 40%', trueDamageRatio: 0.40 },
    ],
  },
  ELVEN_SYLVAN: {
    id: 'ELVEN_SYLVAN',
    name: '엘프 숲',
    type: 'ORIGIN',
    icon: '🌿',
    color: '#2ECC71',
    thresholds: [2, 4, 6, 9],
    description: '매 2초마다 공속이 중첩되고(상한 10) 소량 체력을 회복합니다.',
    effects: [
      { threshold: 2, label: '(2) 2초마다 공속 +6% · 회복 1%', atkSpeedPerStack: 0.06, hpRegenRatioPerTick: 0.01 },
      { threshold: 4, label: '(4) 공속 +12% · 회복 2%', atkSpeedPerStack: 0.12, hpRegenRatioPerTick: 0.02 },
      { threshold: 6, label: '(6) 공속 +18% · 회복 3%', atkSpeedPerStack: 0.18, hpRegenRatioPerTick: 0.03 },
      { threshold: 9, label: '(9) [문장] 공속 +28% · 회복 4%', atkSpeedPerStack: 0.28, hpRegenRatioPerTick: 0.04 },
    ],
  },
  DRAGONKIN: {
    id: 'DRAGONKIN',
    name: '용족',
    type: 'ORIGIN',
    icon: '🐉',
    color: '#E67E22',
    thresholds: [2, 4, 6],
    description: '개전 화상과 용족 스킬 치명타를 부여합니다.',
    effects: [
      { threshold: 2, label: '(2) 개전 화상 12% · 스킬치명(+40% 치명피)', initialBurnMaxHpRatio: 0.12, enableSkillCrit: true, bonusCritDamage: 0.40 },
      { threshold: 4, label: '(4) 개전 화상 22% · +70% 치명피', initialBurnMaxHpRatio: 0.22, enableSkillCrit: true, bonusCritDamage: 0.70 },
      { threshold: 6, label: '(6) 개전 화상 32% · +100% 치명피', initialBurnMaxHpRatio: 0.32, enableSkillCrit: true, bonusCritDamage: 1.0 },
    ],
  },
  UNDEAD_SCOURGE: {
    id: 'UNDEAD_SCOURGE',
    name: '언데드 군단',
    type: 'ORIGIN',
    icon: '💀',
    color: '#8E44AD',
    thresholds: [2, 4, 6, 8],
    description: '최초 사망 시 1회 부활하며 부활 후 공속이 증가합니다.',
    effects: [
      { threshold: 2, label: '(2) 30% 부활 · 공속 +20%', reviveHpRatio: 0.30, reviveBonusAtkSpeed: 0.20 },
      { threshold: 4, label: '(4) 50% 부활 · 공속 +35%', reviveHpRatio: 0.50, reviveBonusAtkSpeed: 0.35 },
      { threshold: 6, label: '(6) 65% 부활 · 공속 +50%', reviveHpRatio: 0.65, reviveBonusAtkSpeed: 0.50 },
      { threshold: 8, label: '(8) [문장] 80% 부활 · 공속 +65%', reviveHpRatio: 0.80, reviveBonusAtkSpeed: 0.65 },
    ],
  },
  ARCANE_TOWER: {
    id: 'ARCANE_TOWER',
    name: '마탑',
    type: 'ORIGIN',
    icon: '🔮',
    color: '#3498DB',
    thresholds: [3, 5, 7, 9],
    description: '아군 평타 마나 회복과 마탑 주문력을 올립니다. 시작 단계 3.',
    effects: [
      { threshold: 3, label: '(3) 마나 +2 · 주문력 +20%', teamManaPerAttack: 2, spellPowerBonus: 0.20 },
      { threshold: 5, label: '(5) 마나 +4 · 주문력 +40%', teamManaPerAttack: 4, spellPowerBonus: 0.40 },
      { threshold: 7, label: '(7) 마나 +6 · 주문력 +65%', teamManaPerAttack: 6, spellPowerBonus: 0.65 },
      { threshold: 9, label: '(9) [문장] 마나 +8 · 주문력 +100%', teamManaPerAttack: 8, spellPowerBonus: 1.0 },
    ],
  },
  GOLDEN_GOBLIN: {
    id: 'GOLDEN_GOBLIN',
    name: '황금 고블린',
    type: 'ORIGIN',
    icon: '🪙',
    color: '#F1C40F',
    thresholds: [3, 5, 7, 9],
    description: '패배 시 금고 스택, 승리 시 환전하는 경제 시너지. 최고단계(9)는 상징 필요.',
    effects: [
      { threshold: 3, label: '(3) 패배 스택 1.0x · 승리 시 개봉', goblinStackMultiplier: 1.0 },
      { threshold: 5, label: '(5) 패배 스택 1.75x', goblinStackMultiplier: 1.75 },
      { threshold: 7, label: '(7) 패배 스택 2.5x', goblinStackMultiplier: 2.5 },
      { threshold: 9, label: '(9) [문장] 패배 스택 3.5x', goblinStackMultiplier: 3.5 },
    ],
  },
  BEASTKIN: {
    id: 'BEASTKIN',
    name: '야수혈족',
    type: 'ORIGIN',
    icon: '🐺',
    color: '#A0522D',
    thresholds: [2, 4, 6, 9],
    description: '야수 기물의 최대 체력과 모든 피해 흡혈을 올립니다.',
    effects: [
      { threshold: 2, label: '(2) 체력 +15% · 흡혈 8%', maxHpBonusRatio: 0.15, omnivamp: 0.08 },
      { threshold: 4, label: '(4) 체력 +30% · 흡혈 12%', maxHpBonusRatio: 0.30, omnivamp: 0.12 },
      { threshold: 6, label: '(6) 체력 +50% · 흡혈 16%', maxHpBonusRatio: 0.50, omnivamp: 0.16 },
      { threshold: 9, label: '(9) [문장] 체력 +80% · 흡혈 22%', maxHpBonusRatio: 0.80, omnivamp: 0.22 },
    ],
  },
  VANGUARD: {
    id: 'VANGUARD',
    name: '선봉대',
    type: 'CLASS',
    icon: '🏰',
    color: '#95A5A6',
    thresholds: [2, 4, 6],
    description: '방어력과 개전 초반 피해 감소를 얻습니다.',
    effects: [
      { threshold: 2, label: '(2) 방어 +35 · 개전6초 감피해 15%', bonusDef: 35, damageReductionFirst8s: 0.15 },
      { threshold: 4, label: '(4) 방어 +75 · 감피해 20%', bonusDef: 75, damageReductionFirst8s: 0.20 },
      { threshold: 6, label: '(6) 방어 +120 · 감피해 25%', bonusDef: 120, damageReductionFirst8s: 0.25 },
    ],
  },
  BERSERKER: {
    id: 'BERSERKER',
    name: '광전사',
    type: 'CLASS',
    icon: '🪓',
    color: '#E74C3C',
    thresholds: [2, 4, 6],
    description: '체력 50% 이하에서 광폭화합니다.',
    effects: [
      { threshold: 2, label: '(2) 광폭 1.35배 · 스플래시 20%', berserkAtkMultiplier: 1.35, berserkAtkSpeedMultiplier: 1.35, berserkSplashRatio: 0.20 },
      { threshold: 4, label: '(4) 광폭 1.55배 · 스플래시 35%', berserkAtkMultiplier: 1.55, berserkAtkSpeedMultiplier: 1.55, berserkSplashRatio: 0.35 },
      { threshold: 6, label: '(6) 광폭 1.8배 · 스플래시 50%', berserkAtkMultiplier: 1.8, berserkAtkSpeedMultiplier: 1.8, berserkSplashRatio: 0.50 },
    ],
  },
  RANGER: {
    id: 'RANGER',
    name: '순찰자',
    type: 'CLASS',
    icon: '🏹',
    color: '#27AE60',
    thresholds: [2, 4, 6],
    description: '사거리 증가 및 3타마다 관통 화살.',
    effects: [
      { threshold: 2, label: '(2) 사거리 +1 · 관통 140%', bonusRange: 1, pierceArrowDamageRatio: 1.4 },
      { threshold: 4, label: '(4) 사거리 +1 · 관통 220%', bonusRange: 1, pierceArrowDamageRatio: 2.2 },
      { threshold: 6, label: '(6) 사거리 +2 · 관통 320%', bonusRange: 2, pierceArrowDamageRatio: 3.2 },
    ],
  },
  ARCHMAGE: {
    id: 'ARCHMAGE',
    name: '대마법사',
    type: 'CLASS',
    icon: '⚡',
    color: '#9B59B6',
    thresholds: [2, 4, 6],
    description: '주문력 상승 및 시전 시 연쇄 번개.',
    effects: [
      { threshold: 2, label: '(2) 주문력 +20% · 번개 120', spellPowerBonus: 0.20, chainLightningDamage: 120 },
      { threshold: 4, label: '(4) 주문력 +45% · 번개 260', spellPowerBonus: 0.45, chainLightningDamage: 260 },
      { threshold: 6, label: '(6) 주문력 +75% · 번개 420', spellPowerBonus: 0.75, chainLightningDamage: 420 },
    ],
  },
  SHADOW_ASSASSIN: {
    id: 'SHADOW_ASSASSIN',
    name: '그림자 암살자',
    type: 'CLASS',
    icon: '🗡️',
    color: '#34495E',
    thresholds: [2, 4, 6],
    description: '후방 도약 및 치명타 강화.',
    effects: [
      { threshold: 2, label: '(2) 도약 · 치명 +20% · 치명피 +30%', bonusCritChance: 0.20, bonusCritDamage: 0.30 },
      { threshold: 4, label: '(4) 치명 +35% · 치명피 +55%', bonusCritChance: 0.35, bonusCritDamage: 0.55 },
      { threshold: 6, label: '(6) 치명 +50% · 치명피 +85%', bonusCritChance: 0.50, bonusCritDamage: 0.85 },
    ],
  },
  PALADIN: {
    id: 'PALADIN',
    name: '성기사',
    type: 'CLASS',
    icon: '✨',
    color: '#F39C12',
    thresholds: [2, 4, 6],
    description: '평타 치유 및 CC 감소.',
    effects: [
      { threshold: 2, label: '(2) 평타힐 40 · CC 40% 감소', healPerAttack: 40, ccDurationReduction: 0.4 },
      { threshold: 4, label: '(4) 평타힐 80 · CC 60% 감소', healPerAttack: 80, ccDurationReduction: 0.6 },
      { threshold: 6, label: '(6) 평타힐 130 · CC 80% 감소', healPerAttack: 130, ccDurationReduction: 0.8 },
    ],
  },
  ARTIFICER: {
    id: 'ARTIFICER',
    name: '기술자',
    type: 'CLASS',
    icon: '🔧',
    color: '#7F8C8D',
    thresholds: [2, 4, 6],
    description: '전열 임시 보호막 부품과 소형 포탑을 설치합니다.',
    effects: [
      { threshold: 2, label: '(2) 전열 임시 보호막 부품 (체력 12%)', artificerShieldRatio: 0.12 },
      { threshold: 4, label: '(4) 소형 포탑 1기 + 보호막 18%', artificerShieldRatio: 0.18, artificerTurretDamage: 90 },
      { threshold: 6, label: '(6) 강화 포탑 + 보호막 25%', artificerShieldRatio: 0.25, artificerTurretDamage: 160 },
    ],
  },
  STRATEGIST: {
    id: 'STRATEGIST',
    name: '전술가',
    type: 'CLASS',
    icon: '♟️',
    color: '#1ABC9C',
    thresholds: [2, 3, 4, 5],
    description: '후열 딜증 · 전열 내구. 전술가 본인은 3배.',
    effects: [
      { threshold: 2, label: '(2) 후열 딜증 6% · 전열 내구 4%', backlineDamageAmp: 0.06, frontlineDurability: 0.04 },
      { threshold: 3, label: '(3) 딜증 9% · 내구 6%', backlineDamageAmp: 0.09, frontlineDurability: 0.06 },
      { threshold: 4, label: '(4) 딜증 12% · 내구 9%', backlineDamageAmp: 0.12, frontlineDurability: 0.09 },
      { threshold: 5, label: '(5) 딜증 16% · 내구 12%', backlineDamageAmp: 0.16, frontlineDurability: 0.12 },
    ],
  },
};

/** 메인 시너지(계열/Origin) — 선봉·광전사 같은 직업(Class)이 아님 */
export function getPrimaryOriginTrait(traits: TraitId[]): TraitId | null {
  for (const t of traits) {
    if (TRAIT_DEFINITIONS[t]?.type === 'ORIGIN') return t;
  }
  return null;
}

export function getOriginThemeColor(traits: TraitId[]): string | null {
  const origin = getPrimaryOriginTrait(traits);
  return origin ? TRAIT_DEFINITIONS[origin].color : null;
}

export function hexColorToRgb(
  hex: string
): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  if (!m) return null;
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
}

export function originColorToRgba(hex: string, alpha: number): string {
  const rgb = hexColorToRgb(hex);
  if (!rgb) return `rgba(148, 163, 184, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** Three.js / 비트 컬러용 0xRRGGBB */
export function originColorToHexNumber(hex: string): number {
  const rgb = hexColorToRgb(hex);
  if (!rgb) return 0x94a3b8;
  return (rgb.r << 16) | (rgb.g << 8) | rgb.b;
}

// ============================================================================
// C. 60종 판타지 챔피언 정의 (V2.1) (UNIT_TEMPLATES)
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
  u1_ember: {
    id: 'u1_ember',
    name: '심연 방패병 모르그',
    cost: 1,
    traits: ['ABYSSAL_DEMON', 'VANGUARD'],
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
    traits: ['DRAGONKIN', 'ARTIFICER'],
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
  u1_fang: {
    id: 'u1_fang',
    name: '늑대혈 신병 팡',
    cost: 1,
    traits: ['BEASTKIN', 'BERSERKER'],
    icon: '🪓',
    stats: {
      hp: 630,
      atk: 63,
      def: 28,
      atkSpeed: 0.73,
      range: 1,
      startMana: 25,
      maxMana: 75,
    },
    skill: {
      name: '피의 할퀴기',
      description: '전방의 적을 발톱으로 연속 할퀴어 물리 피해를 입히고, 입힌 피해의 일부를 흡수합니다.',
      skillType: 'THORN_SMASH',
      baseValueByStar: [240, 400, 650],
      secondaryValueByStar: [100, 170, 280],
      manaLockMs: 900,
    },
  },
  u1_tusk: {
    id: 'u1_tusk',
    name: '엄니 방패꾼 터스크',
    cost: 1,
    traits: ['BEASTKIN', 'PALADIN'],
    icon: '✨',
    stats: {
      hp: 660,
      atk: 49,
      def: 34,
      atkSpeed: 0.66,
      range: 1,
      startMana: 35,
      maxMana: 75,
    },
    skill: {
      name: '엄니 돌진',
      description: '방패처럼 큰 엄니로 돌진해 대상을 짧게 기절시키고 가장 체력이 낮은 아군을 소량 치유합니다.',
      skillType: 'SHIELD_BASH_HEAL',
      baseValueByStar: [200, 340, 560],
      secondaryValueByStar: [180, 300, 480],
      manaLockMs: 900,
    },
  },
  u2_jeanne: {
    id: 'u2_jeanne',
    name: '성전사 잔느',
    cost: 2,
    traits: ['HOLY_EMPIRE', 'PALADIN', 'ARTIFICER'],
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
  u2_ent: {
    id: 'u2_ent',
    name: '숲의 수호신 엔트',
    cost: 2,
    traits: ['ELVEN_SYLVAN', 'STRATEGIST', 'PALADIN'],
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
  u2_boulder: {
    id: 'u2_boulder',
    name: '룬 거석병 볼더',
    cost: 2,
    traits: ['ARCANE_TOWER', 'ARTIFICER'],
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
  u2_tink: {
    id: 'u2_tink',
    name: '고블린 연금술사 팅크',
    cost: 2,
    traits: ['GOLDEN_GOBLIN', 'ARTIFICER', 'ARCHMAGE'],
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
  u2_boom: {
    id: 'u2_boom',
    name: '고블린 폭격수 붐',
    cost: 2,
    traits: ['GOLDEN_GOBLIN', 'STRATEGIST'],
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
  u2_claw: {
    id: 'u2_claw',
    name: '발톱 결투사 클로',
    cost: 2,
    traits: ['BEASTKIN', 'SHADOW_ASSASSIN'],
    icon: '🗡️',
    stats: {
      hp: 648,
      atk: 78,
      def: 28,
      atkSpeed: 0.83,
      range: 1,
      startMana: 20,
      maxMana: 78,
    },
    skill: {
      name: '그림자 발톱',
      description: '적 후방으로 도약해 급소를 찌른 뒤, 짧은 시간 자신의 공격 속도를 높입니다.',
      skillType: 'BACKLINE_CRIT_SLASH',
      baseValueByStar: [280, 460, 750],
      manaLockMs: 900,
    },
  },
  u2_howl: {
    id: 'u2_howl',
    name: '울음 주술사 하울',
    cost: 2,
    traits: ['BEASTKIN', 'ARCHMAGE'],
    icon: '⚡',
    stats: {
      hp: 612,
      atk: 58,
      def: 26,
      atkSpeed: 0.68,
      range: 3,
      startMana: 30,
      maxMana: 78,
    },
    skill: {
      name: '울음 주술',
      description: '울부짖어 전방 부채꼴에 마법 피해를 주고, 야수 아군의 다음 기본 공격을 강화합니다.',
      skillType: 'ARCANE_BOLT',
      baseValueByStar: [260, 420, 680],
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
  u3_nyx: {
    id: 'u3_nyx',
    name: '심연의 밤마녀 닉스',
    cost: 3,
    traits: ['ABYSSAL_DEMON', 'ARCHMAGE', 'SHADOW_ASSASSIN'],
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
      name: '악몽의 균열',
      description: '대상에게 심연 마법 피해를 준 뒤 잠시 모습을 감추고 후열로 재등장해 추가 일격을 가합니다.',
      skillType: 'ASSASSIN_GOLD_STRIKE',
      baseValueByStar: [350, 550, 920],
      secondaryValueByStar: [0.35, 0.35, 0.4],
      manaLockMs: 800,
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
  u3_kazu: {
    id: 'u3_kazu',
    name: '환영의 검객 카즈',
    cost: 3,
    traits: ['ELVEN_SYLVAN', 'SHADOW_ASSASSIN', 'RANGER'],
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
  u3_drake: {
    id: 'u3_drake',
    name: '적염의 용기병 드레이크',
    cost: 3,
    traits: ['DRAGONKIN', 'PALADIN'],
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
  u3_fenrir: {
    id: 'u3_fenrir',
    name: '서리송곳니 펜리르',
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
  u3_quartz: {
    id: 'u3_quartz',
    name: '수정 골렘 쿼츠',
    cost: 3,
    traits: ['ARCANE_TOWER', 'ARTIFICER'],
    icon: '🔧',
    stats: {
      hp: 880,
      atk: 74,
      def: 44,
      atkSpeed: 0.71,
      range: 2,
      startMana: 30,
      maxMana: 82,
    },
    skill: {
      name: '수정 방벽',
      description: '주변에 수정 방벽을 펼쳐 아군에게 보호막을 주고, 방벽에 부딪힌 적에게 마법 피해를 입힙니다.',
      skillType: 'ACID_BOMB_SHRED',
      baseValueByStar: [240, 400, 640],
      manaLockMs: 900,
    },
  },
  u3_orion: {
    id: 'u3_orion',
    name: '별자리 명궁 오리온',
    cost: 3,
    traits: ['ARCANE_TOWER', 'STRATEGIST', 'RANGER'],
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
  u3_grizzle: {
    id: 'u3_grizzle',
    name: '고블린 중장갑 그리즐',
    cost: 3,
    traits: ['GOLDEN_GOBLIN', 'PALADIN'],
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
  u3_bramble: {
    id: 'u3_bramble',
    name: '가시덤불 브램블',
    cost: 3,
    traits: ['BEASTKIN', 'STRATEGIST'],
    icon: '♟️',
    stats: {
      hp: 836,
      atk: 78,
      def: 37,
      atkSpeed: 0.75,
      range: 3,
      startMana: 25,
      maxMana: 82,
    },
    skill: {
      name: '가시 전술진',
      description: '전열에 가시 지대를 설치해 들어오는 적에게 지속 피해를 주고, 후열 아군에게 짧은 공격력 버프를 부여합니다.',
      skillType: 'CURRENT_HP_ARROW',
      baseValueByStar: [220, 380, 620],
      manaLockMs: 900,
    },
  },
  u3_pack: {
    id: 'u3_pack',
    name: '무리 사냥꾼 렉스',
    cost: 3,
    traits: ['BEASTKIN', 'RANGER'],
    icon: '🏹',
    stats: {
      hp: 748,
      atk: 85,
      def: 29,
      atkSpeed: 0.86,
      range: 4,
      startMana: 0,
      maxMana: 82,
    },
    skill: {
      name: '무리의 추적',
      description: '체력이 가장 낮은 적에게 표식을 남기고 화살 3발을 연사합니다. 표식 대상은 잠시 받는 피해가 증가합니다.',
      skillType: 'TRIPLE_SNIPE',
      baseValueByStar: [270, 430, 700],
      manaLockMs: 900,
    },
  },
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
      description: '하늘에서 거대한 성검 엑스칼리버를 내리꽂아 대상과 주변 적들에게 막대한 물리 피해를 입히고 아군 전체에게 신성 보호막을 부여합니다.',
      skillType: 'EXCALIBUR_TEAM_SHIELD',
      baseValueByStar: [480, 760, 1850],
      secondaryValueByStar: [240, 380, 900],
      manaLockMs: 1000,
    },
  },
  u4_astaroth: {
    id: 'u4_astaroth',
    name: '심연의 대공 아스타로트',
    cost: 4,
    traits: ['ABYSSAL_DEMON', 'ARTIFICER'],
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
  u4_fafnir: {
    id: 'u4_fafnir',
    name: '황금 갑주룡 파프니르',
    cost: 4,
    traits: ['DRAGONKIN', 'STRATEGIST'],
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
    traits: ['UNDEAD_SCOURGE', 'ARCHMAGE'],
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
  u4_chrona: {
    id: 'u4_chrona',
    name: '마탑 파수대장 크로나',
    cost: 4,
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
      name: '마력 파수 방패',
      description: '비전 방패로 전열을 굳혀 주변 아군에게 보호막을 주고, 자신을 공격한 적에게 마법 반격을 가합니다.',
      skillType: 'SELF_SHIELD_SLASH',
      baseValueByStar: [185, 295, 480],
      secondaryValueByStar: [250, 390, 620],
      manaLockMs: 950,
    },
  },
  u4_midas: {
    id: 'u4_midas',
    name: '황금 연금술사 미다스',
    cost: 4,
    traits: ['GOLDEN_GOBLIN', 'ARTIFICER'],
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
  u4_snatch: {
    id: 'u4_snatch',
    name: '고블린 공성포 스내치',
    cost: 4,
    traits: ['GOLDEN_GOBLIN', 'ARTIFICER'],
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
      name: '공성 연발포',
      description: '공성포를 설치해 가장 체력이 높은 적에게 연속 포탄을 발사합니다. 포탄은 방어력을 일부 무시합니다.',
      skillType: 'CURRENT_HP_ARROW',
      baseValueByStar: [220, 350, 560],
      secondaryValueByStar: [0.14, 0.2, 0.3],
      manaLockMs: 750,
    },
  },
  u4_ursa: {
    id: 'u4_ursa',
    name: '거대 곰주술사 우르사',
    cost: 4,
    traits: ['BEASTKIN', 'VANGUARD', 'BERSERKER'],
    icon: '🏰',
    stats: {
      hp: 1207,
      atk: 78,
      def: 62,
      atkSpeed: 0.7,
      range: 1,
      startMana: 40,
      maxMana: 88,
    },
    skill: {
      name: '대지의 포효',
      description: '포효로 주변 적을 공포에 가깝게 위축시켜 공격력을 낮추고, 자신은 두터운 보호막과 흡혈을 얻습니다.',
      skillType: 'SELF_SHIELD_SLASH',
      baseValueByStar: [220, 360, 580],
      secondaryValueByStar: [200, 320, 500],
      manaLockMs: 900,
    },
  },
  u4_bone: {
    id: 'u4_bone',
    name: '망자 기병 데스나이트',
    cost: 4,
    traits: ['UNDEAD_SCOURGE', 'VANGUARD'],
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
      name: '망자의 돌격',
      description: '유령 기병으로 돌진해 일렬의 적에게 물리 피해를 입히고, 잠시 동안 받는 피해를 감소시킵니다.',
      skillType: 'SELF_SHIELD_SLASH',
      baseValueByStar: [230, 360, 580],
      secondaryValueByStar: [280, 440, 720],
      manaLockMs: 950,
    },
  },
  u4_celeste: {
    id: 'u4_celeste',
    name: '룬사수 셀레스트',
    cost: 4,
    traits: ['ARCANE_TOWER', 'STRATEGIST'],
    icon: '♟️',
    stats: {
      hp: 997,
      atk: 92,
      def: 45,
      atkSpeed: 0.78,
      range: 3,
      startMana: 25,
      maxMana: 88,
    },
    skill: {
      name: '별빛 조준망',
      description: '전장에 조준망을 펼쳐 후열 아군의 스킬 피해를 증가시키고, 표식된 적 하나에게 강력한 마법 화살을 발사합니다.',
      skillType: 'CURRENT_HP_ARROW',
      baseValueByStar: [220, 380, 620],
      manaLockMs: 900,
    },
  },
  u5_michael: {
    id: 'u5_michael',
    name: '천군 총사령관 미카엘',
    cost: 5,
    traits: ['HOLY_EMPIRE', 'PALADIN', 'VANGUARD'],
    icon: '⚔️',
    stats: {
      hp: 1360,
      atk: 97,
      def: 78,
      atkSpeed: 0.85,
      range: 1,
      startMana: 30,
      maxMana: 105,
    },
    skill: {
      name: '천상의 성검 대강림',
      description: '천상의 빛으로 적 전체를 심판하고 아군 전체에게 불멸의 성광 보호막을 내립니다. (3성 달성 시: 99,999 신성 피해로 전장 정화!)',
      skillType: 'APOCALYPSE_BREATH',
      baseValueByStar: [250, 440, 1050],
      manaLockMs: 1100,
    },
  },
  u5_lilith: {
    id: 'u5_lilith',
    name: '심연의 여왕 릴리스',
    cost: 5,
    traits: ['ABYSSAL_DEMON', 'SHADOW_ASSASSIN'],
    icon: '🩸',
    stats: {
      hp: 1210,
      atk: 112,
      def: 55,
      atkSpeed: 0.95,
      range: 1,
      startMana: 30,
      maxMana: 60,
    },
    skill: {
      name: '피의 여왕 연쇄 학살',
      description: '가장 약한 적을 처형하고 주변에 40% 스플래시 피해를 입히며, 처치 시 즉시 마나를 100% 회복하여 적 전체를 연쇄 학살합니다. (3성 달성 시: 99,999 피해로 연쇄 즉사!)',
      skillType: 'EXECUTE_RESET',
      baseValueByStar: [420, 740, 1600],
      manaLockMs: 500,
    },
  },
  u5_yggdrasil: {
    id: 'u5_yggdrasil',
    name: '세계수의 화신 이그드라실',
    cost: 5,
    traits: ['ELVEN_SYLVAN', 'STRATEGIST'],
    icon: '🌳',
    stats: {
      hp: 1480,
      atk: 92,
      def: 82,
      atkSpeed: 0.78,
      range: 2,
      startMana: 45,
      maxMana: 95,
    },
    skill: {
      name: '대자연의 천지개벽',
      description: '세계수의 생명으로 아군 전체에 거대한 보호막을 두르고 적 전체를 뿌리 폭풍으로 짓뭉갭니다. (3성 달성 시: 99,999 피해!)',
      skillType: 'EXCALIBUR_TEAM_SHIELD',
      baseValueByStar: [340, 600, 1400],
      secondaryValueByStar: [260, 450, 900],
      manaLockMs: 1100,
    },
  },
  u5_ignis: {
    id: 'u5_ignis',
    name: '고대 종말룡 이그니스',
    cost: 5,
    traits: ['DRAGONKIN', 'ABYSSAL_DEMON', 'BERSERKER'],
    icon: '🔥',
    stats: {
      hp: 1300,
      atk: 94,
      def: 68,
      atkSpeed: 0.8,
      range: 3,
      startMana: 50,
      maxMana: 100,
    },
    skill: {
      name: '종말의 지옥불 브레스',
      description: '공중으로 날아올라 적 보드 전체(8x7)에 지옥불 브레스를 퍼부어 모든 적에게 궤멸적인 피해와 2초 기절을 선사합니다. (3성 달성 시: 99,999 피해로 적 전체 즉사!)',
      skillType: 'APOCALYPSE_BREATH',
      baseValueByStar: [320, 560, 1400],
      manaLockMs: 1200,
    },
  },
  u5_bahamut: {
    id: 'u5_bahamut',
    name: '성운의 창세룡 바하무트',
    cost: 5,
    traits: ['DRAGONKIN', 'ARCANE_TOWER', 'ARCHMAGE'],
    icon: '🌌',
    stats: {
      hp: 1270,
      atk: 90,
      def: 66,
      atkSpeed: 0.84,
      range: 4,
      startMana: 45,
      maxMana: 95,
    },
    skill: {
      name: '기가 플레어 노바',
      description: '우주의 에너지를 응축한 창세의 브레스로 적 진영 전체를 초토화합니다. (3성 달성 시: 99,999 피해로 적 전체 소멸!)',
      skillType: 'APOCALYPSE_BREATH',
      baseValueByStar: [330, 580, 1450],
      manaLockMs: 1150,
    },
  },
  u5_goldtooth: {
    id: 'u5_goldtooth',
    name: '황금 고블린 왕 골드투스',
    cost: 5,
    traits: ['GOLDEN_GOBLIN', 'STRATEGIST'],
    icon: '👑',
    stats: {
      hp: 1240,
      atk: 88,
      def: 64,
      atkSpeed: 0.82,
      range: 2,
      startMana: 45,
      maxMana: 90,
    },
    skill: {
      name: '황금 제국의 금고 폭격',
      description: '하늘에서 거대한 황금 금고 폭격을 내려 적 전체를 기절시키고, 전투마다 골드와 보물을 생성합니다. (3성 달성 시: 전투 시작과 동시에 적 전체 99,999 피해 및 매 라운드 50골드 지급!)',
      skillType: 'GOLDEN_VAULT_BOMBARD',
      baseValueByStar: [240, 420, 900],
      secondaryValueByStar: [1, 2, 4],
      manaLockMs: 1100,
    },
  },
  u5_kairos: {
    id: 'u5_kairos',
    name: '야수왕 카이로스',
    cost: 5,
    traits: ['BEASTKIN', 'BERSERKER'],
    icon: '🪓',
    stats: {
      hp: 1312,
      atk: 120,
      def: 55,
      atkSpeed: 0.86,
      range: 1,
      startMana: 25,
      maxMana: 90,
    },
    skill: {
      name: '야수왕의 학살',
      description: '광폭화하며 전방 광역을 연속으로 찢어발깁니다. 처치 시 지속 시간이 갱신되고 흡혈이 크게 상승합니다.',
      skillType: 'EXECUTE_RESET',
      baseValueByStar: [400, 700, 1500],
      manaLockMs: 1000,
    },
  },
  u5_luciel: {
    id: 'u5_luciel',
    name: '타락한 대천사 루시엘',
    cost: 5,
    traits: ['HOLY_EMPIRE', 'UNDEAD_SCOURGE', 'RANGER'],
    icon: '👼',
    stats: {
      hp: 1080,
      atk: 103,
      def: 46,
      atkSpeed: 0.92,
      range: 4,
      startMana: 40,
      maxMana: 85,
    },
    skill: {
      name: '빛과 어둠의 심판 난사',
      description: '빛과 어둠의 쌍권총으로 전장의 모든 적에게 동시에 심판의 탄환을 난사합니다. (3성 달성 시: 타겟당 50,000 피해로 전장 즉각 정화!)',
      skillType: 'JUDGMENT_BARRAGE',
      baseValueByStar: [270, 480, 1100],
      manaLockMs: 950,
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
  /** 상징: 장착 유닛에게 부여하는 시너지 */
  grantsTrait?: TraitId;
}

export const BASE_ITEM_IDS: BaseItemId[] = ['SWORD', 'BOW', 'ROD', 'TEAR', 'ARMOR', 'SPATULA'];
/** 일반 드롭/랜덤용 (뒤집개는 희귀 — 증강·특수 경로) */
export const STANDARD_BASE_ITEM_IDS: BaseItemId[] = ['SWORD', 'BOW', 'ROD', 'TEAR', 'ARMOR'];

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
  SPATULA: {
    id: 'SPATULA',
    name: '뒤집개',
    isCompleted: false,
    icon: '🥄',
    description: '다른 기본 재료와 조합하면 계열 상징을 제작합니다.',
    stats: {},
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
    description: '공격력 +25, 공격 속도 +20%. 최대 체력이 1,300 이상인 거대 적에게 주는 모든 피해가 35% 증가합니다.',
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
    description: '주문력 +25%, 시작 마나 +15. 전투 중 매 3초마다 주문력이 +25%씩 영구 상승합니다.',
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
    description: '방어력 +55, 체력 +150. 피격 시 주변 적들에게 120의 반사 피해를 입히고 치명타 추가 피해를 무효화합니다.',
    stats: { def: 55, hp: 150 },
    passiveFlags: { brambleReflect: true },
  },

  // ---- V2.1 상징 (문장) — 프리즘 계열은 뒤집개 조합, 나머지는 증강 지급 ----
  EMBLEM_HOLY_EMPIRE: {
    id: 'EMBLEM_HOLY_EMPIRE',
    name: '신성 제국의 상징',
    isCompleted: true,
    components: ['SPATULA', 'ARMOR'],
    icon: '🛡️',
    description: '장착 시 [신성 제국] 시너지를 얻습니다.',
    stats: { def: 20 },
    passiveFlags: {},
    grantsTrait: 'HOLY_EMPIRE',
  },
  EMBLEM_ABYSSAL_DEMON: {
    id: 'EMBLEM_ABYSSAL_DEMON',
    name: '심연의 상징',
    isCompleted: true,
    components: ['SPATULA', 'SWORD'],
    icon: '👿',
    description: '장착 시 [심연의 악마] 시너지를 얻습니다.',
    stats: { atk: 15 },
    passiveFlags: {},
    grantsTrait: 'ABYSSAL_DEMON',
  },
  EMBLEM_ELVEN_SYLVAN: {
    id: 'EMBLEM_ELVEN_SYLVAN',
    name: '엘프 숲의 상징',
    isCompleted: true,
    components: ['SPATULA', 'BOW'],
    icon: '🌿',
    description: '장착 시 [엘프 숲] 시너지를 얻습니다.',
    stats: { atkSpeed: 0.15 },
    passiveFlags: {},
    grantsTrait: 'ELVEN_SYLVAN',
  },
  EMBLEM_UNDEAD_SCOURGE: {
    id: 'EMBLEM_UNDEAD_SCOURGE',
    name: '언데드 군단의 상징',
    isCompleted: true,
    components: ['SPATULA', 'TEAR'],
    icon: '💀',
    description: '장착 시 [언데드 군단] 시너지를 얻습니다.',
    stats: { startMana: 15 },
    passiveFlags: {},
    grantsTrait: 'UNDEAD_SCOURGE',
  },
  EMBLEM_ARCANE_TOWER: {
    id: 'EMBLEM_ARCANE_TOWER',
    name: '마탑의 상징',
    isCompleted: true,
    components: ['SPATULA', 'ROD'],
    icon: '🔮',
    description: '장착 시 [마탑] 시너지를 얻습니다.',
    stats: { spellPower: 0.2 },
    passiveFlags: {},
    grantsTrait: 'ARCANE_TOWER',
  },
  EMBLEM_BEASTKIN: {
    id: 'EMBLEM_BEASTKIN',
    name: '야수혈족의 상징',
    isCompleted: true,
    components: ['SPATULA', 'SPATULA'],
    icon: '🐺',
    description: '장착 시 [야수혈족] 시너지를 얻습니다.',
    stats: { hp: 200, omnivamp: 0.08 },
    passiveFlags: {},
    grantsTrait: 'BEASTKIN',
  },
  EMBLEM_GOLDEN_GOBLIN: {
    id: 'EMBLEM_GOLDEN_GOBLIN',
    name: '황금 고블린의 상징',
    isCompleted: true,
    icon: '🪙',
    description: '장착 시 [황금 고블린] 시너지를 얻습니다. (증강 지급)',
    stats: { atk: 10 },
    passiveFlags: {},
    grantsTrait: 'GOLDEN_GOBLIN',
  },
  EMBLEM_DRAGONKIN: {
    id: 'EMBLEM_DRAGONKIN',
    name: '용족의 상징',
    isCompleted: true,
    icon: '🐉',
    description: '장착 시 [용족] 시너지를 얻습니다. (증강 지급)',
    stats: { atk: 15 },
    passiveFlags: {},
    grantsTrait: 'DRAGONKIN',
  },
  EMBLEM_VANGUARD: {
    id: 'EMBLEM_VANGUARD',
    name: '선봉대의 상징',
    isCompleted: true,
    icon: '🏰',
    description: '장착 시 [선봉대] 시너지를 얻습니다. (증강 지급)',
    stats: { def: 25 },
    passiveFlags: {},
    grantsTrait: 'VANGUARD',
  },
  EMBLEM_BERSERKER: {
    id: 'EMBLEM_BERSERKER',
    name: '광전사의 상징',
    isCompleted: true,
    icon: '🪓',
    description: '장착 시 [광전사] 시너지를 얻습니다. (증강 지급)',
    stats: { atk: 20 },
    passiveFlags: {},
    grantsTrait: 'BERSERKER',
  },
  EMBLEM_RANGER: {
    id: 'EMBLEM_RANGER',
    name: '순찰자의 상징',
    isCompleted: true,
    icon: '🏹',
    description: '장착 시 [순찰자] 시너지를 얻습니다. (증강 지급)',
    stats: { atkSpeed: 0.15 },
    passiveFlags: {},
    grantsTrait: 'RANGER',
  },
  EMBLEM_ARCHMAGE: {
    id: 'EMBLEM_ARCHMAGE',
    name: '대마법사의 상징',
    isCompleted: true,
    icon: '⚡',
    description: '장착 시 [대마법사] 시너지를 얻습니다. (증강 지급)',
    stats: { spellPower: 0.25 },
    passiveFlags: {},
    grantsTrait: 'ARCHMAGE',
  },
  EMBLEM_SHADOW_ASSASSIN: {
    id: 'EMBLEM_SHADOW_ASSASSIN',
    name: '그림자 암살자의 상징',
    isCompleted: true,
    icon: '🗡️',
    description: '장착 시 [그림자 암살자] 시너지를 얻습니다. (증강 지급)',
    stats: { critChance: 0.15 },
    passiveFlags: {},
    grantsTrait: 'SHADOW_ASSASSIN',
  },
  EMBLEM_PALADIN: {
    id: 'EMBLEM_PALADIN',
    name: '성기사의 상징',
    isCompleted: true,
    icon: '✨',
    description: '장착 시 [성기사] 시너지를 얻습니다. (증강 지급)',
    stats: { hp: 150 },
    passiveFlags: {},
    grantsTrait: 'PALADIN',
  },
  EMBLEM_ARTIFICER: {
    id: 'EMBLEM_ARTIFICER',
    name: '기술자의 상징',
    isCompleted: true,
    icon: '🔧',
    description: '장착 시 [기술자] 시너지를 얻습니다. (증강 지급)',
    stats: { def: 15, startMana: 10 },
    passiveFlags: {},
    grantsTrait: 'ARTIFICER',
  },
  EMBLEM_STRATEGIST: {
    id: 'EMBLEM_STRATEGIST',
    name: '전술가의 상징',
    isCompleted: true,
    icon: '♟️',
    description: '장착 시 [전술가] 시너지를 얻습니다. (증강 지급)',
    stats: { spellPower: 0.15, atk: 10 },
    passiveFlags: {},
    grantsTrait: 'STRATEGIST',
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
    SPATULA: 'EMBLEM_ABYSSAL_DEMON',
  },
  BOW: {
    SWORD: 'GIANT_SLAYER',
    BOW: 'RAPID_FIRECANNON',
    ROD: 'GUINSOOS_RAGEBLADE',
    TEAR: 'STATIKK_SHIV',
    ARMOR: 'TITANS_RESOLVE',
    SPATULA: 'EMBLEM_ELVEN_SYLVAN',
  },
  ROD: {
    SWORD: 'HEXTECH_GUNBLADE',
    BOW: 'GUINSOOS_RAGEBLADE',
    ROD: 'RABADONS_DEATHCAP',
    TEAR: 'ARCHANGELS_STAFF',
    ARMOR: 'SUNFIRE_CAPE',
    SPATULA: 'EMBLEM_ARCANE_TOWER',
  },
  TEAR: {
    SWORD: 'SPEAR_OF_SHOJIN',
    BOW: 'STATIKK_SHIV',
    ROD: 'ARCHANGELS_STAFF',
    TEAR: 'BLUE_BUFF',
    ARMOR: 'PROTECTORS_VOW',
    SPATULA: 'EMBLEM_UNDEAD_SCOURGE',
  },
  ARMOR: {
    SWORD: 'BLOODTHIRSTER',
    BOW: 'TITANS_RESOLVE',
    ROD: 'SUNFIRE_CAPE',
    TEAR: 'PROTECTORS_VOW',
    ARMOR: 'BRAMBLE_VEST',
    SPATULA: 'EMBLEM_HOLY_EMPIRE',
  },
  SPATULA: {
    SWORD: 'EMBLEM_ABYSSAL_DEMON',
    BOW: 'EMBLEM_ELVEN_SYLVAN',
    ROD: 'EMBLEM_ARCANE_TOWER',
    TEAR: 'EMBLEM_UNDEAD_SCOURGE',
    ARMOR: 'EMBLEM_HOLY_EMPIRE',
    SPATULA: 'EMBLEM_BEASTKIN',
  },
};


export function combineBaseItems(itemA: BaseItemId, itemB: BaseItemId): CompletedItemId {
  return ITEM_COMBINATION_MATRIX[itemA][itemB];
}

/** 아이템에서 상징(문장)이 부여하는 시너지 목록 */
export function getEmblemTraitsFromItems(items: ItemId[]): TraitId[] {
  const out: TraitId[] = [];
  for (const itemId of items) {
    const trait = ITEM_DEFINITIONS[itemId]?.grantsTrait;
    if (trait && !out.includes(trait)) out.push(trait);
  }
  return out;
}

/** 템플릿 traits + 상징 장착 traits (중복 제거) */
export function getEffectiveUnitTraits(baseTraits: TraitId[], items: ItemId[]): TraitId[] {
  const merged = [...baseTraits];
  for (const t of getEmblemTraitsFromItems(items)) {
    if (!merged.includes(t)) merged.push(t);
  }
  return merged;
}

export function traitIdToEmblemItem(traitId: TraitId): CompletedItemId | null {
  const map: Partial<Record<TraitId, CompletedItemId>> = {
    HOLY_EMPIRE: 'EMBLEM_HOLY_EMPIRE',
    ABYSSAL_DEMON: 'EMBLEM_ABYSSAL_DEMON',
    ELVEN_SYLVAN: 'EMBLEM_ELVEN_SYLVAN',
    UNDEAD_SCOURGE: 'EMBLEM_UNDEAD_SCOURGE',
    ARCANE_TOWER: 'EMBLEM_ARCANE_TOWER',
    BEASTKIN: 'EMBLEM_BEASTKIN',
    GOLDEN_GOBLIN: 'EMBLEM_GOLDEN_GOBLIN',
    DRAGONKIN: 'EMBLEM_DRAGONKIN',
    VANGUARD: 'EMBLEM_VANGUARD',
    BERSERKER: 'EMBLEM_BERSERKER',
    RANGER: 'EMBLEM_RANGER',
    ARCHMAGE: 'EMBLEM_ARCHMAGE',
    SHADOW_ASSASSIN: 'EMBLEM_SHADOW_ASSASSIN',
    PALADIN: 'EMBLEM_PALADIN',
    ARTIFICER: 'EMBLEM_ARTIFICER',
    STRATEGIST: 'EMBLEM_STRATEGIST',
  };
  return map[traitId] ?? null;
}



/**
 * 완성 아이템을 만들기 위해 필요한 기본 아이템 2종 반환 (없으면 null)
 */
export function getRecipeForCompletedItem(completedId: CompletedItemId): [BaseItemId, BaseItemId] | null {
  for (const a of BASE_ITEM_IDS) {
    for (const b of BASE_ITEM_IDS) {
      if (ITEM_COMBINATION_MATRIX[a][b] === completedId) {
        return [a, b];
      }
    }
  }
  return null;
}


/**
 * 60종 판타지 챔피언별 실제 TFT 기준 최적 추천 완성 아이템(BiS: Best in Slot) 3종 매핑
 */
export const CHAMPION_RECOMMENDED_ITEMS: Record<string, [CompletedItemId, CompletedItemId, CompletedItemId]> = {
  u1_garen: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'PROTECTORS_VOW'],
  u1_valen: ['SUNFIRE_CAPE', 'PROTECTORS_VOW', 'BRAMBLE_VEST'],
  u1_imp: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'ARCHANGELS_STAFF'],
  u1_ember: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'TITANS_RESOLVE'],
  u1_aria: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
  u1_thorn: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'PROTECTORS_VOW'],
  u1_whelp: ['TITANS_RESOLVE', 'SPEAR_OF_SHOJIN', 'SUNFIRE_CAPE'],
  u1_skel: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'INFINITY_EDGE'],
  u1_ghoul: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'GIANT_SLAYER'],
  u1_lumi: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'ARCHANGELS_STAFF'],
  u1_pip: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'GIANT_SLAYER'],
  u1_fang: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'INFINITY_EDGE'],
  u1_tusk: ['SUNFIRE_CAPE', 'PROTECTORS_VOW', 'BRAMBLE_VEST'],
  u2_jeanne: ['SUNFIRE_CAPE', 'PROTECTORS_VOW', 'SPEAR_OF_SHOJIN'],
  u2_vayne: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
  u2_kyle: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'STATIKK_SHIV'],
  u2_zephyr: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'GIANT_SLAYER'],
  u2_elowen: ['SPEAR_OF_SHOJIN', 'PROTECTORS_VOW', 'ARCHANGELS_STAFF'],
  u2_ent: ['SUNFIRE_CAPE', 'PROTECTORS_VOW', 'BRAMBLE_VEST'],
  u2_pyre: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'INFINITY_EDGE'],
  u2_zed: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'GIANT_SLAYER'],
  u2_boulder: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'TITANS_RESOLVE'],
  u2_tink: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'ARCHANGELS_STAFF'],
  u2_boom: ['SPEAR_OF_SHOJIN', 'STATIKK_SHIV', 'GUINSOOS_RAGEBLADE'],
  u2_claw: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'GIANT_SLAYER'],
  u2_howl: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'BLUE_BUFF'],
  u3_leona: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'PROTECTORS_VOW'],
  u3_nyx: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'HEXTECH_GUNBLADE'],
  u3_sylphie: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'ARCHANGELS_STAFF'],
  u3_kazu: ['INFINITY_EDGE', 'GUINSOOS_RAGEBLADE', 'BLOODTHIRSTER'],
  u3_sieg: ['SUNFIRE_CAPE', 'TITANS_RESOLVE', 'BRAMBLE_VEST'],
  u3_drake: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'INFINITY_EDGE'],
  u3_fenrir: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'SUNFIRE_CAPE'],
  u3_quartz: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'SPEAR_OF_SHOJIN'],
  u3_orion: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'SPEAR_OF_SHOJIN'],
  u3_grom: ['BLOODTHIRSTER', 'INFINITY_EDGE', 'TITANS_RESOLVE'],
  u3_grizzle: ['SUNFIRE_CAPE', 'PROTECTORS_VOW', 'BRAMBLE_VEST'],
  u3_bramble: ['SPEAR_OF_SHOJIN', 'TITANS_RESOLVE', 'SUNFIRE_CAPE'],
  u3_pack: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
  u4_arthur: ['BLOODTHIRSTER', 'INFINITY_EDGE', 'TITANS_RESOLVE'],
  u4_astaroth: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'HEXTECH_GUNBLADE'],
  u4_sylph: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
  u4_artemis: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
  u4_fafnir: ['SUNFIRE_CAPE', 'PROTECTORS_VOW', 'TITANS_RESOLVE'],
  u4_lichking: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'BLUE_BUFF'],
  u4_merlin: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'ARCHANGELS_STAFF'],
  u4_chrona: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'PROTECTORS_VOW'],
  u4_midas: ['SPEAR_OF_SHOJIN', 'ARCHANGELS_STAFF', 'HEXTECH_GUNBLADE'],
  u4_snatch: ['GUINSOOS_RAGEBLADE', 'STATIKK_SHIV', 'SPEAR_OF_SHOJIN'],
  u4_ursa: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'SUNFIRE_CAPE'],
  u4_bone: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'TITANS_RESOLVE'],
  u4_celeste: ['SPEAR_OF_SHOJIN', 'GUINSOOS_RAGEBLADE', 'ARCHANGELS_STAFF'],
  u5_michael: ['SUNFIRE_CAPE', 'PROTECTORS_VOW', 'BRAMBLE_VEST'],
  u5_lilith: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'GIANT_SLAYER'],
  u5_yggdrasil: ['SUNFIRE_CAPE', 'PROTECTORS_VOW', 'SPEAR_OF_SHOJIN'],
  u5_ignis: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'INFINITY_EDGE'],
  u5_bahamut: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'ARCHANGELS_STAFF'],
  u5_goldtooth: ['SPEAR_OF_SHOJIN', 'TITANS_RESOLVE', 'GUINSOOS_RAGEBLADE'],
  u5_kairos: ['BLOODTHIRSTER', 'INFINITY_EDGE', 'TITANS_RESOLVE'],
  u5_luciel: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
};


export function getUnitRecommendedItems(unitId: string): CompletedItemId[] {
  return CHAMPION_RECOMMENDED_ITEMS[unitId] ?? ['INFINITY_EDGE', 'BLOODTHIRSTER', 'SUNFIRE_CAPE'];
}

// ============================================================================
// E. 증강체 정의 (AUGMENT_DEFINITIONS - 실버/골드/프리즘, TFT S18 적응)
// ============================================================================

export type AugmentCategory = 'ECONOMY' | 'COMBAT' | 'HERO' | 'TRAIT';
export type AugmentStage = '2-1' | '3-2' | '4-2';

export type AugmentEffectKey =
  | 'PANDORA_BENCH'
  | 'CYBERNETIC_IMPLANT'
  | 'BATTLE_MAGE'
  | 'TINY_TITANS'
  | 'WARMUP'
  | 'CLEARANCE_SALE'
  | 'HERO_GAREN'
  | 'HERO_PIP'
  | 'GOLDEN_TICKET'
  | 'DIABOLIC_FINANCE'
  | 'CELESTIAL_BLESSING'
  | 'CELESTIAL_BLESSING_2'
  | 'CELESTIAL_BLESSING_3'
  | 'HERO_JEANNE'
  | 'HERO_ORION'
  | 'HERO_DRAKE'
  | 'HERO_MALAKOR'
  | 'MARTIAL_TRAINING'
  | 'ASCENSION'
  | 'STAND_UNITED'
  | 'EMPIRE_CREST'
  | 'VANGUARD_CREST'
  | 'ARCHMAGE_CREST'
  | 'DEMON_CREST'
  | 'ELVEN_CREST'
  | 'DRAGON_CREST'
  | 'LEVEL_UP'
  | 'FATED_DUPLICATION'
  | 'GOBLIN_CROWN'
  | 'ARCANE_CREST'
  | 'VANGUARD_CROWN'
  | 'EMPIRE_CROWN'
  | 'GOLDEN_EGG'
  | 'HEDGE_FUND'
  | 'STAND_UNITED_1'
  | 'STAND_UNITED_2'
  | 'STAND_UNITED_3'
  | 'REROLL_DAY'
  | 'KINGSLAYER'
  | 'BOXING_LESSON'
  | 'MAKE_WAY'
  | 'GROUP_HUG'
  | 'GROUP_HUG_2'
  | 'THIEF_GLOVES'
  | 'THIEF_GLOVES_2'
  | 'INCOMPLETE_ASCENSION'
  | 'GUARDIAN_FRIEND'
  | 'COLD_START'
  | 'TWIN_GUARDIAN'
  | 'ITEM_PACK_1'
  | 'MYSTIC_DICE'
  | 'USEFUL_METAL'
  | 'SILVER_DESTINY'
  | 'SILVER_DESTINY_PLUS'
  | 'SILVER_DESTINY_PLUSPLUS'
  | 'DAILY_LIFE'
  | 'CAPITAL_GAIN_1'
  | 'CAPITAL_GAIN_2'
  | 'SMALL_PACK'
  | 'PATIENCE_REWARD'
  | 'CHAMP_DELIVERY'
  | 'CHAMP_DELIVERY_PLUS'
  | 'CHAMP_DELIVERY_PLUSPLUS'
  | 'CORROSION'
  | 'GLASS_CANNON'
  | 'GLASS_CANNON_2'
  | 'SILVER_SPOON'
  | 'MAKESHIFT_ARMOR'
  | 'MAKESHIFT_ARMOR_2'
  | 'CALCULATED_LOSS'
  | 'TRADE_SECTOR'
  | 'TRADE_SECTOR_PLUS'
  | 'JEWELED_LOTUS'
  | 'JEWELED_LOTUS_2'
  | 'HYPER_ROLL'
  | 'GOLDEN_SCALPEL'
  | 'RICH_GET_RICHER'
  | 'LAST_STAND'
  | 'METEORIC_IMPACT'
  | 'REIGN_OF_CHAOS'
  | 'TACTICAL_RETREAT'
  | 'OVERFLOWING_BLADE'
  | 'OVERFLOWING_ROD'
  | 'OVERFLOWING_BELT'
  | 'HEROIC_INSPIRATION'
  | 'TITANIC_FORCE'
  | 'WARP_DRIVE'
  | 'PRISMATIC_TICKET'
  | 'MONEY_STORM'
  | 'ARCANE_VICTORY'
  | 'CORONATION'
  | 'BIRTHDAY_PRESENT'
  | 'RADIANT_RELICS'
  | 'LIVING_FORGE'
  | 'CURSED_CROWN'
  | 'FINAL_ASCENSION'
  | 'SHADOW_CLONE'
  | 'LATE_SPECIALIST'
  | 'TAXATION'
  | 'TAXATION_PLUS'
  | 'LUCKY_DICE'
  | 'ONE_TWO_THREE'
  | 'PASSIVE_HP'
  | 'PASSIVE_HP_PLUS'
  | 'PASSIVE_HP_PLUSPLUS'
  | 'FOCUS_FIRE'
  | 'CENTER_STAGE'
  | 'HEALING_ORB_1'
  | 'HEALING_ORB_2'
  | 'ELECTRIC_1'
  | 'ELECTRIC_2'
  | 'CRAFT_REROLL'
  | 'BOOSTER_PACK'
  | 'BOOSTER_PACK_PLUS'
  | 'BOOSTER_PACK_PLUSPLUS'
  | 'EPIC_REROLL'
  | 'EXPLOSIVE_GROWTH'
  | 'EXPLOSIVE_GROWTH_PLUS'
  | 'GOLDEN_DESTINY'
  | 'GOLDEN_DESTINY_PLUS'
  | 'PRISMATIC_DESTINY'
  | 'PRISMATIC_DESTINY_PLUS'
  | 'CLEAR_MIND'
  | 'CROWDED_MIND'
  | 'INVESTMENT'
  | 'INVESTMENT_PLUS'
  | 'MAXED_OUT'
  | 'NEW_ERA'
  | 'NEW_ERA_PLUS'
  | 'HIGH_END_SHOPPING'
  | 'HIGH_END_SHOPPING_PLUS'
  | 'BINARY_AERODROME'
  | 'LARGE_AND_IN_CHARGE'
  | 'PHALANX'
  | 'LATER_GROWTH'
  | 'WINDFALL'
  | 'BUILD_A_BUDDY'
  | 'FORGE_A_FRIEND'
  | 'PORTABLE_FORGE'
  | 'GARGANTUAN_RESOLVE'
  | 'SWORD_CRAFT'
  | 'ROD_CRAFT'
  | 'PANDORA_ITEMS'
  | 'PANDORA_ITEMS_2'
  | 'EXTRABUCKLE'
  | 'SPARE_BOW'
  | 'FLOWING_TEARS'
  | 'PREDICTED_RESULT'
  | 'FAST_STREAK'
  | 'CAREFUL_CRAFTING'
  | 'TINY_TITANS_PLUS'
  | 'HEDGE_FUND_GOLD'
  | 'IMMEDIATE_ONLY';

export interface AugmentDefinition {
  id: string;
  name: string;
  tier: AugmentTier;
  category: AugmentCategory;
  effectKey: AugmentEffectKey;
  icon: string;
  description: string;
  /** 비우면 2-1/3-2/4-2 모두 출현. 지정하면 해당 단계에만 출현. */
  offeredStages?: AugmentStage[];
  heroUnitId?: string;
  bonusTrait?: TraitId;
  bonusTraitCount?: number;
  immediateGold?: number;
  immediateDuplicators?: number;
  immediateBaseItems?: BaseItemId[];
  immediateCompletedItems?: CompletedItemId[];
  immediateUnitId?: string;
  immediateUnitIds?: string[];
  immediateUnitStarLevel?: number;
  immediateRandomBaseItems?: number;
  immediateRandomCompletedItems?: number;
  immediateRandomUnits?: Array<{ cost: CostTier; count: number; starLevel?: number }>;
  immediateXp?: number;
  immediateHp?: number;
  freeRerollsGranted?: number;
  /** 은빛/금빛/프리즘 운명: 같은 등급 랜덤 증강 1장 추가 부여 */
  grantRandomAugmentTier?: AugmentTier;
}

export { AUGMENT_DEFINITIONS } from './AugmentCatalog';
