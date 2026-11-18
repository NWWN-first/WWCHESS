import { describe, expect, it } from 'vitest';
import { UNIT_TEMPLATES } from './units';

const SET6_FIVE_COST = [
  'u5_galio',
  'u5_veigar',
  'u5_viktor',
  'u5_akali',
  'u5_yuumi',
  'u5_jayce',
  'u5_jinx',
  'u5_kaisa',
  'u5_tahm_kench',
] as const;

describe('Set 6 five-cost baseline stats (lolchess)', () => {
  it.each(SET6_FIVE_COST)('%s has Set 6 5-cost baselines', (unitId) => {
    const u = UNIT_TEMPLATES[unitId];
    expect(u.cost).toBe(5);
    expect(u.stats.hp).toBeGreaterThanOrEqual(750);
    expect(u.stats.maxMana).toBeGreaterThan(0);
    expect(u.skill.baseValueByStar[0]).toBeGreaterThan(0);
    expect(u.skill.baseValueByStar[2]).toBeGreaterThan(u.skill.baseValueByStar[0]);
  });

  it('Veigar uses Furyhorn Storm skill type', () => {
    expect(UNIT_TEMPLATES.u5_veigar.skill.skillType).toBe('FURYHORN_STORM');
    expect(UNIT_TEMPLATES.u5_veigar.skill.name).toBe('Furyhorn Storm');
  });
});