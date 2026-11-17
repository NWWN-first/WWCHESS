import { describe, expect, it } from 'vitest';
import { GameLoopManager } from './GameLoopManager';
import { SharedPoolManager } from './SharedPoolManager';

describe('GameLoopManager round labels', () => {
  it('starts new games at round 1-1', () => {
    const game = new GameLoopManager(undefined, true);
    expect(game.getRoundLabel()).toBe('1-1');
    expect(game.getCurrentRoundType()).toBe('CREEP');
  });

  it('reports TFT-style prep duration by stage', () => {
    const game = new GameLoopManager(undefined, false);
    game.stage = 1;
    expect(game.getStandardPrepDurationSec()).toBe(30);
    game.stage = 3;
    expect(game.getStandardPrepDurationSec()).toBe(35);
    game.stage = 5;
    expect(game.getStandardPrepDurationSec()).toBe(40);
  });

  it('classifies PVP vs boss creep rounds', () => {
    const game = new GameLoopManager(undefined, false);
    game.stage = 3;
    game.roundInStage = 4;
    expect(game.getCurrentRoundType()).toBe('PVP');
    game.roundInStage = 5;
    expect(game.getCurrentRoundType()).toBe('BOSS_CREEP');
  });
});

describe('SharedPoolManager', () => {
  it('maps star level to pool copy counts', () => {
    expect(SharedPoolManager.getCopiesCountForStar(1)).toBe(1);
    expect(SharedPoolManager.getCopiesCountForStar(2)).toBe(3);
    expect(SharedPoolManager.getCopiesCountForStar(3)).toBe(9);
  });

  it('initializes pool stock from unit cost tiers', () => {
    const pool = new SharedPoolManager();
    expect(pool.getRemainingCount('u1_garen')).toBeGreaterThan(0);
    expect(pool.getMaxCount('u1_garen')).toBe(pool.getRemainingCount('u1_garen'));
  });
});