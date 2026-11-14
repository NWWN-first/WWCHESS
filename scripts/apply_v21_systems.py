#!/usr/bin/env python3
"""Apply V2.1 spatula/emblems, synergy counting, combat effects, augments, comps."""
from __future__ import annotations

import pathlib
import re

ROOT = pathlib.Path("/workspace")


def patch_gamedata_items(text: str) -> str:
    # BaseItemId + CompletedItemId
    text = text.replace(
        "export type BaseItemId = 'SWORD' | 'BOW' | 'ROD' | 'TEAR' | 'ARMOR';",
        "export type BaseItemId = 'SWORD' | 'BOW' | 'ROD' | 'TEAR' | 'ARMOR' | 'SPATULA';",
    )
    old_completed = """export type CompletedItemId =
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
"""
    new_completed = """export type CompletedItemId =
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
"""
    text = text.replace(old_completed, new_completed)

    if "grantsTrait?" not in text:
        text = text.replace(
            "  passiveFlags: ItemPassiveFlags;\n}",
            "  passiveFlags: ItemPassiveFlags;\n  /** 상징: 장착 유닛에게 부여하는 시너지 */\n  grantsTrait?: TraitId;\n}",
        )

    text = text.replace(
        "export const BASE_ITEM_IDS: BaseItemId[] = ['SWORD', 'BOW', 'ROD', 'TEAR', 'ARMOR'];",
        "export const BASE_ITEM_IDS: BaseItemId[] = ['SWORD', 'BOW', 'ROD', 'TEAR', 'ARMOR', 'SPATULA'];\n"
        "/** 일반 드롭/랜덤용 (뒤집개는 희귀 — 증강·특수 경로) */\n"
        "export const STANDARD_BASE_ITEM_IDS: BaseItemId[] = ['SWORD', 'BOW', 'ROD', 'TEAR', 'ARMOR'];",
    )

    spatula_def = """  SPATULA: {
    id: 'SPATULA',
    name: '뒤집개',
    isCompleted: false,
    icon: '🥄',
    description: '다른 기본 재료와 조합하면 계열 상징을 제작합니다.',
    stats: {},
    passiveFlags: {},
  },
"""
    if "SPATULA:" not in text.split("ITEM_DEFINITIONS")[1][:2500]:
        text = text.replace(
            "  ARMOR: {\n    id: 'ARMOR',\n    name: '사슬 조끼',\n    isCompleted: false,\n    icon: '🛡️',\n    description: '방어력 +25',\n    stats: { def: 25 },\n    passiveFlags: {},\n  },\n\n  // ---- 완성 아이템 15종",
            "  ARMOR: {\n    id: 'ARMOR',\n    name: '사슬 조끼',\n    isCompleted: false,\n    icon: '🛡️',\n    description: '방어력 +25',\n    stats: { def: 25 },\n    passiveFlags: {},\n  },\n"
            + spatula_def
            + "\n  // ---- 완성 아이템 15종",
        )

    emblem_block = """
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
"""
    if "EMBLEM_HOLY_EMPIRE" not in text:
        text = text.replace(
            "  BRAMBLE_VEST: {\n    id: 'BRAMBLE_VEST',\n    name: '가시 갑옷',\n    isCompleted: true,\n    components: ['ARMOR', 'ARMOR'],\n    icon: '🌵',\n    description: '방어력 +55, 체력 +150. 피격 시 주변 적들에게 120의 반사 피해를 입히고 치명타 추가 피해를 무효화합니다.',\n    stats: { def: 55, hp: 150 },\n    passiveFlags: { brambleReflect: true },\n  },\n};",
            "  BRAMBLE_VEST: {\n    id: 'BRAMBLE_VEST',\n    name: '가시 갑옷',\n    isCompleted: true,\n    components: ['ARMOR', 'ARMOR'],\n    icon: '🌵',\n    description: '방어력 +55, 체력 +150. 피격 시 주변 적들에게 120의 반사 피해를 입히고 치명타 추가 피해를 무효화합니다.',\n    stats: { def: 55, hp: 150 },\n    passiveFlags: { brambleReflect: true },\n  },"
            + emblem_block
            + "};\n",
        )

    # Expand combination matrix with SPATULA
    new_matrix = """export const ITEM_COMBINATION_MATRIX: Record<BaseItemId, Record<BaseItemId, CompletedItemId>> = {
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
"""
    text = re.sub(
        r"export const ITEM_COMBINATION_MATRIX: Record<BaseItemId, Record<BaseItemId, CompletedItemId>> = \{[\s\S]*?\n\};\n",
        new_matrix + "\n",
        text,
        count=1,
    )

    # Helper for emblem traits
    helper = """
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

"""
    if "getEmblemTraitsFromItems" not in text:
        text = text.replace(
            "export function combineBaseItems(itemA: BaseItemId, itemB: BaseItemId): CompletedItemId {\n  return ITEM_COMBINATION_MATRIX[itemA][itemB];\n}",
            "export function combineBaseItems(itemA: BaseItemId, itemB: BaseItemId): CompletedItemId {\n  return ITEM_COMBINATION_MATRIX[itemA][itemB];\n}\n"
            + helper,
        )

    # Rebuild recommended items for all current units
    recs = {
        "u1_garen": ["SUNFIRE_CAPE", "BRAMBLE_VEST", "PROTECTORS_VOW"],
        "u1_valen": ["SUNFIRE_CAPE", "PROTECTORS_VOW", "BRAMBLE_VEST"],
        "u1_imp": ["SPEAR_OF_SHOJIN", "RABADONS_DEATHCAP", "ARCHANGELS_STAFF"],
        "u1_ember": ["SUNFIRE_CAPE", "BRAMBLE_VEST", "TITANS_RESOLVE"],
        "u1_aria": ["GUINSOOS_RAGEBLADE", "INFINITY_EDGE", "GIANT_SLAYER"],
        "u1_thorn": ["SUNFIRE_CAPE", "BRAMBLE_VEST", "PROTECTORS_VOW"],
        "u1_whelp": ["TITANS_RESOLVE", "SPEAR_OF_SHOJIN", "SUNFIRE_CAPE"],
        "u1_skel": ["BLOODTHIRSTER", "TITANS_RESOLVE", "INFINITY_EDGE"],
        "u1_ghoul": ["INFINITY_EDGE", "BLOODTHIRSTER", "GIANT_SLAYER"],
        "u1_lumi": ["SPEAR_OF_SHOJIN", "RABADONS_DEATHCAP", "ARCHANGELS_STAFF"],
        "u1_pip": ["INFINITY_EDGE", "BLOODTHIRSTER", "GIANT_SLAYER"],
        "u1_fang": ["BLOODTHIRSTER", "TITANS_RESOLVE", "INFINITY_EDGE"],
        "u1_tusk": ["SUNFIRE_CAPE", "PROTECTORS_VOW", "BRAMBLE_VEST"],
        "u2_jeanne": ["SUNFIRE_CAPE", "PROTECTORS_VOW", "SPEAR_OF_SHOJIN"],
        "u2_vayne": ["GUINSOOS_RAGEBLADE", "INFINITY_EDGE", "GIANT_SLAYER"],
        "u2_kyle": ["GUINSOOS_RAGEBLADE", "INFINITY_EDGE", "STATIKK_SHIV"],
        "u2_zephyr": ["INFINITY_EDGE", "BLOODTHIRSTER", "GIANT_SLAYER"],
        "u2_elowen": ["SPEAR_OF_SHOJIN", "PROTECTORS_VOW", "ARCHANGELS_STAFF"],
        "u2_ent": ["SUNFIRE_CAPE", "PROTECTORS_VOW", "BRAMBLE_VEST"],
        "u2_pyre": ["BLOODTHIRSTER", "TITANS_RESOLVE", "INFINITY_EDGE"],
        "u2_zed": ["INFINITY_EDGE", "BLOODTHIRSTER", "GIANT_SLAYER"],
        "u2_boulder": ["SUNFIRE_CAPE", "BRAMBLE_VEST", "TITANS_RESOLVE"],
        "u2_tink": ["SPEAR_OF_SHOJIN", "RABADONS_DEATHCAP", "ARCHANGELS_STAFF"],
        "u2_boom": ["SPEAR_OF_SHOJIN", "STATIKK_SHIV", "GUINSOOS_RAGEBLADE"],
        "u2_claw": ["INFINITY_EDGE", "BLOODTHIRSTER", "GIANT_SLAYER"],
        "u2_howl": ["SPEAR_OF_SHOJIN", "RABADONS_DEATHCAP", "BLUE_BUFF"],
        "u3_leona": ["SUNFIRE_CAPE", "BRAMBLE_VEST", "PROTECTORS_VOW"],
        "u3_nyx": ["SPEAR_OF_SHOJIN", "RABADONS_DEATHCAP", "HEXTECH_GUNBLADE"],
        "u3_sylphie": ["SPEAR_OF_SHOJIN", "RABADONS_DEATHCAP", "ARCHANGELS_STAFF"],
        "u3_kazu": ["INFINITY_EDGE", "GUINSOOS_RAGEBLADE", "BLOODTHIRSTER"],
        "u3_sieg": ["SUNFIRE_CAPE", "TITANS_RESOLVE", "BRAMBLE_VEST"],
        "u3_drake": ["BLOODTHIRSTER", "TITANS_RESOLVE", "INFINITY_EDGE"],
        "u3_fenrir": ["BLOODTHIRSTER", "TITANS_RESOLVE", "SUNFIRE_CAPE"],
        "u3_quartz": ["SUNFIRE_CAPE", "BRAMBLE_VEST", "SPEAR_OF_SHOJIN"],
        "u3_orion": ["GUINSOOS_RAGEBLADE", "INFINITY_EDGE", "SPEAR_OF_SHOJIN"],
        "u3_grom": ["BLOODTHIRSTER", "INFINITY_EDGE", "TITANS_RESOLVE"],
        "u3_grizzle": ["SUNFIRE_CAPE", "PROTECTORS_VOW", "BRAMBLE_VEST"],
        "u3_bramble": ["SPEAR_OF_SHOJIN", "TITANS_RESOLVE", "SUNFIRE_CAPE"],
        "u3_pack": ["GUINSOOS_RAGEBLADE", "INFINITY_EDGE", "GIANT_SLAYER"],
        "u4_arthur": ["BLOODTHIRSTER", "INFINITY_EDGE", "TITANS_RESOLVE"],
        "u4_astaroth": ["SPEAR_OF_SHOJIN", "RABADONS_DEATHCAP", "HEXTECH_GUNBLADE"],
        "u4_sylph": ["GUINSOOS_RAGEBLADE", "INFINITY_EDGE", "GIANT_SLAYER"],
        "u4_artemis": ["GUINSOOS_RAGEBLADE", "INFINITY_EDGE", "GIANT_SLAYER"],
        "u4_fafnir": ["SUNFIRE_CAPE", "PROTECTORS_VOW", "TITANS_RESOLVE"],
        "u4_lichking": ["SPEAR_OF_SHOJIN", "RABADONS_DEATHCAP", "BLUE_BUFF"],
        "u4_merlin": ["SPEAR_OF_SHOJIN", "RABADONS_DEATHCAP", "ARCHANGELS_STAFF"],
        "u4_chrona": ["SUNFIRE_CAPE", "BRAMBLE_VEST", "PROTECTORS_VOW"],
        "u4_midas": ["SPEAR_OF_SHOJIN", "ARCHANGELS_STAFF", "HEXTECH_GUNBLADE"],
        "u4_snatch": ["GUINSOOS_RAGEBLADE", "STATIKK_SHIV", "SPEAR_OF_SHOJIN"],
        "u4_ursa": ["BLOODTHIRSTER", "TITANS_RESOLVE", "SUNFIRE_CAPE"],
        "u4_bone": ["SUNFIRE_CAPE", "BRAMBLE_VEST", "TITANS_RESOLVE"],
        "u4_celeste": ["SPEAR_OF_SHOJIN", "GUINSOOS_RAGEBLADE", "ARCHANGELS_STAFF"],
        "u5_michael": ["SUNFIRE_CAPE", "PROTECTORS_VOW", "BRAMBLE_VEST"],
        "u5_lilith": ["INFINITY_EDGE", "BLOODTHIRSTER", "GIANT_SLAYER"],
        "u5_yggdrasil": ["SUNFIRE_CAPE", "PROTECTORS_VOW", "SPEAR_OF_SHOJIN"],
        "u5_ignis": ["BLOODTHIRSTER", "TITANS_RESOLVE", "INFINITY_EDGE"],
        "u5_bahamut": ["SPEAR_OF_SHOJIN", "RABADONS_DEATHCAP", "ARCHANGELS_STAFF"],
        "u5_goldtooth": ["SPEAR_OF_SHOJIN", "TITANS_RESOLVE", "GUINSOOS_RAGEBLADE"],
        "u5_kairos": ["BLOODTHIRSTER", "INFINITY_EDGE", "TITANS_RESOLVE"],
        "u5_luciel": ["GUINSOOS_RAGEBLADE", "INFINITY_EDGE", "GIANT_SLAYER"],
    }
    lines = ["export const CHAMPION_RECOMMENDED_ITEMS: Record<string, [CompletedItemId, CompletedItemId, CompletedItemId]> = {"]
    for uid, items in recs.items():
        lines.append(f"  {uid}: ['{items[0]}', '{items[1]}', '{items[2]}'],")
    lines.append("};")
    text = re.sub(
        r"export const CHAMPION_RECOMMENDED_ITEMS: Record<string, \[CompletedItemId, CompletedItemId, CompletedItemId\]> = \{[\s\S]*?\n\};\n",
        "\n".join(lines) + "\n\n",
        text,
        count=1,
    )
    return text


