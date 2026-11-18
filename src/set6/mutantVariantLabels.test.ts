import { describe, expect, it } from 'vitest';
import { MUTANT_VARIANT_LABELS_KO } from './Set6MatchState';

describe('Set 6 mutant variant labels', () => {
  it('maps TOWER_POWER to official mutant name, not 마탑 trait', () => {
    expect(MUTANT_VARIANT_LABELS_KO.TOWER_POWER).toBe('탑의 힘');
    expect(MUTANT_VARIANT_LABELS_KO.TOWER_POWER).not.toMatch(/마탑/);
  });
});