import { describe, expect, it } from 'vitest';
import { resolveUnitPixelSpec } from '../PixelGameRenderer';
import { UNIT_TEMPLATES } from './units';

describe('resolveUnitPixelSpec', () => {
  it('covers every Set 6 champion with a stable spec', () => {
    const ids = Object.keys(UNIT_TEMPLATES);
    expect(ids).toHaveLength(59);

    for (const id of ids) {
      const a = resolveUnitPixelSpec(id);
      const b = resolveUnitPixelSpec(id);
      expect(a.weapon).toBeTruthy();
      expect(a.primaryArmor).toMatch(/^#/);
      expect(a).toEqual(b);
    }
  });

  it('uses direct override when unit id matches legacy key', () => {
    expect(resolveUnitPixelSpec('u1_garen').weapon).toBe('SWORD_SHIELD');
  });
});