def patch_synergy_engine(text: str) -> str:
    if "getEffectiveUnitTraits" not in text:
        text = text.replace(
            """import {
  TRAIT_DEFINITIONS,
  TraitDefinition,
  TraitEffectTier,
  TraitId,
  UNIT_TEMPLATES,
} from './GameData';
""",
            """import {
  TRAIT_DEFINITIONS,
  TraitDefinition,
  TraitEffectTier,
  TraitId,
  UNIT_TEMPLATES,
  getEffectiveUnitTraits,
} from './GameData';
""",
        )
    text = text.replace(
        """        uniqueBoardUnitIds.add(unit.unitId);
        const template = UNIT_TEMPLATES[unit.unitId];
        const traits = template ? template.traits : unit.traits;

        for (const traitId of traits) {
          traitCounts.set(traitId, (traitCounts.get(traitId) ?? 0) + 1);
        }
""",
        """        uniqueBoardUnitIds.add(unit.unitId);
        const template = UNIT_TEMPLATES[unit.unitId];
        const baseTraits = template ? template.traits : unit.traits;
        const traits = getEffectiveUnitTraits(baseTraits, unit.items);

        for (const traitId of traits) {
          traitCounts.set(traitId, (traitCounts.get(traitId) ?? 0) + 1);
        }
""",
    )
    # evaluateCandidateUnitsSynergyScore should also use emblems
    text = text.replace(
        """    for (const u of units) {
      if (uniqueIds.has(u.unitId)) continue;
      uniqueIds.add(u.unitId);
      for (const t of u.traits) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
""",
        """    for (const u of units) {
      if (uniqueIds.has(u.unitId)) continue;
      uniqueIds.add(u.unitId);
      for (const t of getEffectiveUnitTraits(u.traits, u.items)) {
        counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
""",
    )
    return text


