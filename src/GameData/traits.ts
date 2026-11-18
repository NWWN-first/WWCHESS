// src/GameData/traits.ts

import type { TraitId, TraitType } from './types';
import type { TraitKind } from './types';

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
  mercenaryStackMultiplier?: number;
  mercenaryCombatBonusHp?: number;
  mercenaryCombatBonusAtk?: number;
  mercenaryCombatBonusAtkSpeed?: number;
  mercenaryCombatDamageReduction?: number;
  mercenaryWinGoldMin?: number;
  mercenaryWinGoldMax?: number;
  mercenarySmallOrbChanceOnWin?: number;
  mercenaryWinStreakForGoldOrb?: number;
  mercenaryPerRoundJackpot?: boolean;
  mercenaryDiceCount?: number;
  mercenaryLootPerLoss?: number;
  mercenaryFiveCostUnitChance?: number;
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
  teamMaxHpRatio?: number;
  bonusAtkSpeed?: number;
  magicDamageReduction?: number;
  dodgeChance?: number;
  imperialDamageBonus?: number;
  sniperDamagePerHex?: number;
  sniperDamageCap?: number;
  twinShotProcChance?: number;
  twinShotSecondShotRatio?: number;
  chemtechDamageReduction?: number;
  chemtechRegenPerSec?: number;
  chemtechBurstDurationMs?: number;
  chemtechAtkSpeedBonus?: number;
  enchanterHealShieldMult?: number;
  challengerOnKillAsMult?: number;
  challengerOnKillDurationMs?: number;
}

export interface TraitDefinition {
  id: TraitId;
  name: string;
  type: TraitType;
  kind: TraitKind;
  icon: string;
  color: string;
  thresholds: number[];
  description: string;
  effects: TraitEffectTier[];
  boundUnitIds?: string[];
  nameEn?: string;
}

