#!/usr/bin/env python3
"""Apply V2.1 trait definitions + 60-unit roster into src/GameData.ts."""
from __future__ import annotations

import json
import pathlib
import re

ROOT = pathlib.Path("/workspace")
GAMEDATA = ROOT / "src/GameData.ts"
CATALOG = pathlib.Path("/tmp/catalog_v21.json")
TRAITS = pathlib.Path("/tmp/traits_v21.ts")


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'")


def main() -> None:
    gamedata = GAMEDATA.read_text()
    catalog = json.loads(CATALOG.read_text())
    for u in catalog:
        if u["id"] == "u3_nyx":
            u["skillName"] = "악몽의 균열"
            u["skillDescription"] = (
                "대상에게 심연 마법 피해를 준 뒤 잠시 모습을 감추고 "
                "후열로 재등장해 추가 일격을 가합니다."
            )

    origin = {
        "HOLY": "HOLY_EMPIRE",
        "ABYSS": "ABYSSAL_DEMON",
        "ELF": "ELVEN_SYLVAN",
        "DRAGON": "DRAGONKIN",
        "UNDEAD": "UNDEAD_SCOURGE",
        "ARCANE": "ARCANE_TOWER",
        "GOBLIN": "GOLDEN_GOBLIN",
        "BEAST": "BEASTKIN",
    }
    clazz = {
        "VANGUARD": "VANGUARD",
        "BERSERKER": "BERSERKER",
        "RANGER": "RANGER",
        "ARCHMAGE": "ARCHMAGE",
        "ASSASSIN": "SHADOW_ASSASSIN",
        "PALADIN": "PALADIN",
        "ARTIFICER": "ARTIFICER",
        "STRATEGIST": "STRATEGIST",
    }

    old: dict = {}
    for m in re.finditer(r"\n  (u\d_[a-z0-9]+):\s*\{", gamedata):
        uid = m.group(1)
        rest = gamedata[m.end() :]
        n = re.search(r"\n  (u\d_[a-z0-9]+):\s*\{", rest)
        chunk = gamedata[m.start() : m.end() + (n.start() if n else 5000)]
        stats = {}
        for k in ["hp", "atk", "def", "atkSpeed", "range", "startMana", "maxMana"]:
            mm = re.search(rf"{k}:\s*([0-9.]+)", chunk)
            if mm:
                stats[k] = float(mm.group(1)) if "." in mm.group(1) else int(mm.group(1))
        st = re.search(r"skillType:\s*'([^']+)'", chunk)
        icon = re.search(r"icon:\s*'([^']+)'", chunk)
        bv = re.search(r"baseValueByStar:\s*\[([^\]]+)\]", chunk)
        sv = re.search(r"secondaryValueByStar:\s*\[([^\]]+)\]", chunk)
        mana = re.search(r"manaLockMs:\s*(\d+)", chunk)
        old[uid] = {
            "stats": stats,
            "skillType": st.group(1) if st else "ARCANE_BOLT",
            "icon": icon.group(1) if icon else "⚔️",
            "baseValueByStar": bv.group(1) if bv else "200, 320, 520",
            "secondaryValueByStar": sv.group(1) if sv else None,
            "manaLockMs": int(mana.group(1) if mana else 900),
        }

    role_stats = {
        "VANGUARD": {"hp": 1.15, "atk": 0.85, "def": 1.25, "atkSpeed": 0.9, "range": 1, "startMana": 40},
        "PALADIN": {"hp": 1.1, "atk": 0.9, "def": 1.15, "atkSpeed": 0.95, "range": 1, "startMana": 35},
        "BERSERKER": {"hp": 1.05, "atk": 1.15, "def": 0.95, "atkSpeed": 1.05, "range": 1, "startMana": 25},
        "ASSASSIN": {"hp": 0.9, "atk": 1.2, "def": 0.8, "atkSpeed": 1.15, "range": 1, "startMana": 20},
        "RANGER": {"hp": 0.85, "atk": 1.1, "def": 0.7, "atkSpeed": 1.15, "range": 4, "startMana": 0},
        "ARCHMAGE": {"hp": 0.85, "atk": 0.9, "def": 0.75, "atkSpeed": 0.95, "range": 3, "startMana": 30},
        "ARTIFICER": {"hp": 1.0, "atk": 0.95, "def": 1.05, "atkSpeed": 0.95, "range": 2, "startMana": 30},
        "STRATEGIST": {"hp": 0.95, "atk": 1.0, "def": 0.9, "atkSpeed": 1.0, "range": 3, "startMana": 25},
    }
    base_by_cost = {
        1: {"hp": 600, "atk": 55, "def": 30, "atkSpeed": 0.7, "maxMana": 75},
        2: {"hp": 720, "atk": 65, "def": 35, "atkSpeed": 0.72, "maxMana": 78},
        3: {"hp": 880, "atk": 78, "def": 42, "atkSpeed": 0.75, "maxMana": 82},
        4: {"hp": 1050, "atk": 92, "def": 50, "atkSpeed": 0.78, "maxMana": 88},
        5: {"hp": 1250, "atk": 105, "def": 58, "atkSpeed": 0.82, "maxMana": 90},
    }
    class_skill = {
        "VANGUARD": ("SELF_SHIELD_SLASH", [220, 360, 580], [200, 320, 500]),
        "PALADIN": ("SHIELD_BASH_HEAL", [200, 340, 560], [180, 300, 480]),
        "BERSERKER": ("THORN_SMASH", [240, 400, 650], [100, 170, 280]),
        "ASSASSIN": ("BACKLINE_CRIT_SLASH", [280, 460, 750], None),
        "RANGER": ("TRIPLE_SNIPE", [270, 430, 700], None),
        "ARCHMAGE": ("ARCANE_BOLT", [260, 420, 680], None),
        "ARTIFICER": ("ACID_BOMB_SHRED", [240, 400, 640], None),
        "STRATEGIST": ("CURRENT_HP_ARROW", [220, 380, 620], None),
    }
    class_icon = {
        "VANGUARD": "🏰",
        "PALADIN": "✨",
        "BERSERKER": "🪓",
        "ASSASSIN": "🗡️",
        "RANGER": "🏹",
        "ARCHMAGE": "⚡",
        "ARTIFICER": "🔧",
        "STRATEGIST": "♟️",
    }
    five_skill = {
        "u5_michael": ("EXCALIBUR_TEAM_SHIELD", [340, 600, 1400], [260, 450, 900]),
        "u5_lilith": ("EXECUTE_RESET", [420, 740, 1600], None),
        "u5_yggdrasil": ("EXCALIBUR_TEAM_SHIELD", [340, 600, 1400], [260, 450, 900]),
        "u5_ignis": ("APOCALYPSE_BREATH", [380, 680, 1600], None),
        "u5_bahamut": ("APOCALYPSE_BREATH", [330, 580, 1450], None),
        "u5_goldtooth": ("GOLDEN_VAULT_BOMBARD", [300, 540, 1200], None),
        "u5_kairos": ("EXECUTE_RESET", [400, 700, 1500], None),
        "u5_luciel": ("JUDGMENT_BARRAGE", [290, 520, 1250], None),
    }

    parts = ["export const UNIT_TEMPLATES: Record<string, UnitTemplate> = {"]
    for u in catalog:
        uid = u["id"]
        cost = u["cost"]
        traits = [origin[o] for o in u["origins"]] + [clazz[c] for c in u["classes"]]
        primary = u["classes"][0]
        o = old.get(uid)
        if not o and uid == "u4_chrona":
            o = old.get("u1_chrona")
        if not o and uid == "u4_snatch":
            o = old.get("u1_snatch")
        if not o and uid == "u4_bone":
            o = old.get("u2_boneknight")

        if o and o["stats"]:
            st = o["stats"]
            icon = o["icon"]
            skill_type = o["skillType"]
            bv = o["baseValueByStar"]
            sv = o["secondaryValueByStar"]
            mana = o["manaLockMs"]
        else:
            base = base_by_cost[cost]
            mult = role_stats[primary]
            st = {
                "hp": int(base["hp"] * mult["hp"]),
                "atk": int(base["atk"] * mult["atk"]),
                "def": int(base["def"] * mult["def"]),
                "atkSpeed": round(base["atkSpeed"] * mult["atkSpeed"], 2),
                "range": mult["range"],
                "startMana": mult["startMana"],
                "maxMana": base["maxMana"],
            }
            icon = class_icon[primary]
            skill_type, bv_list, sv_list = class_skill[primary]
            if uid in five_skill:
                skill_type, bv_list, sv_list = five_skill[uid]
            bv = ", ".join(str(x) for x in bv_list)
            sv = ", ".join(str(x) for x in sv_list) if sv_list else None
            mana = 900 if cost < 5 else 1000

        trait_str = ", ".join(f"'{t}'" for t in traits)
        block = f"""  {uid}: {{
    id: '{uid}',
    name: '{esc(u['name'])}',
    cost: {cost},
    traits: [{trait_str}],
    icon: '{icon}',
    stats: {{
      hp: {int(st['hp'])},
      atk: {int(st['atk'])},
      def: {int(st['def'])},
      atkSpeed: {st['atkSpeed']},
      range: {int(st['range'])},
      startMana: {int(st['startMana'])},
      maxMana: {int(st['maxMana'])},
    }},
    skill: {{
      name: '{esc(u['skillName'])}',
      description: '{esc(u['skillDescription'])}',
      skillType: '{skill_type}',
      baseValueByStar: [{bv}],
"""
        if sv:
            block += f"      secondaryValueByStar: [{sv}],\n"
        block += f"""      manaLockMs: {mana},
    }},
  }},"""
        parts.append(block)
    parts.append("};")
    units_block = "\n".join(parts)
    traits_block = TRAITS.read_text().rstrip() + "\n"

    text = gamedata
    new_trait_id = """export type TraitId =
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
"""
    text = re.sub(r"export type TraitId =[\s\S]*?;\n", new_trait_id + "\n", text, count=1)

    if "maxHpBonusRatio" not in text:
        text = text.replace(
            "  roundBonusGold?: number;\n}",
            """  roundBonusGold?: number;
  maxHpBonusRatio?: number;
  backlineDamageAmp?: number;
  frontlineDurability?: number;
  artificerShieldRatio?: number;
  artificerTurretDamage?: number;
}
""",
        )

    text = re.sub(
        r"export const TRAIT_DEFINITIONS: Record<TraitId, TraitDefinition> = \{[\s\S]*?\n\};\n\n/\*\* 메인 시너지",
        traits_block + "\n/** 메인 시너지",
        text,
        count=1,
    )
    text = re.sub(
        r"export const UNIT_TEMPLATES: Record<string, UnitTemplate> = \{[\s\S]*?\n\};\n\nexport const ALL_UNIT_LIST",
        units_block + "\n\nexport const ALL_UNIT_LIST",
        text,
        count=1,
    )
    text = text.replace("// B. 13종 판타지 시너지 정의", "// B. 16종 판타지 시너지 정의 (V2.1)")
    text = text.replace("// C. 20종 판타지 챔피언 정의", "// C. 60종 판타지 챔피언 정의 (V2.1)")

    GAMEDATA.write_text(text)
    unit_count = len(re.findall(r"^\s{2}u\d_", units_block, re.M))
    print(f"Wrote GameData.ts units={unit_count} beastkin={'BEASTKIN' in text}")


if __name__ == "__main__":
    main()
