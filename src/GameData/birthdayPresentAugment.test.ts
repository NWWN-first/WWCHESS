import { describe, expect, it, vi, afterEach } from 'vitest';
import { Participant } from '../Participant';
import { SharedPoolManager } from '../SharedPoolManager';
import { XP_REQUIRED_BY_LEVEL } from './economy';

describe('AUG_BIRTHDAY_PRESENT', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('grants immediate 10 gold on pick via applyAugment only', () => {
    const p = new Participant('p1', 'Player');
    const pool = new SharedPoolManager();
    p.gold = 0;

    const ok = p.applyAugment('AUG_BIRTHDAY_PRESENT', pool);
    expect(ok).toBe(true);
    expect(p.gold).toBe(10);
    expect(p.augments).toContain('AUG_BIRTHDAY_PRESENT');
  });

  it('on level up grants +6 gold and a 2-star unit from the pool', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const p = new Participant('p2', 'Player');
    p.augments.push('AUG_BIRTHDAY_PRESENT');
    const pool = new SharedPoolManager();
    const grantedUnitId = 'u1_caitlyn';
    const beforePool = pool.getRemainingCount(grantedUnitId);
    p.gold = 0;
    p.level = 1;
    p.xp = 0;

    p.addXp(XP_REQUIRED_BY_LEVEL[2], pool);

    expect(p.level).toBe(2);
    expect(p.gold).toBe(6);
    expect(pool.getRemainingCount(grantedUnitId)).toBe(beforePool - 3);

    const twoStar = p.bench.find((u) => u?.starLevel === 2);
    expect(twoStar).toBeDefined();
    expect(twoStar!.unitId).toBe(grantedUnitId);
  });

  it('skips blocked units when participant already has a 3-star copy', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const p = new Participant('p3', 'Player');
    p.augments.push('AUG_BIRTHDAY_PRESENT');
    p.board[0][0] = Participant.createUnitInstance('u1_garen', 3);
    const pool = new SharedPoolManager();
    p.level = 1;
    p.xp = 0;
    p.gold = 0;

    p.addXp(XP_REQUIRED_BY_LEVEL[2], pool);

    const garenOnBench = p.bench.some((u) => u?.unitId === 'u1_garen');
    expect(garenOnBench).toBe(false);
    expect(p.gold).toBe(6);
  });

  it('fires once per level crossed in a single addXp call', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const p = new Participant('p4', 'Player');
    p.augments.push('AUG_BIRTHDAY_PRESENT');
    const pool = new SharedPoolManager();
    p.level = 1;
    p.xp = 0;
    p.gold = 0;

    const xpForTwoLevels =
      (XP_REQUIRED_BY_LEVEL[2] ?? 0) + (XP_REQUIRED_BY_LEVEL[3] ?? 0);
    p.addXp(xpForTwoLevels, pool);

    expect(p.level).toBe(3);
    expect(p.gold).toBe(12);
    const twoStars = p.bench.filter((u) => u?.starLevel === 2);
    expect(twoStars.length).toBe(2);
  });

  it('does not grant level-up rewards when sharedPool is omitted', () => {
    const p = new Participant('p5', 'Player');
    p.augments.push('AUG_BIRTHDAY_PRESENT');
    p.level = 1;
    p.xp = 0;
    p.gold = 0;

    p.addXp(XP_REQUIRED_BY_LEVEL[2]);

    expect(p.level).toBe(2);
    expect(p.gold).toBe(0);
    expect(p.bench.every((s) => s === null)).toBe(true);
  });
});