#!/usr/bin/env python3
"""Write full Set 6 stat/skill tables to project store docs."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "scripts" / "set6_lolchess_champions.json"
STORE_DOC = Path(
    "/cursor/stores/bc-c613bb32-5eab-4307-b100-c2773894cd0c/docs/set6-unit-stats-skills.md"
)
ROSTER = Path(
    "/cursor/stores/bc-c613bb32-5eab-4307-b100-c2773894cd0c/docs/set6-champion-roster.md"
)

SLUG = {
    "TwistedFate": "twisted_fate",
    "KogMaw": "kogmaw",
    "MissFortune": "miss_fortune",
    "ChoGath": "chogath",
    "DrMundo": "dr_mundo",
    "KaiSa": "kaisa",
    "TahmKench": "tahm_kench",
    "Heimerdinger": "heimerdinger",
}


def unit_id(key: str, cost: int) -> str:
    slug = SLUG.get(key, re.sub(r"(?<!^)(?=[A-Z])", "_", key).lower())
    return f"u{cost}_{slug}"


def main() -> None:
    champs = sorted(json.loads(JSON_PATH.read_text()), key=lambda c: (c["cost"][0], c["key"]))
    by_cost: dict[int, list] = {}
    for c in champs:
        by_cost.setdefault(c["cost"][0], []).append(c)

    lines = [
        "# Set 6 unit base stats & skills (lolchess)",
        "",
        "Source: lolchess Set 6 `championRefs` (pinned in repo `scripts/set6_lolchess_champions.json`).",
        "",
        "**Traits:** canonical list in `docs/set6-champion-roster.md` only (not the incomplete stats-paste trait snippet).",
        "",
        "**Zilean:** 2-cost only — no 1-cost duplicate row.",
        "",
        "## Conflict resolutions (implementation uses lolchess)",
        "",
        "| Unit | Field | Chosen (1★ / 2★ / 3★) |",
        "|------|--------|------------------------|",
        "| Caitlyn | Ace in the Hole damage | 800 / 1400 / **2000** |",
        "| Darius | Decimate damage | **200 / 275 / 350** (+ heal 120/140/160) |",
        "| Kog'Maw | Barrage % max HP | **8%** (all stars) |",
        "| Warwick | Eternal Hunger | **7 / 9 / 12%** current HP on-hit; heal **35 / 50 / 75** |",
        "| Gangplank | Parrrley bonus AD | **110 / 150 / 200** |",
        "",
        "## Base stats & skills by cost",
        "",
        "Columns: HP, AD, AS, Armor, MR, Range, Mana (start/max), skill name, skill text, skill stat lines.",
        "",
    ]

    for cost in sorted(by_cost):
        lines.append(f"### {cost}-cost ({len(by_cost[cost])} units)")
        lines.append("")
        lines.append(
            "| Unit | id | HP 1/2/3★ | AD 1/2/3★ | AS | Arm | MR | Rng | Mana | Skill | Skill stats |"
        )
        lines.append("|------|-----|-----------|-----------|-----|-----|-----|-----|------|-------|-------------|")
        for c in by_cost[cost]:
            uid = unit_id(c["key"], cost)
            hp = " / ".join(str(x) for x in c["health"])
            ad = " / ".join(str(x) for x in c["attackDamage"])
            mana = f"{c['skill'].get('startingMana', 0)}/{c['skill'].get('skillMana', 0)}"
            stats = "; ".join(c["skill"].get("stats", []))
            skill = c["skill"]["name"].replace("|", "/")
            lines.append(
                f"| {c['key']} | `{uid}` | {hp} | {ad} | {c['attackSpeed']} | "
                f"{c['armor']} | {c['magicalResistance']} | {c['attackRange']} | {mana} | "
                f"{skill} | {stats.replace('|', '/')} |"
            )
        lines.append("")

    lines.extend(
        [
            "## Implementation notes",
            "",
            "- `units.ts`: 1★ HP/AD base; star scaling via `STAR_STAT_MULTIPLIER`.",
            "- Skills: `src/set6/set6SkillBehaviors.ts` + `set6SkillExecutor.ts` per champion.",
            "- Passives (0 mana): Warwick, Talon — `CombatEngine.performBasicAttack`.",
            "- Jhin: fixed attack speed by star; Curtain Call on cast.",
            "- Jayce: hammer/cannon toggle on each cast.",
            "",
        ]
    )
    STORE_DOC.write_text("\n".join(lines))
    print(f"Wrote {STORE_DOC}")


if __name__ == "__main__":
    main()