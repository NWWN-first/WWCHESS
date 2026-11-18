import { describe, expect, it } from 'vitest';
import { AUGMENT_DEFINITIONS } from './augments';
import { TRAIT_DEFINITIONS } from './traits';

describe('Set 6 augment roster', () => {
  it('has 135 augments with Korean display names', () => {
    expect(AUGMENT_DEFINITIONS.length).toBe(135);
    const asciiOnly = AUGMENT_DEFINITIONS.filter((a) =>
      /^[A-Za-z0-9! .'\-]+$/.test(a.name)
    );
    expect(asciiOnly.map((a) => a.name)).toEqual([]);
  });

  it('counts tiers (lolchess scrape: 54/42/39)', () => {
    const by = { SILVER: 0, GOLD: 0, PRISMATIC: 0 };
    for (const a of AUGMENT_DEFINITIONS) {
      by[a.tier] += 1;
    }
    expect(by).toEqual({ SILVER: 54, GOLD: 42, PRISMATIC: 39 });
  });

  it('trait offers use valid TraitId and Korean trait labels', () => {
    for (const a of AUGMENT_DEFINITIONS) {
      if (!a.bonusTrait) continue;
      expect(TRAIT_DEFINITIONS[a.bonusTrait]).toBeDefined();
      if (a.category === 'TRAIT' && a.name.includes('심장')) {
        expect(TRAIT_DEFINITIONS[a.bonusTrait].name).toBeTruthy();
      }
    }
  });

  it('includes signature Set 6 names', () => {
    const names = new Set(AUGMENT_DEFINITIONS.map((a) => a.name));
    expect(names.has('고대의 기록 보관소')).toBe(true);
    expect(names.has('다른 태생 I')).toBe(true);
    expect(names.has('경호대 문장')).toBe(true);
    expect(names.has('비전 마법사 왕관')).toBe(true);
    expect(names.has('시계태엽의 영혼')).toBe(true);
  });
});