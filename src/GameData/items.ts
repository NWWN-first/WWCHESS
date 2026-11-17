// src/GameData/items.ts

import type { BaseItemId, CompletedItemId, ItemId } from './types';

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
  // ---- 1코스트 (14종) ----
  u1_garen: ['SUNFIRE_CAPE', 'BLOODTHIRSTER', 'BRAMBLE_VEST'],
  u1_pip: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'GIANT_SLAYER'],
  u1_aria: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
  u1_skel: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'INFINITY_EDGE'],
  u1_lumi: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'ARCHANGELS_STAFF'],
  u1_valen: ['BRAMBLE_VEST', 'SUNFIRE_CAPE', 'PROTECTORS_VOW'],
  u1_imp: ['BLUE_BUFF', 'RABADONS_DEATHCAP', 'STATIKK_SHIV'],
  u1_thorn: ['BRAMBLE_VEST', 'SUNFIRE_CAPE', 'PROTECTORS_VOW'],
  u1_whelp: ['GUINSOOS_RAGEBLADE', 'STATIKK_SHIV', 'GIANT_SLAYER'],
  u1_ghoul: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'GIANT_SLAYER'],
  u1_chrona: ['PROTECTORS_VOW', 'SUNFIRE_CAPE', 'BRAMBLE_VEST'],
  u1_snatch: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
  u1_shieldmaiden: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'INFINITY_EDGE'],
  u1_ember: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'PROTECTORS_VOW'],

  // ---- 2코스트 (13종) ----
  u2_tink: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'STATIKK_SHIV'],
  u2_jeanne: ['PROTECTORS_VOW', 'SUNFIRE_CAPE', 'BRAMBLE_VEST'],
  u2_kyle: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
  u2_ent: ['BRAMBLE_VEST', 'SUNFIRE_CAPE', 'PROTECTORS_VOW'],
  u2_zed: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'GIANT_SLAYER'],
  u2_zephyr: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'GIANT_SLAYER'],
  u2_elowen: ['SPEAR_OF_SHOJIN', 'PROTECTORS_VOW', 'ARCHANGELS_STAFF'],
  u2_boulder: ['BRAMBLE_VEST', 'SUNFIRE_CAPE', 'TITANS_RESOLVE'],
  u2_boom: ['STATIKK_SHIV', 'GUINSOOS_RAGEBLADE', 'GIANT_SLAYER'],
  u2_vayne: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
  u2_pyre: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'INFINITY_EDGE'],
  u2_boneknight: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'TITANS_RESOLVE'],
  u2_malice: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'BLUE_BUFF'],

  // ---- 3코스트 (13종 - 리롤 캐리 핵심 기물) ----
  u3_grom: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'INFINITY_EDGE'],
  u3_sieg: ['TITANS_RESOLVE', 'BLOODTHIRSTER', 'BRAMBLE_VEST'],
  u3_sylphie: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'ARCHANGELS_STAFF'],
  u3_vlad: ['HEXTECH_GUNBLADE', 'TITANS_RESOLVE', 'ARCHANGELS_STAFF'],
  u3_drake: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'INFINITY_EDGE'],
  u3_leona: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'PROTECTORS_VOW'],
  u3_kazu: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'GIANT_SLAYER'],
  u3_malakor: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'ARCHANGELS_STAFF'],
  u3_seraphina: ['SPEAR_OF_SHOJIN', 'PROTECTORS_VOW', 'ARCHANGELS_STAFF'],
  u3_grizzle: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'PROTECTORS_VOW'],
  u3_orion: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
  u3_nyx: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'BLUE_BUFF'],
  u3_fenrir: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'INFINITY_EDGE'],

  // ---- 4코스트 (12종) ----
  u4_arthur: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'TITANS_RESOLVE'],
  u4_merlin: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'ARCHANGELS_STAFF'],
  u4_thanatos: ['INFINITY_EDGE', 'BLOODTHIRSTER', 'GIANT_SLAYER'],
  u4_sylph: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
  u4_astaroth: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'INFINITY_EDGE'],
  u4_velkora: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'BLUE_BUFF'],
  u4_valkyrie: ['SUNFIRE_CAPE', 'PROTECTORS_VOW', 'TITANS_RESOLVE'],
  u4_fafnir: ['BRAMBLE_VEST', 'SUNFIRE_CAPE', 'TITANS_RESOLVE'],
  u4_lichking: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'ARCHANGELS_STAFF'],
  u4_midas: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'GUINSOOS_RAGEBLADE'],
  u4_artemis: ['GUINSOOS_RAGEBLADE', 'INFINITY_EDGE', 'GIANT_SLAYER'],
  u4_diablo: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'PROTECTORS_VOW'],

  // ---- 5코스트 (8종) ----
  u5_ignis: ['BLOODTHIRSTER', 'TITANS_RESOLVE', 'RABADONS_DEATHCAP'],
  u5_goldtooth: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'PROTECTORS_VOW'],
  u5_luciel: ['INFINITY_EDGE', 'GUINSOOS_RAGEBLADE', 'GIANT_SLAYER'],
  u5_michael: ['BRAMBLE_VEST', 'SUNFIRE_CAPE', 'TITANS_RESOLVE'],
  u5_bahamut: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'ARCHANGELS_STAFF'],
  u5_chronos: ['SPEAR_OF_SHOJIN', 'RABADONS_DEATHCAP', 'BLUE_BUFF'],
  u5_lilith: ['BLOODTHIRSTER', 'INFINITY_EDGE', 'TITANS_RESOLVE'],
  u5_yggdrasil: ['SUNFIRE_CAPE', 'BRAMBLE_VEST', 'PROTECTORS_VOW'],
};

export function getUnitRecommendedItems(unitId: string): CompletedItemId[] {
  return CHAMPION_RECOMMENDED_ITEMS[unitId] ?? ['INFINITY_EDGE', 'BLOODTHIRSTER', 'SUNFIRE_CAPE'];
}