def patch_participant(text: str) -> str:
    if "getEffectiveUnitTraits" not in text:
        text = text.replace(
            "  combineBaseItems,\n",
            "  combineBaseItems,\n  getEffectiveUnitTraits,\n  STANDARD_BASE_ITEM_IDS,\n  traitIdToEmblemItem,\n",
        )
    text = text.replace(
        """        for (const traitId of unit.traits) {
          counts.set(traitId, (counts.get(traitId) ?? 0) + 1);
        }
""",
        """        for (const traitId of getEffectiveUnitTraits(unit.traits, unit.items)) {
          counts.set(traitId, (counts.get(traitId) ?? 0) + 1);
        }
""",
    )
    text = text.replace(
        "  private randomBaseItemId(): BaseItemId {\n    const ids: BaseItemId[] = ['SWORD', 'BOW', 'ROD', 'TEAR', 'ARMOR'];\n    return ids[Math.floor(Math.random() * ids.length)];\n  }",
        "  private randomBaseItemId(): BaseItemId {\n    const ids = STANDARD_BASE_ITEM_IDS;\n    return ids[Math.floor(Math.random() * ids.length)];\n  }",
    )
    # Crest/crown: convert bonusTrait into emblem item grant; keep bonusTraits path for legacy but crests will use items
    text = text.replace(
        """    if (aug.bonusTrait && aug.bonusTraitCount) {
      const prev = this.bonusTraits.get(aug.bonusTrait) ?? 0;
      this.bonusTraits.set(aug.bonusTrait, prev + aug.bonusTraitCount);
    }
    if (aug.effectKey === 'ARCANE_CREST') {
      const prevArchmage = this.bonusTraits.get('ARCHMAGE') ?? 0;
      this.bonusTraits.set('ARCHMAGE', prevArchmage + 1);
    }
""",
        """    if (aug.bonusTrait && aug.bonusTraitCount) {
      // V2.1: invisible +N 대신 상징 아이템 지급 (장착해야 카운트)
      const emblem = traitIdToEmblemItem(aug.bonusTrait);
      if (emblem) {
        for (let i = 0; i < aug.bonusTraitCount; i++) {
          this.addItemToBench(emblem);
        }
      } else {
        const prev = this.bonusTraits.get(aug.bonusTrait) ?? 0;
        this.bonusTraits.set(aug.bonusTrait, prev + aug.bonusTraitCount);
      }
    }
""",
    )
    return text


def main() -> None:
    gd = ROOT / "src/GameData.ts"
    gd.write_text(patch_gamedata_items(gd.read_text()))
    print("GameData items/emblems OK")

    se = ROOT / "src/SynergyEngine.ts"
    se.write_text(patch_synergy_engine(se.read_text()))
    print("SynergyEngine OK")

    pt = ROOT / "src/Participant.ts"
    pt.write_text(patch_participant(pt.read_text()))
    print("Participant OK")


if __name__ == "__main__":
    main()
