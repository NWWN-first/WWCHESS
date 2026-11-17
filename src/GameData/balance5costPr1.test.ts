import { describe, expect, it } from 'vitest';
import { STAR_STAT_MULTIPLIER } from './economy';
import { UNIT_TEMPLATES } from './units';

describe('5-cost PR1 balance (v2)', () => {
  it('aligns 5-cost 2-star hp/atk multiplier with other costs', () => {
    const m = STAR_STAT_MULTIPLIER[5][2];
    expect(m.hpMult).toBe(1.85);
    expect(m.atkMult).toBe(1.85);
    expect(m.skillMult).toBe(1.0);
  });

  it('tunes only u5_goldtooth mana and 2-star skill base (no blanket 5-cost skill buff)', () => {
    const gt = UNIT_TEMPLATES.u5_goldtooth;
    expect(gt.stats.startMana).toBe(35);
    expect(gt.stats.maxMana).toBe(82);
    expect(gt.skill.baseValueByStar[1]).toBe(990);
    expect(gt.skill.baseValueByStar[0]).toBe(480);
    expect(gt.skill.baseValueByStar[2]).toBe(99999);

    expect(UNIT_TEMPLATES.u5_ignis.skill.baseValueByStar[1]).toBe(980);
    expect(UNIT_TEMPLATES.u5_luciel.skill.baseValueByStar[1]).toBe(840);
  });
});