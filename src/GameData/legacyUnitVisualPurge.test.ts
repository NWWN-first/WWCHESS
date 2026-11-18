import { describe, expect, it } from 'vitest';
import { CREEP_MONSTER_TEMPLATES } from '../CreepMonsterData';
import { DEDICATED_CHAMPION_3D_MAP } from '../ThreeJsGameRenderer';
import { UNIT_PIXEL_SPECS } from '../PixelGameRenderer';
import { UNIT_TEMPLATES } from './units';

const ALLOWED_CHAMPION_IDS = new Set(Object.keys(UNIT_TEMPLATES));
const ALLOWED_CREEP_PREFIX = 'creep_';

function isAllowedVisualId(id: string): boolean {
  if (ALLOWED_CHAMPION_IDS.has(id)) return true;
  if (id.startsWith(ALLOWED_CREEP_PREFIX) && CREEP_MONSTER_TEMPLATES[id]) return true;
  return false;
}

describe('Set 6 legacy unit visual purge', () => {
  it('UNIT_PIXEL_SPECS keys are only Set 6 champions', () => {
    const bad = Object.keys(UNIT_PIXEL_SPECS).filter((id) => !ALLOWED_CHAMPION_IDS.has(id));
    expect(bad).toEqual([]);
    expect(Object.keys(UNIT_PIXEL_SPECS).length).toBe(59);
  });

  it('DEDICATED_CHAMPION_3D_MAP keys are only Set 6 champions (or empty)', () => {
    const bad = Object.keys(DEDICATED_CHAMPION_3D_MAP).filter((id) => !isAllowedVisualId(id));
    expect(bad).toEqual([]);
  });

  it('has no legacy fantasy roster ids in pixel spec map', () => {
    const legacySamples = ['u1_pip', 'u1_lumi', 'u2_jeanne', 'u5_goldtooth', 'u4_merlin'];
    for (const id of legacySamples) {
      expect(UNIT_PIXEL_SPECS[id]).toBeUndefined();
      expect(DEDICATED_CHAMPION_3D_MAP[id]).toBeUndefined();
    }
  });
});