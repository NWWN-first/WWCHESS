#!/usr/bin/env python3
"""Parse lolchess-style augment markdown tables into JSON."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "scripts" / "set6_lolchess_augments.json"


def parse_table(md: str, tier: str) -> list[dict]:
    out = []
    for m in re.finditer(r"\| ([^|]+?) Disabled ([^|]+?) \| ([^|]+?) \|", md):
        name = m.group(1).strip()
        short_desc = m.group(3).strip()
        full = m.group(2).strip()
        out.append(
            {
                "name": name,
                "tier": tier,
                "descriptionEn": full if len(full) >= len(short_desc) else short_desc,
                "descriptionKo": short_desc,
            }
        )
    return out


def main() -> None:
    chunks = []
    for tier, path in [
        ("SILVER", Path(sys.argv[1]) if len(sys.argv) > 1 else None),
        ("GOLD", Path(sys.argv[2]) if len(sys.argv) > 2 else None),
        ("PRISMATIC", Path(sys.argv[3]) if len(sys.argv) > 3 else None),
    ]:
        if path and path.exists():
            chunks.extend(parse_table(path.read_text(), tier))
    if not chunks:
        combined = Path(sys.argv[1]).read_text() if len(sys.argv) > 1 else ""
        # fallback: unknown tier
        for row in parse_table(combined, "UNKNOWN"):
            row["tier"] = "UNKNOWN"
            chunks.append(row)
    OUT.write_text(json.dumps(chunks, indent=2, ensure_ascii=False))
    by = {}
    for c in chunks:
        by[c["tier"]] = by.get(c["tier"], 0) + 1
    print(json.dumps({"out": str(OUT), "counts": by, "total": len(chunks)}))


if __name__ == "__main__":
    main()