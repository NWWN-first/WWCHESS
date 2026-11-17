import { describe, expect, it } from 'vitest';
import { SkillRegistry } from '../SkillRegistry';
import { UNIT_TEMPLATES } from './units';

const PR2_UNITS = [
  'u5_ignis',
  'u5_luciel',
  'u5_michael',
  'u5_bahamut',
  'u5_chronos',
  'u5_lilith',
  'u5_yggdrasil',
] as const;

describe('5-cost PR2 balance (remaining 7 legends)', () => {
  it('leaves u5_goldtooth untouched from PR1', () => {
    const gt = UNIT_TEMPLATES.u5_goldtooth;
    expect(gt.stats.startMana).toBe(35);
    expect(gt.stats.maxMana).toBe(82);
    expect(gt.skill.baseValueByStar[1]).toBe(990);
  });

  it.each([
    ['u5_ignis', { startMana: 38, maxMana: 92, skill2: 1070, manaLockMs: 950 }],
    ['u5_luciel', { startMana: 34, maxMana: 78, skill2: 920, manaLockMs: 820 }],
    ['u5_michael', { startMana: 22, maxMana: 96, skill2: 860, manaLockMs: 1000 }],
    ['u5_bahamut', { startMana: 38, maxMana: 88, skill2: 1040, manaLockMs: 1000 }],
    ['u5_chronos', { startMana: 32, maxMana: 72, skill2: 960, manaLockMs: 700 }],
    ['u5_lilith', { startMana: 24, maxMana: 54, skill2: 1360, manaLockMs: 420 }],
    ['u5_yggdrasil', { startMana: 38, maxMana: 88, skill2: 1080, manaLockMs: 980 }],
  ] as const)(
    'tunes %s mana and 2★ skill base',
    (unitId, tuned) => {
      const u = UNIT_TEMPLATES[unitId];
      expect(u.stats.startMana).toBe(tuned.startMana);
      expect(u.stats.maxMana).toBe(tuned.maxMana);
      expect(u.skill.baseValueByStar[1]).toBe(tuned.skill2);
      expect(u.skill.manaLockMs).toBe(tuned.manaLockMs);
    }
  );

  it('gives michael and yggdrasil stronger 2★ team shields', () => {
    expect(UNIT_TEMPLATES.u5_michael.skill.secondaryValueByStar?.[1]).toBe(540);
    expect(UNIT_TEMPLATES.u5_yggdrasil.skill.secondaryValueByStar?.[1]).toBe(920);
  });

  it('registers dedicated handlers for formerly fallback-only 5-cost units', () => {
    for (const id of ['u5_michael', 'u5_bahamut', 'u5_chronos', 'u5_yggdrasil'] as const) {
      expect(SkillRegistry.HANDLERS[id]).toBeTypeOf('function');
    }
  });

  it('does not change skill2 bases outside PR2 scope', () => {
    for (const id of PR2_UNITS) {
      expect(id).not.toBe('u5_goldtooth');
    }
    expect(UNIT_TEMPLATES.u5_goldtooth.skill.baseValueByStar[1]).toBe(990);
  });
});