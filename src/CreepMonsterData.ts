// src/CreepMonsterData.ts

import { CostTier, StarLevel, UnitTemplate } from './GameData';
import { UnitInstance } from './Participant';

/**
 * 크립 라운드 전용 몬스터/동물 외형 아키타입
 * (일반 플레이어 챔피언과 100% 구분되는 야생 몬스터/동물 전용 도트 스프라이트 종류)
 */
export type CreepArchetype =
  | 'MINION_SCAVENGER'
  | 'TOXIC_SPRITE'
  | 'STONE_GOLEM'
  | 'WILD_WOLF'
  | 'RAZOR_BEAK'
  | 'ANCIENT_DRAGON'
  | 'VOID_BEHEMOTH';

export interface CreepMonsterTemplate extends UnitTemplate {
  isCreepMonster: true;
  archetype: CreepArchetype;
  primaryBodyColor: string;
  secondaryBodyColor: string;
  accentColor: string;
  eyeColor: string;
}

/**
 * 크립 라운드 전용 7종 몬스터/동물 데이터베이스:
 * - 초반 1스테이지('1-1', '1-2')는 레벨 1 유저가 아무 1코스트 1성 기물 1~2마리만 올려놔도
 *   단 1의 체력 손실 없이 여유롭게 압살하며 ?/! 미스터리 박스를 까는 재미를 느끼도록
 *   HP 140~210 / ATK 14~19 수준('매우 쉬움')으로 대폭 하향 밸런싱되어 있다.
 * - 2-5(돌거북 골렘), 3-5(야생 늑대 무리), 4-5(칼날부리 괴조), 5-5+(고대 화염 드래곤 & 공허 거수)도
 *   각 스테이지별 전용 동물/몬스터 도트 외형과 고유 스킬을 지닌다.
 */
export const CREEP_MONSTER_TEMPLATES: Record<string, CreepMonsterTemplate> = {
  creep_minion_scavenger: {
    id: 'creep_minion_scavenger',
    name: '들판 미니언 포식자',
    cost: 1,
    traits: [],
    icon: '👾',
    isCreepMonster: true,
    archetype: 'MINION_SCAVENGER',
    primaryBodyColor: '#6d28d9',
    secondaryBodyColor: '#a78bfa',
    accentColor: '#fde047',
    eyeColor: '#ffea00',
    stats: {
      hp: 165,
      atk: 15,
      def: 8,
      atkSpeed: 0.55,
      range: 1,
      startMana: 0,
      maxMana: 70,
    },
    skill: {
      name: '어설픈 앞니 깨물기',
      description: '작은 단검과 이빨로 대상을 할퀴어 가벼운 물리 피해를 입힙니다.',
      skillType: 'SELF_SHIELD_SLASH',
      baseValueByStar: [35, 55, 90],
      manaLockMs: 1000,
    },
  },
  creep_toxic_sprite: {
    id: 'creep_toxic_sprite',
    name: '독성 숲 포자 정령',
    cost: 1,
    traits: [],
    icon: '🍄',
    isCreepMonster: true,
    archetype: 'TOXIC_SPRITE',
    primaryBodyColor: '#16a34a',
    secondaryBodyColor: '#86efac',
    accentColor: '#d946ef',
    eyeColor: '#fef08a',
    stats: {
      hp: 195,
      atk: 17,
      def: 10,
      atkSpeed: 0.58,
      range: 2,
      startMana: 0,
      maxMana: 65,
    },
    skill: {
      name: '포자 방울 발사',
      description: '초록빛 숲 포자 방울을 쏘아 약한 마법 피해를 입힙니다.',
      skillType: 'ARCANE_BOLT',
      baseValueByStar: [42, 65, 110],
      manaLockMs: 1000,
    },
  },
  creep_stone_golem: {
    id: 'creep_stone_golem',
    name: '바위산 돌거북 골렘',
    cost: 2,
    traits: [],
    icon: '🪨',
    isCreepMonster: true,
    archetype: 'STONE_GOLEM',
    primaryBodyColor: '#57534e',
    secondaryBodyColor: '#a8a29e',
    accentColor: '#22c55e',
    eyeColor: '#38bdf8',
    stats: {
      hp: 760,
      atk: 46,
      def: 42,
      atkSpeed: 0.5,
      range: 1,
      startMana: 20,
      maxMana: 80,
    },
    skill: {
      name: '단단한 바위 껍질',
      description: '바위 웅크리기로 보호막을 얻고 전방 적을 내려찍습니다.',
      skillType: 'THORN_SMASH',
      baseValueByStar: [140, 210, 320],
      manaLockMs: 1100,
    },
  },
  creep_wild_wolf: {
    id: 'creep_wild_wolf',
    name: '어스름 송곳니 늑대',
    cost: 3,
    traits: [],
    icon: '🐺',
    isCreepMonster: true,
    archetype: 'WILD_WOLF',
    primaryBodyColor: '#334155',
    secondaryBodyColor: '#94a3b8',
    accentColor: '#e2e8f0',
    eyeColor: '#ef4444',
    stats: {
      hp: 820,
      atk: 64,
      def: 28,
      atkSpeed: 0.85,
      range: 1,
      startMana: 20,
      maxMana: 60,
    },
    skill: {
      name: '야수의 급소 물어뜯기',
      description: '적의 급소를 물어뜯어 물리 피해를 입히고 공격 속도가 빨라집니다.',
      skillType: 'BACKLINE_CRIT_SLASH',
      baseValueByStar: [165, 250, 380],
      manaLockMs: 850,
    },
  },
  creep_razor_beak: {
    id: 'creep_razor_beak',
    name: '붉은 벼슬 칼날부리',
    cost: 3,
    traits: [],
    icon: '🦅',
    isCreepMonster: true,
    archetype: 'RAZOR_BEAK',
    primaryBodyColor: '#b91c1c',
    secondaryBodyColor: '#f59e0b',
    accentColor: '#fef08a',
    eyeColor: '#ffffff',
    stats: {
      hp: 1080,
      atk: 78,
      def: 35,
      atkSpeed: 0.78,
      range: 2,
      startMana: 20,
      maxMana: 70,
    },
    skill: {
      name: '칼날 깃털 폭풍',
      description: '날카로운 깃털을 연속 발사하여 대상과 주변 적에게 물리 피해를 입힙니다.',
      skillType: 'TRIPLE_SNIPE',
      baseValueByStar: [150, 230, 350],
      manaLockMs: 900,
    },
  },
  creep_ancient_dragon: {
    id: 'creep_ancient_dragon',
    name: '고대 잿빛 화염 드래곤',
    cost: 5,
    traits: [],
    icon: '🐲',
    isCreepMonster: true,
    archetype: 'ANCIENT_DRAGON',
    primaryBodyColor: '#991b1b',
    secondaryBodyColor: '#ea580c',
    accentColor: '#facc15',
    eyeColor: '#fef08a',
    stats: {
      hp: 2650,
      atk: 135,
      def: 65,
      atkSpeed: 0.75,
      range: 2,
      startMana: 30,
      maxMana: 80,
    },
    skill: {
      name: '용의 마그마 숨결',
      description: '전방에 거대한 화염 브레스를 뿜어 광역 마법 피해를 입힙니다.',
      skillType: 'APOCALYPSE_BREATH',
      baseValueByStar: [320, 480, 720],
      manaLockMs: 1100,
    },
  },
  creep_void_behemoth: {
    id: 'creep_void_behemoth',
    name: '심연의 공허 대괴수',
    cost: 5,
    traits: [],
    icon: '👾',
    isCreepMonster: true,
    archetype: 'VOID_BEHEMOTH',
    primaryBodyColor: '#3b0764',
    secondaryBodyColor: '#9333ea',
    accentColor: '#00f5d4',
    eyeColor: '#f43f5e',
    stats: {
      hp: 3400,
      atk: 160,
      def: 80,
      atkSpeed: 0.72,
      range: 1,
      startMana: 40,
      maxMana: 90,
    },
    skill: {
      name: '차원 분쇄 충격파',
      description: '대지를 뒤흔들어 적 전체에게 강력한 마법 피해와 기절을 부여합니다.',
      skillType: 'METEOR_SWARM',
      baseValueByStar: [380, 560, 880],
      manaLockMs: 1200,
    },
  },
};

