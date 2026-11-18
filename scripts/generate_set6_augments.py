#!/usr/bin/env python3
"""Generate src/GameData/augments.ts from scripts/set6_user_augment_roster.json."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "scripts" / "set6_user_augment_roster.json"
CHAMPS_PATH = ROOT / "scripts" / "set6_lolchess_champions.json"
KO_LOCALE_PATH = ROOT / "scripts" / "set6_augment_ko_locale.json"
TRAITS_PATH = ROOT / "src" / "GameData" / "traits.ts"
OUT_PATH = ROOT / "src" / "GameData" / "augments.ts"

TRAIT_MAP = {
    "Academy": "ACADEMY",
    "Arcanist": "ARCANIST",
    "Assassin": "ASSASSIN",
    "Bodyguard": "BODYGUARD",
    "Bruiser": "BRUISER",
    "Challenger": "CHALLENGER",
    "Chemtech": "CHEMTECH",
    "Clockwork": "CLOCKWORK",
    "Enchanter": "ENCHANTER",
    "Enforcer": "ENFORCER",
    "Innovator": "INNOVATOR",
    "Imperial": "IMPERIAL",
    "Academy": "ACADEMY",
    "Protector": "PROTECTOR",
    "Mercenary": "MERCENARY",
    "Mutant": "MUTANT",
    "Scholar": "SCHOLAR",
    "Scrap": "SCRAP",
    "Sniper": "SNIPER",
    "Socialite": "SOCIALITE",
    "Syndicate": "SYNDICATE",
    "Twinshot": "TWINSHOT",
    "Yordle": "YORDLE",
}

NAME_OVERRIDES = {
    "Twisted Fate": "TwistedFate",
    "Kog'Maw": "KogMaw",
    "Miss Fortune": "MissFortune",
    "Cho'Gath": "ChoGath",
    "Dr. Mundo": "DrMundo",
    "Kai'Sa": "KaiSa",
    "Tahm Kench": "TahmKench",
    "Heimerdinger": "Heimerdinger",
    "Nunu & Willump": "Nunu",
    "Renata Glasc": "Renata",
    "Renata Glasc.": "Renata",
}

CHAMP_UNIT_OVERRIDES = {
    "Trundle": "u2_trundle",
    "Swain": "u2_swain",
    "Kassadin": "u1_kassadin",
    "Blitzcrank": "u2_blitzcrank",
    "Darius": "u1_darius",
    "Talon": "u2_talon",
    "Quinn": "u2_quinn",
    "Vi": "u2_vi",
    "Zyra": "u2_zyra",
    "Zilean": "u2_zilean",
    "Warwick": "u2_warwick",
    "Graves": "u2_graves",
    "Leona": "u3_leona",
    "Lissandra": "u2_lissandra",
    "Twisted Fate": "u2_twisted_fate",
    "Ekko": "u2_ekko",
    "Zac": "u3_zac",
    "Taric": "u3_taric",
    "Kog'Maw": "u2_kogmaw",
    "Tristana": "u2_tristana",
    "Heimerdinger": "u3_heimerdinger",
    "Cho'Gath": "u3_chogath",
    "Lulu": "u2_lulu",
    "Nunu & Willump": "u2_blitzcrank",  # not in roster; fallback Blitz for Innovator heart if needed
}


def slug_key(name: str) -> str:
    if name in NAME_OVERRIDES:
        return NAME_OVERRIDES[name]
    return re.sub(r"[^A-Za-z]", "", name)


def load_champion_units() -> dict[str, str]:
    champs = json.loads(CHAMPS_PATH.read_text())
    out: dict[str, str] = dict(CHAMP_UNIT_OVERRIDES)
    for c in champs:
        key = c["key"]
        cost = c["cost"][0]
        slug = re.sub(r"(?<!^)(?=[A-Z])", "_", key).lower()
        uid = f"u{cost}_{slug}"
        out[key] = uid
        out[c.get("name", key)] = uid
    return out


def effect_key_from_name(name: str) -> str:
    tier = ""
    base = name
    if m := re.match(r"^(.*)\s+(I|II|III)$", name):
        base, tier = m.group(1), m.group(2)
    elif m := re.match(r"^(.*)\s+([123])$", name):
        base, tier = m.group(1), {"1": "I", "2": "II", "3": "III"}[m.group(2)]
    key = re.sub(r"[^A-Za-z0-9]+", "_", base).strip("_").upper()
    tier_map = {"I": "_1", "II": "_2", "III": "_3"}
    if tier:
        key += tier_map.get(tier, f"_{tier}")
    return key


def augment_id(effect_key: str) -> str:
    return f"AUG_{effect_key}"


def detect_trait(name: str, desc: str) -> tuple[str | None, int]:
    for label, tid in TRAIT_MAP.items():
        patterns = [
            rf"{label} Heart",
            rf"{label} Crest",
            rf"{label} Crown",
            rf"{label} Soul",
        ]
        for pat in patterns:
            if re.search(pat, name, re.I):
                if "Crown" in name or "Soul" in name:
                    return tid, 2
                if "Crest" in name or "Heart" in name:
                    return tid, 1
    if re.search(r"counts as having 2 additional", desc, re.I):
        m = re.search(r"additional ([A-Za-z]+)s?", desc)
        if m and m.group(1) in TRAIT_MAP:
            return TRAIT_MAP[m.group(1)], 2
    if re.search(r"counts as having 1 additional", desc, re.I):
        m = re.search(r"additional ([A-Za-z]+)", desc)
        if m and m.group(1) in TRAIT_MAP:
            return TRAIT_MAP[m.group(1)], 1
    return None, 0


def detect_unit(desc: str, champs: dict[str, str]) -> str | None:
    m = re.search(r"Gain (?:an? )?([A-Za-z' .&]+?)(?:\.|,|$)", desc)
    if not m:
        m = re.search(r"Gain a ([A-Za-z' .&]+)", desc)
    if not m:
        return None
    cand = m.group(1).strip()
    # strip "Tome" etc.
    if cand.lower().startswith("tome") or "emblem" in cand.lower() or "dice" in cand.lower():
        return None
    if cand in champs:
        return champs[cand]
    sk = slug_key(cand)
    return champs.get(sk)


def category_for(name: str, desc: str, trait: str | None) -> str:
    if trait:
        return "TRAIT"
    econ_kw = (
        "gold",
        "Shop refresh",
        "experience",
        "interest",
        "level",
        "Tome of Traits",
        "component",
        "dice",
    )
    low = desc.lower()
    if any(k.lower() in low for k in econ_kw) or name in {
        "Ancient Archives",
        "Calculated Loss",
        "Clear Mind",
        "Dominance",
        "Hyper Roll",
        "Payday",
        "Pandora's Items",
        "Rich Get Richer",
        "Trade Sector",
        "Metabolic Accelerator",
        "Junkyard",
        "Wise Spending",
        "Windfall",
        "March of Progress",
        "High End Shopping",
        "High Roller",
        "Level Up!",
        "Golden Ticket",
        "Item Grab Bag I",
        "Item Grab Bag II",
        "Salvage Bin",
        "Portable Forge",
        "Phony Frontline",
    }:
        return "ECONOMY"
    return "COMBAT"


def immediate_rewards(name: str, desc: str, tier: str) -> dict:
    r: dict = {}
    if m := re.search(r"Gain (\d+) gold", desc, re.I):
        r["immediateGold"] = int(m.group(1))
    elif name == "Rich Get Richer":
        r["immediateGold"] = 10
    elif name == "Windfall":
        r["immediateGold"] = 18
    elif name == "Wise Spending":
        r["immediateGold"] = 4
    elif name == "High Roller":
        r["immediateGold"] = 8
    elif name == "Clockwork Soul" or name.endswith("Soul"):
        r["immediateGold"] = r.get("immediateGold", 8)
    if "Item Grab Bag I" in name:
        r["immediateCompletedItems"] = ["INFINITY_EDGE"]
    if "Item Grab Bag II" in name:
        r["immediateCompletedItems"] = ["INFINITY_EDGE", "RABADONS_DEATHCAP"]
    if name == "Salvage Bin":
        r["immediateCompletedItems"] = ["BLOODTHIRSTER"]
    if name == "Calculated Loss":
        r["immediateGold"] = r.get("immediateGold", 0)
    if tier == "GOLD" and "Crest" in name and "Mercenary" in name:
        r["immediateGold"] = 3
    if name == "New Recruit":
        r["immediateGold"] = r.get("immediateGold", 0)
    if name == "Level Up!":
        r["immediateGold"] = r.get("immediateGold", 0)
    if name == "Ancient Archives":
        r["immediateGold"] = 1  # placeholder Tome simplified
    return r


TIERED_KO_PREFIX = {
    "Built Different": "다른 태생",
    "Celestial Blessing": "천상의 축복",
    "Chemical Overload": "화학적 과부하",
    "Cybernetic Implants": "사이버네틱 이식술",
    "Exiles": "추방자",
    "Featherweights": "경량급",
    "Knife's Edge": "나이프의 날",
    "Makeshift Armor": "임시변통 방어구",
    "Runic Shield": "룬 보호막",
    "Stand United": "단결된 의지",
    "Thrill of the Hunt": "사냥의 전율",
}

FIXED_KO_NAME = {
    "Ancient Archives": "고대의 기록 보관소",
    "Arcanist Crest": "비전 마법사 문장",
    "Dual Rule": "이중 규율",
    "Scoped Weapons": "조준 무기",
    "Tinker": "땜장이",
    "Self-Repair": "자가 복구",
    "All For One": "모든 것을 위해",
    "Cram Session": "벼락치기",
    "Academy Heart": "아카데미 심장",
    "Academy Crest": "아카데미 문장",
    "Academy Crown": "아카데미 왕관",
    "Imperial Heart": "제국 심장",
    "Imperial Crest": "제국 문장",
    "Imperial Crown": "제국 왕관",
    "Protector Heart": "봉쇄자의 심장",
    "Protector Crest": "봉쇄자 문장",
    "Protector Crown": "봉쇄자 왕관",
    "Ardent Censer": "불타는 향로",
    "Ascension": "초월",
    "Armor Plating": "철갑",
    "Binary Airdrop": "이중 공중 보급",
    "Band of Thieves": "도적 무리",
    "Broken Stopwatch": "망가진 초시계",
    "Calculated Loss": "계산된 패배",
    "Clear Mind": "맑은 정신",
    "Cutthroat": "자객",
    "Dominance": "지배",
    "Duet": "이중주",
    "En Garde": "준비 태세",
    "First Aid Kit": "응급처치 키트",
    "Gold Reserves": "골드 비축",
    "Golden Ticket": "황금 티켓",
    "High End Shopping": "품격있는 쇼핑",
    "High Roller": "큰손",
    "Hyper Roll": "초고속 모드",
    "Instant Injection": "즉시 주입",
    "Item Grab Bag I": "아이템 꾸러미 I",
    "Item Grab Bag II": "아이템 꾸러미 II",
    "Junkyard": "고철장",
    "Level Up!": "레벨 업!",
    "Lifelong Learning": "평생 학습",
    "March of Progress": "진보의 행진",
    "Metabolic Accelerator": "대사 촉진제",
    "New Recruit": "신병",
    "One For All": "물려주기",
    "Pandora's Items": "판도라의 아이템",
    "Payday": "수금",
    "Phony Frontline": "허수아비 전선",
    "Pirates": "해적",
    "Portable Forge": "휴대용 대장간",
    "Rich Get Richer": "부익부",
    "Salvage Bin": "재활용 쓰레기통",
    "Share the Spotlight": "스포트라이트 공유",
    "Sharpshooter": "명사수",
    "Shrug It Off": "강인함",
    "Smoke Bomb": "연막",
    "Sniper's Nest": "저격수의 은신처",
    "So Small": "초소형",
    "Spell Blade": "주문 칼날",
    "Stand Behind Me": "내가 지킨다",
    "Sunfire Board": "태양불꽃판",
    "Titanic Force": "거인의 힘",
    "Trade Sector": "교환의 장",
    "Underdogs": "약자",
    "Unstable Evolution": "불안정한 진화",
    "Weakspot": "약점",
    "Windfall": "뜻밖의 횡재",
    "Wise Spending": "현명한 소비",
    "Woodland Charm": "숲의 부적",
}


def load_trait_korean_names() -> dict[str, str]:
    """TraitId -> Korean label from traits.ts (game UI source of truth)."""
    text = TRAITS_PATH.read_text()
    out: dict[str, str] = {}
    for m in re.finditer(
        r"\n\s+([A-Z_]+):\s*\{[^}]*?name:\s*'([^']+)'",
        text,
        re.DOTALL,
    ):
        out[m.group(1)] = m.group(2)
    return out


def load_trait_en_to_ko() -> dict[str, str]:
    trait_id_ko = load_trait_korean_names()
    return {en: trait_id_ko[tid] for en, tid in TRAIT_MAP.items() if tid in trait_id_ko}


def ko_name(en_name: str, trait_en_to_ko: dict[str, str]) -> str:
    if en_name in FIXED_KO_NAME:
        return FIXED_KO_NAME[en_name]

    if m := re.match(r"^(.*) (I|II|III)$", en_name):
        base, tier = m.group(1), m.group(2)
        if base in TIERED_KO_PREFIX:
            return f"{TIERED_KO_PREFIX[base]} {tier}"

    if m := re.match(r"^([A-Za-z ]+) Heart$", en_name):
        trait_en = m.group(1)
        label = trait_en_to_ko.get(trait_en, trait_en)
        if trait_en in {"Arcanist", "Academy"}:
            return f"{label} 심장"
        return f"{label}의 심장"

    if m := re.match(r"^([A-Za-z ]+) Crest$", en_name):
        trait_en = m.group(1)
        label = trait_en_to_ko.get(trait_en, trait_en)
        return f"{label} 문장"

    if m := re.match(r"^([A-Za-z ]+) Crown$", en_name):
        trait_en = m.group(1)
        label = trait_en_to_ko.get(trait_en, trait_en)
        return f"{label} 왕관"

    if m := re.match(r"^([A-Za-z ]+) Soul$", en_name):
        trait_en = m.group(1)
        label = trait_en_to_ko.get(trait_en, trait_en)
        return f"{label}의 영혼"

    return en_name


def load_ko_locale() -> dict[str, str]:
    if KO_LOCALE_PATH.exists():
        return json.loads(KO_LOCALE_PATH.read_text())
    return {}


def ko_description(ko_label: str, locale: dict[str, str], fallback_en: str) -> str:
    if ko_label in locale:
        return locale[ko_label]
    # Innovator / 발명가 naming drift: lolchess list uses 혁신가
    alt = ko_label.replace("발명가", "혁신가")
    if alt in locale:
        return locale[alt]
    return fallback_en


def emit_ts(augments: list[dict]) -> str:
    effect_keys = sorted({a["effectKey"] for a in augments})
    keys_union = "\n  | ".join(f"'{k}'" for k in effect_keys)

    lines = [
        "// src/GameData/augments.ts",
        "// AUTO-GENERATED by scripts/generate_set6_augments.py — Set 6 Gizmos & Gadgets roster",
        "",
        "import type { AugmentTier, BaseItemId, CompletedItemId, TraitId } from './types';",
        "",
        "export type AugmentCategory = 'ECONOMY' | 'COMBAT' | 'HERO' | 'TRAIT';",
        "",
        "export type AugmentEffectKey =",
        f"  | {keys_union};",
        "",
        "export interface AugmentDefinition {",
        "  id: string;",
        "  name: string;",
        "  tier: AugmentTier;",
        "  category: AugmentCategory;",
        "  effectKey: AugmentEffectKey;",
        "  icon: string;",
        "  description: string;",
        "  bonusTrait?: TraitId;",
        "  bonusTraitCount?: number;",
        "  immediateGold?: number;",
        "  immediateDuplicators?: number;",
        "  immediateBaseItems?: BaseItemId[];",
        "  immediateCompletedItems?: CompletedItemId[];",
        "  immediateUnitId?: string;",
        "  immediateXp?: number;",
        "  immediateHp?: number;",
        "  freeRerollsGranted?: number;",
        "}",
        "",
        "export const AUGMENT_DEFINITIONS: AugmentDefinition[] = [",
    ]

    tier_order = {"SILVER": 0, "GOLD": 1, "PRISMATIC": 2}
    augments.sort(key=lambda a: (tier_order.get(a["tier"], 9), a["effectKey"]))

    for a in augments:
        fields = [
            f"    id: '{a['id']}',",
            f"    name: {json.dumps(a['nameKo'], ensure_ascii=False)},",
            f"    tier: '{a['tier']}',",
            f"    category: '{a['category']}',",
            f"    effectKey: '{a['effectKey']}',",
            "    icon: '✨',",
            f"    description: {json.dumps(a['descriptionKo'], ensure_ascii=False)},",
        ]
        for k in (
            "bonusTrait",
            "bonusTraitCount",
            "immediateGold",
            "immediateDuplicators",
            "immediateBaseItems",
            "immediateCompletedItems",
            "immediateUnitId",
            "immediateXp",
            "immediateHp",
            "freeRerollsGranted",
        ):
            if k in a and a[k] is not None:
                val = a[k]
                if isinstance(val, str):
                    fields.append(f"    {k}: '{val}',")
                elif isinstance(val, list):
                    inner = ", ".join(f"'{x}'" for x in val)
                    fields.append(f"    {k}: [{inner}],")
                else:
                    fields.append(f"    {k}: {val},")
        lines.append("  {")
        lines.extend(fields)
        lines.append("  },")

    lines.append("];")
    lines.append("")
    lines.append("export const AUGMENT_BY_EFFECT_KEY: Record<AugmentEffectKey, AugmentDefinition> =")
    lines.append("  Object.fromEntries(AUGMENT_DEFINITIONS.map((a) => [a.effectKey, a])) as Record<")
    lines.append("    AugmentEffectKey,")
    lines.append("    AugmentDefinition")
    lines.append("  >;")
    lines.append("")
    return "\n".join(lines)


def main() -> None:
    blob = json.loads(JSON_PATH.read_text())
    rows = blob["augments"] if isinstance(blob, dict) and "augments" in blob else blob
    champs = load_champion_units()
    trait_en_to_ko = load_trait_en_to_ko()
    locale = load_ko_locale()
    augments: list[dict] = []
    missing_ko: list[str] = []
    for row in rows:
        name = row["name"]
        desc = row.get("descriptionEn") or row.get("description", "")
        effect_key = effect_key_from_name(name)
        trait, trait_count = detect_trait(name, desc)
        unit = None
        if row.get("championGrant"):
            cg = row["championGrant"]
            unit = champs.get(cg) or champs.get(slug_key(cg))
        if unit is None:
            unit = detect_unit(desc, champs)
        cat = category_for(name, desc, trait)
        display_ko = ko_name(name, trait_en_to_ko)
        if display_ko == name:
            missing_ko.append(name)
        desc_ko = row.get("descriptionKo") or ko_description(display_ko, locale, desc)
        if "Innovator" in name or (trait and trait == "INNOVATOR"):
            desc_ko = desc_ko.replace("혁신가", "발명가")
            display_ko = display_ko.replace("혁신가", "발명가")
        rec = {
            "id": augment_id(effect_key),
            "nameKo": display_ko,
            "tier": row["tier"],
            "category": cat,
            "effectKey": effect_key,
            "descriptionKo": desc_ko,
            **immediate_rewards(name, desc, row["tier"]),
        }
        if trait:
            rec["bonusTrait"] = trait
            rec["bonusTraitCount"] = trait_count
        if unit and cat == "TRAIT":
            rec["immediateUnitId"] = unit
        if name == "Calculated Loss":
            rec["freeRerollsGranted"] = 0
        if name == "Trade Sector":
            rec["freeRerollsGranted"] = 1
        augments.append(rec)

    OUT_PATH.write_text(emit_ts(augments))
    counts = {}
    for a in augments:
        counts[a["tier"]] = counts.get(a["tier"], 0) + 1
    if missing_ko:
        print("WARN: missing Korean display name for:", missing_ko)
    print(f"Wrote {OUT_PATH} total={len(augments)} counts={counts}")


if __name__ == "__main__":
    main()