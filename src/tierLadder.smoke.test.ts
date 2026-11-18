import { describe, expect, it, vi } from 'vitest';
import { CombatEngine } from './CombatEngine';
import { TIER_LADDER_RULES } from './GameData/tierLadder';
import { Participant } from './Participant';
import type { StarLevel } from './GameData/types';

const REPEAT_COUNT = 40;

/** Mulberry32 — deterministic combat RNG when Math.random is wired through this. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runNaked1v1(
  homeUnitId: string,
  homeStar: StarLevel,
  awayUnitId: string,
  awayStar: StarLevel,
  fights: number,
  seed: number
): { homeWins: number; awayWins: number; draws: number } {
  const nextRand = mulberry32(seed);
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;

  for (let i = 0; i < fights; i++) {
    const randomSpy = vi.spyOn(Math, 'random').mockImplementation(nextRand);

    const home = new Participant(`h-${i}`, 'Home');
    const away = new Participant(`a-${i}`, 'Away');
    home.board[3][3] = Participant.createUnitInstance(homeUnitId, homeStar);
    away.board[0][3] = Participant.createUnitInstance(awayUnitId, awayStar);

    const engine = new CombatEngine();
    engine.initCombat(home, away);
    engine.simulateToCompletion();

    if (engine.winner === 'HOME') homeWins++;
    else if (engine.winner === 'AWAY') awayWins++;
    else draws++;

    randomSpy.mockRestore();
  }

  return { homeWins, awayWins, draws };
}

function homeWinRatePct(result: ReturnType<typeof runNaked1v1>): number {
  const decided = result.homeWins + result.awayWins;
  if (decided === 0) return 50;
  return (result.homeWins / decided) * 100;
}

describe('tier ladder naked 1v1 anchors (§5.1)', () => {
  const anchor3 = TIER_LADDER_RULES.naked1v1Anchors.find((a) => a.anchorId === '③')!;
  const anchor7 = TIER_LADDER_RULES.naked1v1Anchors.find((a) => a.anchorId === '⑦')!;

  it(`anchor ③: ${anchor3.home.unitId} ${anchor3.home.star}★ vs ${anchor3.away.unitId} ${anchor3.away.star}★`, () => {
    const result = runNaked1v1(
      anchor3.home.unitId,
      anchor3.home.star,
      anchor3.away.unitId,
      anchor3.away.star,
      REPEAT_COUNT,
      0x00a3_0001
    );
    const pct = homeWinRatePct(result);
    const { min, max } = anchor3.homeWinRatePct;

    expect(
      pct,
      `home (${anchor3.home.unitId} ${anchor3.home.star}★) win rate ${pct.toFixed(1)}% over ${REPEAT_COUNT} fights (W/L/D ${result.homeWins}/${result.awayWins}/${result.draws})`
    ).toBeGreaterThanOrEqual(min - 15);
    expect(pct).toBeLessThanOrEqual(max + 15);
  });

  it(`anchor ⑦: ${anchor7.home.unitId} ${anchor7.home.star}★ vs ${anchor7.away.unitId} ${anchor7.away.star}★`, () => {
    const result = runNaked1v1(
      anchor7.home.unitId,
      anchor7.home.star,
      anchor7.away.unitId,
      anchor7.away.star,
      REPEAT_COUNT,
      0x00a7_0001
    );
    const pct = homeWinRatePct(result);
    const { min, max } = anchor7.homeWinRatePct;

    const rounded = Math.round(pct * 10) / 10;
    expect(
      rounded,
      `home (${anchor7.home.unitId} ${anchor7.home.star}★) win rate ${rounded}% over ${REPEAT_COUNT} fights (W/L/D ${result.homeWins}/${result.awayWins}/${result.draws})`
    ).toBeGreaterThanOrEqual(min);
    expect(rounded).toBeLessThanOrEqual(max);
  });
});

describe('tierLadder.ts spec mirror', () => {
  it('exposes reference multiples and anchor ids used in smoke tests', () => {
    expect(TIER_LADDER_RULES.starHpAtkMultPerStep).toBe(1.8);
    expect(TIER_LADDER_RULES.naked1v1Anchors.length).toBeGreaterThanOrEqual(2);
    expect(TIER_LADDER_RULES.pivotWarnings.length).toBeGreaterThanOrEqual(1);
  });
});