export function isCreepMonsterUnitId(unitId: string): boolean {
  return Boolean(CREEP_MONSTER_TEMPLATES[unitId]);
}

export function getCreepMonsterTemplate(
  unitId: string
): CreepMonsterTemplate | undefined {
  return CREEP_MONSTER_TEMPLATES[unitId];
}

let creepCounter = 1;

/**
 * 공유 풀(SharedPoolManager)을 전혀 건드리지 않고 크립 라운드 전용 몬스터/동물 UnitInstance를 생성한다.
 */
export function createCreepMonsterInstance(
  creepId: string,
  starLevel: StarLevel = 1,
  hpScale: number = 1.0,
  atkScale: number = 1.0
): UnitInstance {
  const template =
    CREEP_MONSTER_TEMPLATES[creepId] ??
    CREEP_MONSTER_TEMPLATES.creep_minion_scavenger;

  const starMult = starLevel === 3 ? 2.1 : starLevel === 2 ? 1.45 : 1.0;
  const maxHp = Math.max(
    80,
    Math.round(template.stats.hp * starMult * hpScale)
  );
  const atk = Math.max(
    10,
    Math.round(template.stats.atk * starMult * atkScale)
  );

  return {
    instanceId: `creep_${Date.now()}_${creepCounter++}`,
    unitId: template.id,
    name: template.name,
    cost: template.cost as CostTier,
    starLevel,
    traits: [],
    icon: template.icon,
    items: [],
    maxHp,
    currentHp: maxHp,
    atk,
    def: template.stats.def,
    atkSpeed: template.stats.atkSpeed,
    range: template.stats.range,
    startMana: template.stats.startMana,
    maxMana: template.stats.maxMana,
    currentMana: template.stats.startMana,
    spellPower: 1.0,
    critChance: 0.15,
    critDamage: 1.3,
    omnivamp: 0,
  };
}