export const TRAIT_DEFINITIONS: Record<TraitId, TraitDefinition> = {
  SCRAP: {
    id: 'SCRAP',
    name: '고물상',
    type: 'ORIGIN',
    kind: 'NORMAL',
    icon: '🔩',
    color: '#95A5A6',
    thresholds: [2, 4, 6],
    description: 'TFT Set 6 고물상 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
      {
        threshold: 2,
        label: '(2) 착용 아이템당 실드 3% (최대 30%)',
      },
      {
        threshold: 4,
        label: '(4) 5% (최대 50%) + 고물상 DEF +15',
      },
      {
        threshold: 6,
        label: '(6) 8% (최대 80%) + 임시 변환 2슬롯',
      },
    ],
  },
  MUTANT: {
    id: 'MUTANT',
    name: '돌연변이',
    type: 'ORIGIN',
    kind: 'NORMAL',
    icon: '🧬',
    color: '#9B59B6',
    thresholds: [3, 5, 7],
    description: 'TFT Set 6 돌연변이 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 3,
                  "label": "(3) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 5,
                  "label": "(5) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 7,
                  "label": "(7) Set 6 — 엔진 스텁 (카운트만)"
            }
      ],
  },
  SYNDICATE: {
    id: 'SYNDICATE',
    name: '범죄조직',
    type: 'ORIGIN',
    kind: 'NORMAL',
    icon: '🎩',
    color: '#34495E',
    thresholds: [3, 5, 7],
    description: 'TFT Set 6 범죄조직 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
      {
        threshold: 3,
        label: '(3) DEF +25, 마법 피감 12%, 흡혈 8%',
        bonusDef: 25,
        omnivamp: 0.08,
        magicDamageReduction: 0.12,
      },
      {
        threshold: 5,
        label: '(5) DEF +50, 마법 피감 22%, 흡혈 14%',
        bonusDef: 50,
        omnivamp: 0.14,
        magicDamageReduction: 0.22,
      },
      {
        threshold: 7,
        label: '(7) 개전 8초 동안 위 효과 2배',
        bonusDef: 50,
        omnivamp: 0.14,
        magicDamageReduction: 0.22,
        damageReductionFirst8s: 0.22,
      },
    ],
  },
  SOCIALITE: {
    id: 'SOCIALITE',
    name: '사교계',
    type: 'ORIGIN',
    kind: 'NORMAL',
    icon: '💡',
    color: '#F39C12',
    thresholds: [1, 2, 3],
    description: 'TFT Set 6 사교계 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 1,
                  "label": "(1) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 2,
                  "label": "(2) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 3,
                  "label": "(3) Set 6 — 엔진 스텁 (카운트만)"
            }
      ],
  },
  CLOCKWORK: {
    id: 'CLOCKWORK',
    name: '시계태엽',
    type: 'ORIGIN',
    kind: 'NORMAL',
    icon: '⚙️',
    color: '#7F8C8D',
    thresholds: [2, 4, 6],
    description: 'TFT Set 6 시계태엽 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 2,
                  "label": "(2) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 4,
                  "label": "(4) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 6,
                  "label": "(6) Set 6 — 엔진 스텁 (카운트만)"
            }
      ],
  },
  ACADEMY: {
    id: 'ACADEMY',
    name: '아카데미',
    type: 'ORIGIN',
    kind: 'NORMAL',
    icon: '🎓',
    color: '#3498DB',
    thresholds: [2, 4, 6, 8],
    description: 'TFT Set 6 아카데미 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 2,
                  "label": "(2) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 4,
                  "label": "(4) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 6,
                  "label": "(6) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 8,
                  "label": "(8) Set 6 — 엔진 스텁 (카운트만)"
            }
      ],
  },
  MERCENARY: {
    id: 'MERCENARY',
    name: '용병',
    type: 'ORIGIN',
    kind: 'NORMAL',
    icon: '🎲',
    color: '#E67E22',
    thresholds: [3, 5, 7],
    description:
      '패배 시 무기고에 전리품 적립, 승리 시 주사위를 굴려 적립 전리품을 캐시인(Set 6 용병).',
    effects: [
      {
        threshold: 3,
        label: '(3) 패배 전리품 1x, 승리 주사위 1개',
        mercenaryStackMultiplier: 1,
        mercenaryLootPerLoss: 1,
        mercenaryDiceCount: 1,
      },
      {
        threshold: 5,
        label: '(5) 패배 전리품 2x, 주사위 2개·소형 아이템 확률',
        mercenaryStackMultiplier: 2,
        mercenaryLootPerLoss: 1,
        mercenaryDiceCount: 2,
        mercenaryWinGoldMin: 2,
        mercenaryWinGoldMax: 4,
        mercenarySmallOrbChanceOnWin: 0.22,
      },
      {
        threshold: 7,
        label: '(7) 패배 전리품 3x, 주사위 3개·5코 1★ 소량',
        mercenaryStackMultiplier: 3,
        mercenaryLootPerLoss: 1,
        mercenaryDiceCount: 3,
        mercenaryWinGoldMin: 3,
        mercenaryWinGoldMax: 6,
        mercenaryPerRoundJackpot: true,
        mercenaryFiveCostUnitChance: 0.08,
      },
    ],
  },
  YORDLE: {
    id: 'YORDLE',
    name: '요들',
    type: 'ORIGIN',
    kind: 'NORMAL',
    icon: '🐾',
    color: '#2ECC71',
    thresholds: [3, 6],
    description: 'TFT Set 6 요들 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
      {
        threshold: 3,
        label: '(3) 요들 회피 25%',
        dodgeChance: 0.25,
      },
      {
        threshold: 6,
        label: '(6) 회피 40% + 최대 마나 -10',
        dodgeChance: 0.4,
      },
    ],
  },
  IMPERIAL: {
    id: 'IMPERIAL',
    name: '제국',
    type: 'ORIGIN',
    kind: 'NORMAL',
    icon: '👑',
    color: '#C0392B',
    thresholds: [3, 5],
    description: 'TFT Set 6 제국 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
      {
        threshold: 3,
        label: '(3) 폭군 피해 +18%',
        imperialDamageBonus: 0.18,
      },
      {
        threshold: 5,
        label: '(5) 폭군 피해 +35%',
        imperialDamageBonus: 0.35,
      },
    ],
  },
  ENFORCER: {
    id: 'ENFORCER',
    name: '집행자',
    type: 'ORIGIN',
    kind: 'NORMAL',
    icon: '🔗',
    color: '#2980B9',
    thresholds: [2, 4],
    description: 'TFT Set 6 집행자 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 2,
                  "label": "(2) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 4,
                  "label": "(4) Set 6 — 엔진 스텁 (카운트만)"
            }
      ],
  },
  CHEMTECH: {
    id: 'CHEMTECH',
    name: '화학공학',
    type: 'ORIGIN',
    kind: 'NORMAL',
    icon: '🧪',
    color: '#1ABC9C',
    thresholds: [3, 5, 7, 9],
    description: 'TFT Set 6 화학공학 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
      {
        threshold: 3,
        label: '(3) HP≤60%: 피감 15%, AS +30%, 2% HP/s (4초)',
        chemtechDamageReduction: 0.15,
        chemtechAtkSpeedBonus: 0.3,
        chemtechRegenPerSec: 0.02,
        chemtechBurstDurationMs: 4000,
      },
      {
        threshold: 5,
        label: '(5) 피감 22%, AS +45%, 3% HP/s (5초)',
        chemtechDamageReduction: 0.22,
        chemtechAtkSpeedBonus: 0.45,
        chemtechRegenPerSec: 0.03,
        chemtechBurstDurationMs: 5000,
      },
      {
        threshold: 7,
        label: '(7) 피감 28%, AS +60%, 4% HP/s (5초)',
        chemtechDamageReduction: 0.28,
        chemtechAtkSpeedBonus: 0.6,
        chemtechRegenPerSec: 0.04,
        chemtechBurstDurationMs: 5000,
      },
      {
        threshold: 9,
        label: '(9) 피감 35%, AS +80%, 5% HP/s (6초)',
        chemtechDamageReduction: 0.35,
        chemtechAtkSpeedBonus: 0.8,
        chemtechRegenPerSec: 0.05,
        chemtechBurstDurationMs: 6000,
      },
    ],
  },
  SISTER: {
    id: 'SISTER',
    name: '자매',
    type: 'ORIGIN',
    kind: 'PAIR',
    icon: '👭',
    color: '#E91E63',
    thresholds: [2],
    description: 'TFT Set 6 자매 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 2,
                  "label": "(2) Set 6 — 엔진 스텁 (카운트만)"
            }
      ],
    boundUnitIds: ["u2_vi","u5_jinx"],
  },
  CUDDLY: {
    id: 'CUDDLY',
    name: '단짝',
    type: 'ORIGIN',
    kind: 'CHAMPION_ONLY',
    icon: '🐱',
    color: '#FF9800',
    thresholds: [1],
    description: 'TFT Set 6 단짝 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 1,
                  "label": "(1) Set 6 — 엔진 스텁 (카운트만)"
            }
      ],
    boundUnitIds: ["u5_yuumi"],
  },
  GLUTTON: {
    id: 'GLUTTON',
    name: '대식가',
    type: 'ORIGIN',
    kind: 'CHAMPION_ONLY',
    icon: '🦈',
    color: '#607D8B',
    thresholds: [1],
    description: 'TFT Set 6 대식가 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 1,
                  "label": "(1) Set 6 — 엔진 스텁 (카운트만)"
            }
      ],
    boundUnitIds: ["u5_tahm_kench"],
  },
  YORDLE_LORD: {
    id: 'YORDLE_LORD',
    name: '요들 군주',
    type: 'ORIGIN',
    kind: 'CHAMPION_ONLY',
    icon: '🏰',
    color: '#8E44AD',
    thresholds: [1],
    description: 'TFT Set 6 요들 군주 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 1,
                  "label": "(1) Set 6 — 엔진 스텁 (카운트만)"
            }
      ],
    boundUnitIds: ["u5_veigar"],
  },
  ENCHANTER: {
    id: 'ENCHANTER',
    name: '강화술사',
    type: 'CLASS',
    kind: 'NORMAL',
    icon: '✨',
    color: '#F1C40F',
    thresholds: [2, 3, 4, 5],
    description: 'TFT Set 6 강화술사 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
      {
        threshold: 2,
        label: '(2) 팀 마법 피감 10%, 힐/실드 +20%',
        magicDamageReduction: 0.1,
        enchanterHealShieldMult: 1.2,
      },
      {
        threshold: 3,
        label: '(3) 마법 피감 15%, 힐/실드 +35%',
        magicDamageReduction: 0.15,
        enchanterHealShieldMult: 1.35,
      },
      {
        threshold: 4,
        label: '(4) 마법 피감 20%, 힐/실드 +45%',
        magicDamageReduction: 0.2,
        enchanterHealShieldMult: 1.45,
      },
      {
        threshold: 5,
        label: '(5) 마법 피감 25%, 힐/실드 +55%',
        magicDamageReduction: 0.25,
        enchanterHealShieldMult: 1.55,
      },
    ],
  },
  BODYGUARD: {
    id: 'BODYGUARD',
    name: '경호대',
    type: 'CLASS',
    kind: 'NORMAL',
    icon: '🛡️',
    color: '#BDC3C7',
    thresholds: [2, 4, 6, 8],
    description: 'TFT Set 6 경호대 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 2,
                  "label": "(2) 방어력 +40, 개전 실드",
                  "bonusDef": 40,
                  "shieldMaxHpRatio": 0.1
            },
            {
                  "threshold": 4,
                  "label": "(4) 방어력 +90, 개전 실드 강화",
                  "bonusDef": 90,
                  "shieldMaxHpRatio": 0.18
            },
            {
                  "threshold": 6,
                  "label": "(6) 방어력 +140, 개전 실드",
                  "bonusDef": 140,
                  "shieldMaxHpRatio": 0.25
            },
            {
                  "threshold": 8,
                  "label": "(8) 방어력 +200, 개전 실드",
                  "bonusDef": 200,
                  "shieldMaxHpRatio": 0.32
            }
      ],
  },
  BRUISER: {
    id: 'BRUISER',
    name: '난동꾼',
    type: 'CLASS',
    kind: 'NORMAL',
    icon: '💪',
    color: '#E74C3C',
    thresholds: [2, 4, 6, 8],
    description: 'TFT Set 6 난동꾼 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
      { threshold: 2, label: '(2) 팀 maxHP +8%', teamMaxHpRatio: 0.08 },
      { threshold: 4, label: '(4) 팀 maxHP +13%', teamMaxHpRatio: 0.13 },
      { threshold: 6, label: '(6) 팀 maxHP +18%', teamMaxHpRatio: 0.18 },
      { threshold: 8, label: '(8) 팀 maxHP +22%', teamMaxHpRatio: 0.22 },
    ],
  },
  CHALLENGER: {
    id: 'CHALLENGER',
    name: '도전자',
    type: 'CLASS',
    kind: 'NORMAL',
    icon: '🏃',
    color: '#16A085',
    thresholds: [2, 4, 6, 8],
    description: 'TFT Set 6 도전자 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
      { threshold: 2, label: '(2) AS +15%', bonusAtkSpeed: 0.15 },
      { threshold: 4, label: '(4) AS +30%', bonusAtkSpeed: 0.3 },
      { threshold: 6, label: '(6) AS +40%', bonusAtkSpeed: 0.4 },
      {
        threshold: 8,
        label: '(8) AS +45%, 처치 관여 돌진+AS 2배',
        bonusAtkSpeed: 0.45,
        challengerOnKillAsMult: 2,
        challengerOnKillDurationMs: 2500,
      },
    ],
  },
  INNOVATOR: {
    id: 'INNOVATOR',
    name: '발명가',
    type: 'CLASS',
    kind: 'NORMAL',
    icon: '🔧',
    color: '#D35400',
    thresholds: [3, 5, 7],
    description: 'TFT Set 6 발명가 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 3,
                  "label": "(3) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 5,
                  "label": "(5) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 7,
                  "label": "(7) Set 6 — 엔진 스텁 (카운트만)"
            }
      ],
  },
  PROTECTOR: {
    id: 'PROTECTOR',
    name: '봉쇄자',
    type: 'CLASS',
    kind: 'NORMAL',
    icon: '🫧',
    color: '#5DADE2',
    thresholds: [2, 3, 4, 5],
    description: 'TFT Set 6 봉쇄자 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 2,
                  "label": "(2) 스킬 실드",
                  "shieldMaxHpRatio": 0.1
            },
            {
                  "threshold": 3,
                  "label": "(3) 실드",
                  "shieldMaxHpRatio": 0.15
            },
            {
                  "threshold": 4,
                  "label": "(4) 실드",
                  "shieldMaxHpRatio": 0.22
            },
            {
                  "threshold": 5,
                  "label": "(5) 실드",
                  "shieldMaxHpRatio": 0.3
            }
      ],
  },
  ARCANIST: {
    id: 'ARCANIST',
    name: '비전 마법사',
    type: 'CLASS',
    kind: 'NORMAL',
    icon: '🔮',
    color: '#9B59B6',
    thresholds: [2, 4, 6, 8],
    description: 'TFT Set 6 비전 마법사 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
      {
        threshold: 2,
        label: '(2) 팀 SP +12%, 비전 +15% SP',
        spellPowerBonus: 0.12,
      },
      {
        threshold: 4,
        label: '(4) 팀 SP +22%, 비전 +22% SP',
        spellPowerBonus: 0.22,
      },
      {
        threshold: 6,
        label: '(6) 팀 SP +35%, 비전 +32% SP',
        spellPowerBonus: 0.35,
      },
      {
        threshold: 8,
        label: '(8) 팀 SP +50%, 비전 +40% SP',
        spellPowerBonus: 0.5,
      },
    ],
  },
  TWINSHOT: {
    id: 'TWINSHOT',
    name: '쌍발총',
    type: 'CLASS',
    kind: 'NORMAL',
    icon: '🔫',
    color: '#27AE60',
    thresholds: [2, 4, 6],
    description: 'TFT Set 6 쌍발총 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
      {
        threshold: 2,
        label: '(2) ATK +10%, 이중 사격 25%',
        bonusAtkSpeed: 0.1,
        twinShotProcChance: 0.25,
        twinShotSecondShotRatio: 0.7,
      },
      {
        threshold: 4,
        label: '(4) ATK +18%, 이중 사격 40%',
        bonusAtkSpeed: 0.18,
        twinShotProcChance: 0.4,
        twinShotSecondShotRatio: 0.7,
      },
      {
        threshold: 6,
        label: '(6) ATK +25%, 이중 사격 60%',
        bonusAtkSpeed: 0.25,
        twinShotProcChance: 0.6,
        twinShotSecondShotRatio: 0.7,
      },
    ],
  },
  ASSASSIN: {
    id: 'ASSASSIN',
    name: '암살자',
    type: 'CLASS',
    kind: 'NORMAL',
    icon: '🗡️',
    color: '#2C3E50',
    thresholds: [2, 4, 6],
    description: 'TFT Set 6 암살자 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 2,
                  "label": "(2) 후방 도약, 치확/치뎀",
                  "bonusCritChance": 0.25,
                  "bonusCritDamage": 0.35
            },
            {
                  "threshold": 4,
                  "label": "(4) 치확/치뎀 증가",
                  "bonusCritChance": 0.45,
                  "bonusCritDamage": 0.65
            },
            {
                  "threshold": 6,
                  "label": "(6) 치확/치뎀 최대",
                  "bonusCritChance": 0.65,
                  "bonusCritDamage": 0.95
            }
      ],
  },
  SNIPER: {
    id: 'SNIPER',
    name: '저격수',
    type: 'CLASS',
    kind: 'NORMAL',
    icon: '🎯',
    color: '#1E8449',
    thresholds: [2, 4, 6],
    description: 'TFT Set 6 저격수 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
      {
        threshold: 2,
        label: '(2) 사거리 +1, 헥스당 피해 +4% (최대 35%)',
        bonusRange: 1,
        sniperDamagePerHex: 0.04,
        sniperDamageCap: 0.35,
      },
      {
        threshold: 4,
        label: '(4) 사거리 +1, 헥스당 +7%',
        bonusRange: 1,
        sniperDamagePerHex: 0.07,
        sniperDamageCap: 0.35,
      },
      {
        threshold: 6,
        label: '(6) 사거리 +2, 헥스당 +11%',
        bonusRange: 2,
        sniperDamagePerHex: 0.11,
        sniperDamageCap: 0.35,
      },
    ],
  },
  SCHOLAR: {
    id: 'SCHOLAR',
    name: '학자',
    type: 'CLASS',
    kind: 'NORMAL',
    icon: '📚',
    color: '#6C3483',
    thresholds: [2, 4, 6],
    description: 'TFT Set 6 학자 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 2,
                  "label": "(2) 2초마다 팀 마나",
                  "teamManaPerAttack": 2
            },
            {
                  "threshold": 4,
                  "label": "(4) 마나 틱",
                  "teamManaPerAttack": 4
            },
            {
                  "threshold": 6,
                  "label": "(6) 마나 틱",
                  "teamManaPerAttack": 7
            }
      ],
  },
  COLOSSUS: {
    id: 'COLOSSUS',
    name: '거신',
    type: 'CLASS',
    kind: 'NORMAL',
    icon: '🗿',
    color: '#7D6608',
    thresholds: [1, 2],
    description: 'TFT Set 6 거신 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 1,
                  "label": "(1) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 2,
                  "label": "(2) Set 6 — 엔진 스텁 (카운트만)"
            }
      ],
  },
  TRANSFORMER: {
    id: 'TRANSFORMER',
    name: '변형술사',
    type: 'CLASS',
    kind: 'CHAMPION_ONLY',
    icon: '🔄',
    color: '#5B2C6F',
    thresholds: [1],
    description: 'TFT Set 6 변형술사 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 1,
                  "label": "(1) Set 6 — 엔진 스텁 (카운트만)"
            }
      ],
    boundUnitIds: ["u5_jayce"],
  },
};
