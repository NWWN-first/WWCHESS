import { describe, expect, it } from 'vitest';
import { GAME_CONTENT_STATS } from './contentStats';
import { TRAIT_DEFINITIONS } from './traits';
import { UNIT_TEMPLATES, UNITS_BY_COST, YORDLE_UNIT_IDS } from './units';
import type { TraitId } from './types';

describe('Set 6 content roster', () => {
  it('defines 28 traits and 59 champions', () => {
    expect(GAME_CONTENT_STATS.traitCount).toBe(28);
    expect(GAME_CONTENT_STATS.championCount).toBe(59);
    expect(Object.keys(TRAIT_DEFINITIONS).length).toBe(28);
    expect(Object.keys(UNIT_TEMPLATES).length).toBe(59);
  });

  it('matches TFT Set 6 pool sizes (13/13/13/11/9)', () => {
    expect(UNITS_BY_COST[1].length).toBe(13);
    expect(UNITS_BY_COST[2].length).toBe(13);
    expect(UNITS_BY_COST[3].length).toBe(13);
    expect(UNITS_BY_COST[4].length).toBe(11);
    expect(UNITS_BY_COST[5].length).toBe(9);
  });

  it('tags Veigar with YORDLE_LORD only', () => {
    expect(UNIT_TEMPLATES.u5_veigar.traits).toEqual(['YORDLE_LORD']);
  });

  it('lists yordle roster ids for lord stub (excludes Veigar)', () => {
    expect(YORDLE_UNIT_IDS).toHaveLength(6);
    expect(YORDLE_UNIT_IDS).not.toContain('u5_veigar');
  });

  it('rejects unknown trait ids on units', () => {
    const valid = new Set(Object.keys(TRAIT_DEFINITIONS) as TraitId[]);
    for (const unit of Object.values(UNIT_TEMPLATES)) {
      for (const trait of unit.traits) {
        expect(valid.has(trait)).toBe(true);
      }
    }
  });
});