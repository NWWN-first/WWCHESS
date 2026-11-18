import { describe, expect, it } from 'vitest';
import { AUGMENT_DEFINITIONS, AUGMENT_BY_EFFECT_KEY } from './augments';
import { TRAIT_DEFINITIONS } from './traits';

const TRAIT_TABLE_TRAITS = [
  'ACADEMY',
  'ARCANIST',
  'ASSASSIN',
  'BODYGUARD',
  'BRUISER',
  'CHALLENGER',
  'CHEMTECH',
  'CLOCKWORK',
  'ENCHANTER',
  'ENFORCER',
  'IMPERIAL',
  'INNOVATOR',
  'MERCENARY',
  'MUTANT',
  'PROTECTOR',
  'SCHOLAR',
  'SCRAP',
  'SNIPER',
  'SOCIALITE',
  'SYNDICATE',
  'TWINSHOT',
] as const;

describe('Set 6 augment roster', () => {
  it('has 149 augments (user banner 57+49+43) with Korean display names', () => {
    expect(AUGMENT_DEFINITIONS.length).toBe(149);
    const asciiOnly = AUGMENT_DEFINITIONS.filter((a) =>
      /^[A-Za-z0-9! .'\-]+$/.test(a.name),
    );
    expect(asciiOnly.map((a) => a.name)).toEqual([]);
  });

  it('counts tiers per user banner (57/49/43)', () => {
    const by = { SILVER: 0, GOLD: 0, PRISMATIC: 0 };
    for (const a of AUGMENT_DEFINITIONS) {
      by[a.tier] += 1;
    }
    expect(by).toEqual({ SILVER: 57, GOLD: 49, PRISMATIC: 43 });
  });

  it('trait Heart/Crest/Crown·Soul coverage matches user trait table', () => {
    const have = new Set(
      AUGMENT_DEFINITIONS.filter((a) => a.category === 'TRAIT').map(
        (a) => `${a.bonusTrait}:${a.tier}:${a.bonusTraitCount ?? 0}`,
      ),
    );
    const needHeart = (t: string) => have.has(`${t}:SILVER:1`);
    const needCrest = (t: string) => have.has(`${t}:GOLD:1`);
    const needPrism2 = (t: string) => have.has(`${t}:PRISMATIC:2`);

    const crestTraits = new Set([
      'ACADEMY',
      'ARCANIST',
      'ASSASSIN',
      'BODYGUARD',
      'BRUISER',
      'CHALLENGER',
      'CHEMTECH',
      'CLOCKWORK',
      'IMPERIAL',
      'MERCENARY',
      'MUTANT',
      'PROTECTOR',
      'SCHOLAR',
      'SCRAP',
      'SNIPER',
      'SYNDICATE',
    ]);
    const crownTraits = new Set([
      'ACADEMY',
      'ARCANIST',
      'ASSASSIN',
      'BODYGUARD',
      'BRUISER',
      'CHALLENGER',
      'CHEMTECH',
      'IMPERIAL',
      'MUTANT',
      'PROTECTOR',
      'SNIPER',
      'SYNDICATE',
    ]);
    const soulTraits = new Set([
      'CLOCKWORK',
      'ENCHANTER',
      'ENFORCER',
      'INNOVATOR',
      'MERCENARY',
      'SCHOLAR',
      'SCRAP',
      'SOCIALITE',
      'TWINSHOT',
    ]);

    for (const t of TRAIT_TABLE_TRAITS) {
      expect(needHeart(t), `${t} heart`).toBe(true);
      if (crestTraits.has(t)) expect(needCrest(t), `${t} crest`).toBe(true);
      if (crownTraits.has(t)) expect(needPrism2(t), `${t} crown`).toBe(true);
      if (soulTraits.has(t)) expect(needPrism2(t), `${t} soul`).toBe(true);
    }
  });

  it('includes user-only augments missing from lolchess scrape', () => {
  const keys = new Set(AUGMENT_DEFINITIONS.map((a) => a.effectKey));
  for (const k of [
      'DUAL_RULE',
      'SCOPED_WEAPONS',
      'TINKER',
      'ACADEMY_HEART',
      'IMPERIAL_HEART',
      'PROTECTOR_HEART',
      'ALL_FOR_ONE',
      'CRAM_SESSION',
      'ACADEMY_CREST',
      'IMPERIAL_CREST',
      'PROTECTOR_CREST',
      'ARCANIST_CREST',
      'THRILL_OF_THE_HUNT_3',
      'ACADEMY_CROWN',
      'IMPERIAL_CROWN',
      'PROTECTOR_CROWN',
    ]) {
      expect(keys.has(k as keyof typeof AUGMENT_BY_EFFECT_KEY)).toBe(true);
    }
    expect(keys.has('ARCANE_CREST' as never)).toBe(false);
  });

  it('trait offers use valid TraitId', () => {
    for (const a of AUGMENT_DEFINITIONS) {
      if (!a.bonusTrait) continue;
      expect(TRAIT_DEFINITIONS[a.bonusTrait]).toBeDefined();
    }
  });

  it('champion grants from user trait table', () => {
    expect(AUGMENT_BY_EFFECT_KEY.CHALLENGER_HEART.immediateUnitId).toBe(
      'u2_warwick',
    );
    expect(AUGMENT_BY_EFFECT_KEY.SCHOLAR_HEART.immediateUnitId).toBe(
      'u3_lissandra',
    );
    expect(AUGMENT_BY_EFFECT_KEY.SCRAP_HEART.immediateUnitId).toBe('u3_ekko');
    expect(AUGMENT_BY_EFFECT_KEY.TWINSHOT_HEART.immediateUnitId).toBe(
      'u1_graves',
    );
    expect(AUGMENT_BY_EFFECT_KEY.BODYGUARD_HEART.immediateUnitId).toBe(
      'u3_leona',
    );
    expect(AUGMENT_BY_EFFECT_KEY.PAYDAY.tier).toBe('GOLD');
    expect(AUGMENT_BY_EFFECT_KEY.SHRUG_IT_OFF.tier).toBe('GOLD');
    expect(AUGMENT_BY_EFFECT_KEY.HIGH_ROLLER.tier).toBe('GOLD');
    expect(AUGMENT_BY_EFFECT_KEY.WISE_SPENDING.tier).toBe('GOLD');
  });

  it('includes signature Set 6 Korean names', () => {
    const names = new Set(AUGMENT_DEFINITIONS.map((a) => a.name));
    expect(names.has('고대의 기록 보관소')).toBe(true);
    expect(names.has('다른 태생 I')).toBe(true);
    expect(names.has('봉쇄자 문장')).toBe(true);
    expect(names.has('비전 마법사 왕관')).toBe(true);
    expect(names.has('시계태엽의 영혼')).toBe(true);
    expect(names.has('조준 무기')).toBe(true);
    expect(names.has('땜장이')).toBe(true);
  });
});