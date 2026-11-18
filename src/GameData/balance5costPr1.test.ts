import { describe, expect, it } from 'vitest';
import { STAR_STAT_MULTIPLIER } from './economy';

describe('5-cost star multipliers (post Set 6 roster)', () => {
  it('aligns 5-cost 2-star hp/atk multiplier with other costs', () => {
    expect(STAR_STAT_MULTIPLIER[5][2].hpMult).toBe(STAR_STAT_MULTIPLIER[3][2].hpMult);
    expect(STAR_STAT_MULTIPLIER[5][2].atkMult).toBe(STAR_STAT_MULTIPLIER[3][2].atkMult);
  });
});