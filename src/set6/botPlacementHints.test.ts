import { describe, expect, it } from 'vitest';
import {
  getPlacementTags,
  placementColPriority,
  placementRowPriority,
  primaryPlacementBucket,
} from './botPlacementHints';

describe('botPlacementHints', () => {
  it('tags Caitlyn as backline sniper', () => {
    const tags = getPlacementTags('u1_caitlyn');
    expect(tags).toContain('SNIPER');
    expect(primaryPlacementBucket('u1_caitlyn')).toBe('back');
    expect(placementRowPriority('u1_caitlyn')[0]).toBe(3);
  });

  it('tags Singed for front/mid CC line', () => {
    expect(primaryPlacementBucket('u1_singed')).toBe('front');
    expect(placementRowPriority('u1_singed')[0]).toBe(0);
  });

  it('prioritizes assassin column toward player carry', () => {
    const carryCol = 4;
    const cols = placementColPriority('u2_talon', carryCol);
    expect(cols[0]).toBe(carryCol);
    expect(getPlacementTags('u2_talon')).toContain('ASSASSIN_DIVE');
  });
});