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
  1: 22,
  2: 20,
  3: 17,
  4: 10,
  5: 9,
};

/**
 * 레벨 1~9 각 코스트(1~5) 상점 등장 확률 (%)
 * 배열 인덱스 0 -> 1코스트, 1 -> 2코스트, 2 -> 3코스트, 3 -> 4코스트, 4 -> 5코스트
 */
export const SHOP_ODDS_BY_LEVEL: Record<number, [number, number, number, number, number]> = {
  1: [100, 0, 0, 0, 0],
  2: [100, 0, 0, 0, 0],
  3: [75, 25, 0, 0, 0],
  4: [55, 30, 15, 0, 0],
  5: [45, 33, 20, 2, 0],
  6: [30, 40, 25, 5, 0],
  7: [19, 30, 35, 15, 1],
  8: [16, 20, 35, 25, 4],
  9: [9, 15, 30, 30, 16],
};

/**
 * 해당 레벨 달성에 필요한 누적/구간 경험치 테이블
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
    2: { hpMult: 1.8, atkMult: 1.8, skillMult: 1.0 },
    3: { hpMult: 3.24, atkMult: 3.24, skillMult: 1.0 },
  },
  2: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.8, atkMult: 1.8, skillMult: 1.0 },
    3: { hpMult: 3.24, atkMult: 3.24, skillMult: 1.0 },
  },
  3: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.8, atkMult: 1.8, skillMult: 1.0 },
    3: { hpMult: 3.24, atkMult: 3.24, skillMult: 1.0 },
  },
  4: {
    1: { hpMult: 1.0, atkMult: 1.0, skillMult: 1.0 },
    2: { hpMult: 1.8, atkMult: 1.8, skillMult: 1.0 },
    3: { hpMult: 3.24, atkMult: 3.24, skillMult: 1.0 },
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
    thresholds: [2, 4, 6],
    description:
      '전투 시작 시 제국 기물들이 최대 체력 비례 신성 보호막(Shield)을 얻고 방어력이 증가합니다.',
    effects: [
      { threshold: 2, label: '(2) 최대 체력 20% 보호막, 방어력 +25', shieldMaxHpRatio: 0.2, bonusDef: 25 },
      { threshold: 4, label: '(4) 최대 체력 40% 보호막, 방어력 +55', shieldMaxHpRatio: 0.4, bonusDef: 55 },
      { threshold: 6, label: '(6) 최대 체력 75% 보호막, 방어력 +100', shieldMaxHpRatio: 0.75, bonusDef: 100 },
    ],
  },
  ABYSSAL_DEMON: {
    id: 'ABYSSAL_DEMON',
    name: '심연의 악마',
    type: 'ORIGIN',
    icon: '👿',
    color: '#C0392B',
    thresholds: [2, 4, 6],
    description:
      '악마 기물들의 기본 공격 및 스킬이 적에게 추가 고정 피해(True Damage)를 입히고 모든 피해 흡혈(Omnivamp)을 얻습니다.',
    effects: [
      { threshold: 2, label: '(2) 추가 고정 피해 15%, 모든 피해 흡혈 12%', trueDamageRatio: 0.15, omnivamp: 0.12 },
      { threshold: 4, label: '(4) 추가 고정 피해 32%, 모든 피해 흡혈 22%', trueDamageRatio: 0.32, omnivamp: 0.22 },
      { threshold: 6, label: '(6) 추가 고정 피해 60%, 모든 피해 흡혈 38%', trueDamageRatio: 0.6, omnivamp: 0.38 },
    ],
  },
  ELVEN_SYLVAN: {
    id: 'ELVEN_SYLVAN',
    name: '엘프 숲',
    type: 'ORIGIN',
    icon: '🌿',
    color: '#2ECC71',
    thresholds: [2, 4, 6],
    description:
      '매 2초마다 엘프 기물의 공격 속도가 중첩되어 빨라지며 최대 체력의 일정 비율을 회복합니다.',
    effects: [
      { threshold: 2, label: '(2) 2초마다 공속 +8%, 최대 체력 4% 회복', atkSpeedPerStack: 0.08, hpRegenRatioPerTick: 0.04 },
      { threshold: 4, label: '(4) 2초마다 공속 +16%, 최대 체력 8% 회복', atkSpeedPerStack: 0.16, hpRegenRatioPerTick: 0.08 },
      { threshold: 6, label: '(6) 2초마다 공속 +30%, 최대 체력 15% 회복', atkSpeedPerStack: 0.3, hpRegenRatioPerTick: 0.15 },
    ],
  },
  DRAGONKIN: {
    id: 'DRAGONKIN',
    name: '용족',
    type: 'ORIGIN',
    icon: '🐉',
    color: '#E67E22',
    thresholds: [2, 3, 4],
    description:
      '전투 시작 시 화염 숨결로 적 전체에게 최대 체력 비례 화상 피해를 입히고, 용족 기물의 스킬 치명타가 활성화됩니다.',
    effects: [
      {
        threshold: 2,
        label: '(2) 개전 화상 12%, 스킬 치명타 활성화 (+15% 치명타 피해)',
        initialBurnMaxHpRatio: 0.12,
        enableSkillCrit: true,
        bonusCritDamage: 0.15,
      },
      {
        threshold: 3,
        label: '(3) 개전 화상 22%, 스킬 치명타 활성화 (+35% 치명타 피해)',
        initialBurnMaxHpRatio: 0.22,
        enableSkillCrit: true,
        bonusCritDamage: 0.35,
      },
      {
        threshold: 4,
        label: '(4) 개전 화상 38%, 스킬 치명타 활성화 (+70% 치명타 피해)',
        initialBurnMaxHpRatio: 0.38,
        enableSkillCrit: true,
        bonusCritDamage: 0.7,
      },
    ],
  },
  UNDEAD_SCOURGE: {
    id: 'UNDEAD_SCOURGE',
    name: '언데드 군단',
    type: 'ORIGIN',
    icon: '💀',
    color: '#8E44AD',
    thresholds: [2, 4, 6],
    description:
      '전투 중 최초 사망 시 2초 뒤 지정된 체력 상태로 1회 부활(Revive)하며 공격 속도가 폭증합니다.',
    effects: [
      { threshold: 2, label: '(2) 최대 체력 40% 부활, 부활 후 공속 +35%', reviveHpRatio: 0.4, reviveBonusAtkSpeed: 0.35 },
      { threshold: 4, label: '(4) 최대 체력 70% 부활, 부활 후 공속 +65%', reviveHpRatio: 0.7, reviveBonusAtkSpeed: 0.65 },
      { threshold: 6, label: '(6) 최대 체력 100% 부활, 부활 후 공속 +120%', reviveHpRatio: 1.0, reviveBonusAtkSpeed: 1.2 },
    ],
  },
  ARCANE_TOWER: {
    id: 'ARCANE_TOWER',
    name: '마탑',
    type: 'ORIGIN',
    icon: '🔮',
    color: '#3498DB',
    thresholds: [2, 4, 6],
    description:
      '아군 전체의 기본 공격 시 마나 회복량이 증가하고, 마탑 기물들의 주문력(Spell Power)이 대폭 상승합니다.',
    effects: [
      { threshold: 2, label: '(2) 아군 평타 마나 +3, 마탑 주문력 +25%', teamManaPerAttack: 3, spellPowerBonus: 0.25 },
      { threshold: 4, label: '(4) 아군 평타 마나 +6, 마탑 주문력 +55%', teamManaPerAttack: 6, spellPowerBonus: 0.55 },
      { threshold: 6, label: '(6) 아군 평타 마나 +12, 마탑 주문력 +100%', teamManaPerAttack: 12, spellPowerBonus: 1.0 },
    ],
  },
  GOLDEN_GOBLIN: {
    id: 'GOLDEN_GOBLIN',
    name: '황금 고블린',
    type: 'ORIGIN',
    icon: '🪙',
    color: '#F1C40F',
    thresholds: [3, 5],
    description:
      '전투 패배 시 금고 스택(Vault Stacks)이 기하급수적으로 축적됩니다. 전투 승리 시 금고가 폭발(Cash-out)하며 누적 스택에 비례한 초호화 전리품 구슬이 쏟아집니다!',
    effects: [
      { threshold: 3, label: '(3) 패배 시 기본 금고 스택 축적 (1.0x), 승리 시 금고 개봉!', goblinStackMultiplier: 1.0 },
      { threshold: 5, label: '(5) 패배 시 금고 스택 2배 축적 (2.0x), 황금/프리즘 보물 대폭 증가!', goblinStackMultiplier: 2.0 },
    ],
  },

  // ---- 직업(Class) 6종 ----
  VANGUARD: {
    id: 'VANGUARD',
    name: '선봉대',
    type: 'CLASS',
    icon: '🏰',
    color: '#95A5A6',
    thresholds: [2, 4, 6],
    description:
      '방어력이 대폭 증가하며 전투 시작 후 8초간 받는 모든 피해량이 30% 추가 감소합니다.',
    effects: [
      { threshold: 2, label: '(2) 방어력 +40, 개전 8초간 피해 감소 30%', bonusDef: 40, damageReductionFirst8s: 0.3 },
      { threshold: 4, label: '(4) 방어력 +90, 개전 8초간 피해 감소 30%', bonusDef: 90, damageReductionFirst8s: 0.3 },
      { threshold: 6, label: '(6) 방어력 +180, 개전 8초간 피해 감소 30%', bonusDef: 180, damageReductionFirst8s: 0.3 },
    ],
  },
  BERSERKER: {
    id: 'BERSERKER',
    name: '광전사',
    type: 'CLASS',
    icon: '🪓',
    color: '#E74C3C',
    thresholds: [2, 4, 6],
    description:
      '체력이 50% 이하로 내려가면 광폭화하여 공격력과 공격속도가 2배로 증가하고 기본 공격이 주변 1칸에 스플래시 피해를 입힙니다.',
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
    ],
  },
  RANGER: {
    id: 'RANGER',
    name: '순찰자',
    type: 'CLASS',
    icon: '🏹',
    color: '#27AE60',
    thresholds: [2, 4],
    description:
      '기본 공격 3회마다 관통 화살을 추가로 발사하며 사거리가 +1 증가합니다.',
    effects: [
      { threshold: 2, label: '(2) 사거리 +1, 3타마다 공격력 135% 관통 화살 발사', bonusRange: 1, pierceArrowDamageRatio: 1.35 },
      { threshold: 4, label: '(4) 사거리 +1, 3타마다 공격력 240% 관통 화살 발사', bonusRange: 1, pierceArrowDamageRatio: 2.4 },
    ],
  },
  ARCHMAGE: {
    id: 'ARCHMAGE',
    name: '대마법사',
    type: 'CLASS',
    icon: '⚡',
    color: '#9B59B6',
    thresholds: [2, 4, 6],
    description:
      '주문력이 크게 증가하며, 최대 마나에 도달해 스킬을 시전할 때 체력이 가장 낮은 적에게 연쇄 번개를 추가로 떨어뜨립니다.',
    effects: [
      { threshold: 2, label: '(2) 주문력 +30%, 스킬 시전 시 180 연쇄 번개', spellPowerBonus: 0.3, chainLightningDamage: 180 },
      { threshold: 4, label: '(4) 주문력 +65%, 스킬 시전 시 380 연쇄 번개', spellPowerBonus: 0.65, chainLightningDamage: 380 },
      { threshold: 6, label: '(6) 주문력 +120%, 스킬 시전 시 750 연쇄 번개', spellPowerBonus: 1.2, chainLightningDamage: 750 },
    ],
  },
  SHADOW_ASSASSIN: {
    id: 'SHADOW_ASSASSIN',
    name: '그림자 암살자',
    type: 'CLASS',
    icon: '🗡️',
    color: '#34495E',
    thresholds: [2, 4],
    description:
      '전투 시작 시 적진 가장 뒷열(원거리 딜러 라인)로 은신 도약(Leap)하며 치명타 확률과 치명타 피해량이 대폭 증가합니다.',
    effects: [
      { threshold: 2, label: '(2) 후방 도약, 치명타 확률 +25%, 치명타 피해량 +35%', bonusCritChance: 0.25, bonusCritDamage: 0.35 },
      { threshold: 4, label: '(4) 후방 도약, 치명타 확률 +55%, 치명타 피해량 +75%', bonusCritChance: 0.55, bonusCritDamage: 0.75 },
    ],
  },
  PALADIN: {
    id: 'PALADIN',
    name: '성기사',
    type: 'CLASS',
    icon: '✨',
    color: '#F39C12',
    thresholds: [2, 3],
    description:
      '기본 공격 시 주변 아군의 체력을 회복시키고, 아군 전체에게 군중제어(기절) 지속시간 감소 또는 면역을 부여합니다.',
    effects: [
      { threshold: 2, label: '(2) 평타 시 주변 아군 65 회복, 아군 기절 지속시간 50% 감소', healPerAttack: 65, ccDurationReduction: 0.5 },
      { threshold: 3, label: '(3) 평타 시 주변 아군 150 회복, 아군 전체 군중제어 완전 면역', healPerAttack: 150, ccDurationReduction: 1.0 },
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
      hp: 500,
      atk: 55,
      def: 20,
      atkSpeed: 0.75,
      range: 1,
      startMana: 20,
      maxMana: 60,
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

  // --------------------------------------------------------------------------
  // 2코스트 (5종)
  // --------------------------------------------------------------------------
  u2_tink: {
    id: 'u2_tink',
    name: '고블린 연금술사 팅크',
    cost: 2,
    traits: ['GOLDEN_GOBLIN', 'ARCANE_TOWER'],
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
    traits: ['HOLY_EMPIRE', 'PALADIN'],
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
    traits: ['ELVEN_SYLVAN', 'VANGUARD'],
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

  // --------------------------------------------------------------------------
  // 3코스트 (4종)
  // --------------------------------------------------------------------------
  u3_grom: {
    id: 'u3_grom',
    name: '고블린 용병대장 그롬',
    cost: 3,
    traits: ['GOLDEN_GOBLIN', 'BERSERKER'],
    icon: '🪓',
    stats: {
      hp: 880,
      atk: 72,
      def: 40,
      atkSpeed: 0.7,
      range: 1,
      startMana: 30,
      maxMana: 85,
    },
    skill: {
      name: '황금욕의 대지분쇄',
      description: '거대한 도끼로 전방을 내려찍어 광역 물리 피해를 입힙니다. 보유 골드 10골드당 스킬 피해량이 15%씩 추가 증가합니다!',
      skillType: 'GOLD_SCALING_CLEAVE',
      baseValueByStar: [320, 500, 850],
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
      hp: 980,
      atk: 65,
      def: 60,
      atkSpeed: 0.6,
      range: 1,
      startMana: 40,
      maxMana: 95,
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

  // --------------------------------------------------------------------------
  // 4코스트 (3종 - 덱의 메인 캐리 및 메인 탱커)
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

  // --------------------------------------------------------------------------
  // 5코스트 (3종 - 전설 기물, 3성 달성 시 계수 20배 폭증 보드 전체 즉사급)
  // --------------------------------------------------------------------------
  u5_ignis: {
    id: 'u5_ignis',
    name: '고대 종말룡 이그니스',
    cost: 5,
    traits: ['DRAGONKIN', 'ABYSSAL_DEMON'],
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
    traits: ['GOLDEN_GOBLIN', 'PALADIN'],
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
