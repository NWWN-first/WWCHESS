#!/usr/bin/env python3
"""Generate Set 6 units.ts stats/skills from lolchess championRefs JSON."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UNITS_PATH = ROOT / "src/GameData/units.ts"
CHAMPS_PATH = ROOT / "scripts" / "set6_lolchess_champions.json"

NAME_MAP = {
    "TwistedFate": ("twisted_fate", "트위스티드 페이트"),
    "KogMaw": ("kogmaw", "코그모"),
    "MissFortune": ("miss_fortune", "미스 포츈"),
    "ChoGath": ("chogath", "초가스"),
    "DrMundo": ("dr_mundo", "문도 박사"),
    "KaiSa": ("kaisa", "카이사"),
    "TahmKench": ("tahm_kench", "탐 켄치"),
    "Heimerdinger": ("heimerdinger", "하이머딩거"),
}


def slug_and_korean(key: str, cost: int) -> tuple[str, str]:
    if key in NAME_MAP:
        return NAME_MAP[key]
    slug = re.sub(r"(?<!^)(?=[A-Z])", "_", key).lower()
    return slug, key  # korean filled from existing file


def parse_triplets(stats: list[str]) -> list[tuple[str, list[float]]]:
    out = []
    for line in stats:
        m = re.search(r"([\d.]+)%?\s*/\s*([\d.]+)%?\s*/\s*([\d.]+)%?", line)
        if m:
            out.append((line.split(":")[0].strip(), [float(m.group(i)) for i in range(1, 4)]))
    return out


def pick_skill_values(champ: dict) -> tuple[list[int], list[int] | None]:
    triplets = parse_triplets(champ["skill"].get("stats", []))
    primary = None
    secondary = None
    by_label = {label.lower(): [int(round(v)) for v in vals] for label, vals in triplets}

    for label, vals in triplets:
        low = label.lower()
        if low.startswith("damage") or low.startswith("initial damage") or low.startswith("dash damage"):
            primary = [int(round(v)) for v in vals]
            break

    if primary is None:
        for label, vals in triplets:
            low = label.lower()
            if "current health damage" in low or "% health" in low:
                primary = [int(round(v)) for v in vals]
            elif low.startswith("bonus damage"):
                primary = [int(round(v)) for v in vals]
            elif "number of" not in low and primary is None and "damage" in low:
                primary = [int(round(v)) for v in vals]

    if "healing" in by_label:
        secondary = by_label["healing"]
    elif "heal" in by_label:
        secondary = by_label["heal"]
    elif primary is None and triplets:
        primary = triplets[0][1]
        primary = [int(round(v)) for v in primary]

    if primary is None:
        primary = [100, 150, 225]

    if champ["key"] == "Veigar" and "damage" in by_label:
        primary = by_label["damage"]
        if "number of furyhorns" in by_label:
            secondary = by_label["number of furyhorns"]
    if champ["key"] == "Warwick":
        if "current health damage" in by_label:
            primary = by_label["current health damage"]
        if "healing" in by_label:
            secondary = by_label["healing"]

    return primary, secondary


def extract_existing(text: str) -> dict:
    meta: dict[str, dict] = {}
    blocks = re.split(r"\n  (u\d+_\w+): \{", text)
    for i in range(1, len(blocks), 2):
        uid = blocks[i]
        body = blocks[i + 1]
        name_m = re.search(r"name: '([^']+)'", body)
        traits_m = re.search(r"traits: \[([^\]]+)\]", body)
        icon_m = re.search(r"icon: '([^']+)'", body)
        skill_m = re.search(r"skillType: '([^']+)'", body)
        if not (name_m and traits_m and icon_m and skill_m):
            continue
        traits = [t.strip().strip("'") for t in traits_m.group(1).split(",") if t.strip()]
        meta[uid] = {
            "name": name_m.group(1),
            "traits": traits,
            "icon": icon_m.group(1),
            "skillType": skill_m.group(1),
        }
    return meta


def main() -> None:
    champs = json.loads(CHAMPS_PATH.read_text())
    old_path = Path("/tmp/units_old.ts")
    existing = extract_existing(old_path.read_text())

    lines = [
        "// src/GameData/units.ts — TFT Set 6 roster (59 champions)",
        "",
        "import type { CostTier, TraitId, SkillType } from './types';",
        "",
        "export interface UnitStats {",
        "  hp: number;",
        "  atk: number;",
        "  def: number;",
        "  atkSpeed: number;",
        "  range: number;",
        "  startMana: number;",
        "  maxMana: number;",
        "}",
        "",
        "export interface UnitSkillTemplate {",
        "  name: string;",
        "  description: string;",
        "  skillType: SkillType;",
        "  baseValueByStar: [number, number, number];",
        "  secondaryValueByStar?: [number, number, number];",
        "  manaLockMs: number;",
        "}",
        "",
        "export interface UnitTemplate {",
        "  id: string;",
        "  name: string;",
        "  cost: CostTier;",
        "  traits: TraitId[];",
        "  icon: string;",
        "  stats: UnitStats;",
        "  skill: UnitSkillTemplate;",
        "}",
        "",
        "export const UNIT_TEMPLATES: Record<string, UnitTemplate> = {",
    ]

    for champ in sorted(champs, key=lambda c: (c["cost"][0], c["key"])):
        key = champ["key"]
        cost = champ["cost"][0]
        slug, _ = slug_and_korean(key, cost)
        unit_id = f"u{cost}_{slug}"
        old = existing.get(unit_id, {})
        name = old.get("name", key)
        traits = old.get("traits", [])
        icon = old.get("icon", "⭐")
        skill_type = old.get("skillType", "ARCANE_BOLT")

        if unit_id == "u5_veigar":
            skill_type = "FURYHORN_STORM"

        hp = champ["health"][0]
        atk = champ["attackDamage"][0]
        armor = champ["armor"]
        atk_speed = champ["attackSpeed"]
        rng = champ["attackRange"]
        start_mana = champ["skill"].get("startingMana", 0)
        max_mana = champ["skill"].get("skillMana", 60)
        skill_name = champ["skill"]["name"].replace("'", "\\'")
        skill_desc = re.sub(
            r"\s+",
            " ",
            champ["skill"]["desc"]
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\r", " ")
            .replace("\n", " "),
        ).strip()[:220]
        primary, secondary = pick_skill_values(champ)

        block = f"""  {unit_id}: {{
    id: '{unit_id}',
    name: '{name}',
    cost: {cost},
    traits: [{", ".join(f"'{t}'" for t in traits)}],
    icon: '{icon}',
    stats: {{ hp: {hp}, atk: {atk}, def: {armor}, atkSpeed: {atk_speed}, range: {rng}, startMana: {start_mana}, maxMana: {max_mana} }},
    skill: {{
      name: '{skill_name}',
      description: '{skill_desc[:240]}',
      skillType: '{skill_type}',
      baseValueByStar: [{primary[0]}, {primary[1]}, {primary[2]}],"""

        if secondary:
            block += f"\n      secondaryValueByStar: [{secondary[0]}, {secondary[1]}, {secondary[2]}],"
        block += """
      manaLockMs: 900,
    },
  },"""
        lines.append(block)

    tail = UNITS_PATH.read_text().split("export const YORDLE_UNIT_IDS")[1]
    lines.append("};")
    lines.append("")
    lines.append("export const YORDLE_UNIT_IDS" + tail)
    UNITS_PATH.write_text("\n".join(lines))
    print(f"Wrote {UNITS_PATH} ({len(champs)} champions)")


if __name__ == "__main__":
    main()