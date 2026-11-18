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
                  "threshold": 3,
                  "label": "(3) DEF/MR/흡혈",
                  "bonusDef": 25,
                  "omnivamp": 0.08
            },
            {
                  "threshold": 5,
                  "label": "(5) 강화",
                  "bonusDef": 50,
                  "omnivamp": 0.14
            },
            {
                  "threshold": 7,
                  "label": "(7) 개전 8초 2배",
                  "bonusDef": 50,
                  "omnivamp": 0.14,
                  "damageReductionFirst8s": 0.12
            }
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
    description: 'TFT Set 6 용병 — 상세 기믹은 후속 PR(T3~T7).',
    effects: [
            {
                  "threshold": 3,
                  "label": "(3) 패배 스택 1x",
                  "mercenaryStackMultiplier": 1
            },
            {
                  "threshold": 5,
                  "label": "(5) 스택 2x",
                  "mercenaryStackMultiplier": 2,
                  "mercenaryWinGoldMin": 2,
                  "mercenaryWinGoldMax": 4
            },
            {
                  "threshold": 7,
                  "label": "(7) 스택 3x",
                  "mercenaryStackMultiplier": 3,
                  "mercenaryWinGoldMin": 3,
                  "mercenaryWinGoldMax": 6,
                  "mercenaryPerRoundJackpot": true
            }
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
                  "threshold": 3,
                  "label": "(3) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 6,
                  "label": "(6) Set 6 — 엔진 스텁 (카운트만)"
            }
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
                  "threshold": 3,
                  "label": "(3) Set 6 — 엔진 스텁 (카운트만)"
            },
            {
                  "threshold": 5,
                  "label": "(5) Set 6 — 엔진 스텁 (카운트만)"
            }
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
                  "threshold": 3,
                  "label": "(3) 60% 이하 버스트",
                  "berserkAtkMultiplier": 1.5,
                  "berserkAtkSpeedMultiplier": 1.35,
                  "berserkSplashRatio": 0.3
            },
            {
                  "threshold": 5,
                  "label": "(5) 단계 상승",
                  "berserkAtkMultiplier": 1.7,
                  "berserkAtkSpeedMultiplier": 1.5,
                  "berserkSplashRatio": 0.45
            },
            {
                  "threshold": 7,
                  "label": "(7) 단계 상승",
                  "berserkAtkMultiplier": 2,
                  "berserkAtkSpeedMultiplier": 1.7,
                  "berserkSplashRatio": 0.6
            },
            {
                  "threshold": 9,
                  "label": "(9) 최고 단계",
                  "berserkAtkMultiplier": 2.3,
                  "berserkAtkSpeedMultiplier": 1.9,
                  "berserkSplashRatio": 0.75
            }
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
                  "threshold": 2,
                  "label": "(2) 힐/실드 효율",
                  "healPerAttack": 40
            },
            {
                  "threshold": 3,
                  "label": "(3) 강화",
                  "healPerAttack": 80
            },
            {
                  "threshold": 4,
                  "label": "(4) 강화",
                  "healPerAttack": 130
            },
            {
                  "threshold": 5,
                  "label": "(5) 최대",
                  "healPerAttack": 200
            }
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
            {
                  "threshold": 2,
                  "label": "(2) 체력 보너스",
                  "berserkAtkMultiplier": 1.2,
                  "berserkAtkSpeedMultiplier": 1.1,
                  "berserkSplashRatio": 0.25
            },
            {
                  "threshold": 4,
                  "label": "(4) 단계 상승",
                  "berserkAtkMultiplier": 1.35,
                  "berserkAtkSpeedMultiplier": 1.2,
                  "berserkSplashRatio": 0.35
            },
            {
                  "threshold": 6,
                  "label": "(6) 단계 상승",
                  "berserkAtkMultiplier": 1.5,
                  "berserkAtkSpeedMultiplier": 1.35,
                  "berserkSplashRatio": 0.45
            },
            {
                  "threshold": 8,
                  "label": "(8) 최고 단계",
                  "berserkAtkMultiplier": 2.3,
                  "berserkAtkSpeedMultiplier": 1.9,
                  "berserkSplashRatio": 0.75
            }
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
                  "threshold": 2,
                  "label": "(2) 팀 주문력 +12%",
                  "spellPowerBonus": 0.12
            },
            {
                  "threshold": 4,
                  "label": "(4) 팀 주문력 +22%",
                  "spellPowerBonus": 0.22
            },
            {
                  "threshold": 6,
                  "label": "(6) 팀 주문력 +35%",
                  "spellPowerBonus": 0.35
            },
            {
                  "threshold": 8,
                  "label": "(8) 팀 주문력 +50%",
                  "spellPowerBonus": 0.5
            }
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
                  "threshold": 2,
                  "label": "(2) 이중 사격",
                  "pierceArrowDamageRatio": 0.25
            },
            {
                  "threshold": 4,
                  "label": "(4) 이중 사격 강화",
                  "pierceArrowDamageRatio": 0.4
            },
            {
                  "threshold": 6,
                  "label": "(6) 이중 사격 최대",
                  "pierceArrowDamageRatio": 0.6
            }
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
                  "threshold": 2,
                  "label": "(2) 사거리 +1",
                  "bonusRange": 1
            },
            {
                  "threshold": 4,
                  "label": "(4) 사거리 +1",
                  "bonusRange": 1
            },
            {
                  "threshold": 6,
                  "label": "(6) 사거리 +2",
                  "bonusRange": 2
            }
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
