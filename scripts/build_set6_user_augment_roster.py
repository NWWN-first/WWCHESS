#!/usr/bin/env python3
"""Merge user paste roster (canonical) with lolchess text; write scripts/set6_user_augment_roster.json."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARSED_PATH = ROOT / "scripts" / "set6_augment_149_parsed.json"
LOL_PATH = ROOT / "scripts" / "set6_lolchess_augments.json"
PASTE_PATH = Path(
    "/cursor/stores/bc-c613bb32-5eab-4307-b100-c2773894cd0c/internal/set6-augment-user-paste-extract.txt"
)
OUT_PATH = ROOT / "scripts" / "set6_user_augment_roster.json"

TIER_FIX = {
    "Payday": "GOLD",
    "Shrug It Off": "GOLD",
    "High Roller": "GOLD",
    "Wise Spending": "GOLD",
}

LOL_DROP = {"Arcane Crest"}

USER_ONLY_EN: dict[str, str] = {
    "Dual Rule": "Your team has 2 Tyrants.",
    "Scoped Weapons": (
        "Your units that attack from range gain infinite range and cannot miss their attacks."
    ),
    "Tinker": (
        "Gain a Scrap synergy effect: each combat round gain a Magnet Remover or Reforger."
    ),
    "Academy Heart": "Your team counts as having 1 additional Academy.",
    "Imperial Heart": "Your team counts as having 1 additional Imperial. Gain a Swain.",
    "Protector Heart": "Your team counts as having 1 additional Protector. Gain a Blitzcrank.",
    "All For One": (
        "When an ally dies, they grant their Tyrant 33% of their maximum health."
    ),
    "Cram Session": (
        "After the first cast, Academics recover 90% of their maximum mana."
    ),
    "Academy Crest": "Gain an Academy Emblem.",
    "Imperial Crest": "Gain an Imperial Emblem and a Talon.",
    "Protector Crest": "Gain a Protector Emblem.",
    "Arcanist Crest": "Gain an Arcanist Emblem and Twisted Fate.",
    "Thrill of the Hunt III": "Your units restore 750 Health on kill.",
    "Academy Crown": "Gain 2 Academy Emblems.",
    "Imperial Crown": "Gain 2 Imperial Emblems.",
    "Protector Crown": "Gain 2 Protector Emblems.",
}


def norm_name(name: str) -> str:
    return name.replace("\u2019", "'").replace("\u2018", "'").strip()


def load_paste_ko() -> dict[str, str]:
    text = PASTE_PATH.read_text(encoding="utf-8")
    ko: dict[str, str] = {}
    section: str | None = "SILVER"
    for line in text.splitlines():
        if line.startswith("실버 "):
            section = "SILVER"
            continue
        if line.startswith("골드 "):
            section = "GOLD"
            continue
        if line.startswith("프리즘 "):
            section = "PRISMATIC"
            continue
        if line.startswith("특성 증강"):
            break
        if section is None or "\t" not in line:
            continue
        name, effect = line.split("\t", 1)
        name = norm_name(name.strip())
        if name in ("증강", "특성") or not name:
            continue
        effect = effect.strip()
        ko[name] = effect
        if name == "Self-Repair":
            ko["Self Repair"] = effect
    return ko


def champion_grants(parsed: dict) -> dict[str, str | None]:
    """Augment English name -> champion grant from user trait table."""
    grants: dict[str, str | None] = {}
    for row in parsed["trait_augments_table_verbatim"]:
        trait = row["trait"]
        for kind in ("heart", "crest", "prism"):
            cell = row.get(kind)
            if not cell or not isinstance(cell, dict):
                continue
            en = cell.get("name")
            if not en:
                continue
            cg = cell.get("champion_grant")
            grants[en] = cg
    return grants


def tier_lookup(parsed: dict) -> dict[str, str]:
    out: dict[str, str] = {}
    for tier, key in (
        ("SILVER", "SILVER_combined_sorted"),
        ("GOLD", "GOLD_combined_sorted"),
        ("PRISMATIC", "PRISMATIC_combined_sorted"),
    ):
        for n in parsed[key]:
            out[norm_name(n)] = tier
    return out


def tier_for_name(lookup: dict[str, str], name: str) -> str:
    tier = lookup.get(name)
    if not tier:
        raise KeyError(name)
    return tier


def main() -> None:
    parsed = json.loads(PARSED_PATH.read_text())
    lol_by_name = {norm_name(r["name"]): r for r in json.loads(LOL_PATH.read_text())}
    paste_ko = load_paste_ko()
    grants = champion_grants(parsed)
    tier_by = tier_lookup(parsed)

    names: list[str] = []
    for key in (
        "SILVER_combined_sorted",
        "GOLD_combined_sorted",
        "PRISMATIC_combined_sorted",
    ):
        names.extend(parsed[key])

    names = [norm_name(n) for n in names]
    if len(names) != 150:
        raise SystemExit(f"expected 150 paste rows, got {len(names)}")
    # User headline 57+49+43=149 vs 150 verbatim paste rows (see gap report). Drop So Small
    # (Yordle silver in paste; no Yordle trait augment row) to align silver tier count 57.
    names = [n for n in names if n != "So Small"]
    if len(names) != 149:
        raise SystemExit(f"expected 149 roster augments, got {len(names)}")

    roster: list[dict] = []
    for name in names:
        tier = tier_for_name(tier_by, name)
        tier = TIER_FIX.get(name, tier)
        lol = lol_by_name.get(name)
        desc_en = None
        if lol and name not in LOL_DROP:
            desc_en = lol.get("descriptionEn") or lol.get("descriptionKo")
        if name in USER_ONLY_EN:
            desc_en = USER_ONLY_EN[name]
        elif name == "Arcanist Crest" and lol_by_name.get("Arcane Crest"):
            desc_en = (
                "Gain an Arcanist Emblem and Twisted Fate."
            )
        if not desc_en:
            desc_en = f"Set 6 augment: {name}."

        desc_ko = paste_ko.get(name) or paste_ko.get(name.replace("-", " "))
        if not desc_ko and lol:
            desc_ko = lol.get("descriptionKo")
        if not desc_ko:
            desc_ko = desc_en

        rec = {
            "name": name,
            "tier": tier,
            "descriptionEn": desc_en,
            "descriptionKo": desc_ko,
        }
        if name in grants and grants[name]:
            rec["championGrant"] = grants[name]
        roster.append(rec)

    if len(roster) != 149:
        raise SystemExit(f"roster len {len(roster)}")
    # User banner total 149 vs 150 verbatim rows: see internal/set6-augment-roster-gap-5789.md
    counts = {}
    for r in roster:
        counts[r["tier"]] = counts.get(r["tier"], 0) + 1
    meta = {
        "source": "user-paste bc-c613bb32 + lolchess gap-fill",
        "tierCounts": counts,
        "total": len(roster),
        "bannerTierCounts": parsed["tier_counts_paste_banner"],
    }
    OUT_PATH.write_text(
        json.dumps({"meta": meta, "augments": roster}, indent=2, ensure_ascii=False) + "\n"
    )
    print(f"Wrote {OUT_PATH} total={len(roster)} counts={counts}")


if __name__ == "__main__":
    main()