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

describe('Set 6 five-cost baseline stats', () => {
  it.each(SET6_FIVE_COST)('%s is 5-cost with mana gate', (unitId) => {
    const u = UNIT_TEMPLATES[unitId];
    expect(u.cost).toBe(5);
    expect(u.stats.maxMana).toBeGreaterThanOrEqual(85);
    expect(u.skill.baseValueByStar[0]).toBeGreaterThan(400);
  });
});