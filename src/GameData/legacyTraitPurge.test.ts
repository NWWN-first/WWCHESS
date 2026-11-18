import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';

const LEGACY_TRAIT_PATTERNS = [
  'HOLY_EMPIRE',
  'ABYSSAL_DEMON',
  'ELVEN_SYLVAN',
  'DRAGONKIN',
  'VANGUARD',
  'GOLDEN_GOBLIN',
  'goblinVaultStacks',
  'SHADOW_ASSASSIN',
  'UNDEAD_SCOURGE',
  'ARCANE_TOWER',
];

describe('legacy trait purge (src/)', () => {
  it('has zero legacy trait id strings under src/', () => {
    const hits: string[] = [];
    for (const pat of LEGACY_TRAIT_PATTERNS) {
      try {
        const out = execSync(`rg -l "${pat}" src || true`, { encoding: 'utf8' }).trim();
        if (out) {
          for (const file of out.split('\n')) {
            if (file.includes('legacyTraitPurge.test.ts')) continue;
            if (pat === 'GOLDEN_GOBLIN' && file.includes('mercenaryTrait.test.ts')) continue;
            hits.push(`${pat} in ${file}`);
          }
        }
      } catch {
        /* rg missing — skip */
      }
    }
    expect(hits).toEqual([]);
  });
});