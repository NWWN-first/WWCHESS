import { describe, expect, it, vi, afterEach } from 'vitest';
import { CombatEngine } from '../CombatEngine';
import { DopamineEngine } from '../DopamineEngine';
import { TRAIT_DEFINITIONS } from './traits';
import { Participant } from '../Participant';
import { SharedPoolManager } from '../SharedPoolManager';
import { SynergyEngine } from '../SynergyEngine';

const GOBLIN_UNIT_IDS = [
  'u1_pip',
  'u1_snatch',
  'u2_tink',
  'u2_boom',
  'u3_grom',
  'u3_grizzle',
  'u4_midas',
] as const;

function placeUniqueGoblins(participant: Participant, count: number): void {
  for (let i = 0; i < count && i < GOBLIN_UNIT_IDS.length; i++) {
    participant.board[0][i] = Participant.createUnitInstance(GOBLIN_UNIT_IDS[i], 1);
  }
}

describe('GOLDEN_GOBLIN trait definitions (3/5/7)', () => {
  const fx = TRAIT_DEFINITIONS.GOLDEN_GOBLIN.effects;

  it('exposes stack multipliers 1 / 2 / 4 at breakpoints', () => {
    expect(fx[0].goblinStackMultiplier).toBe(1.0);
    expect(fx[1].goblinStackMultiplier).toBe(2.0);
    expect(fx[2].goblinStackMultiplier).toBe(4.0);
  });

  it('keeps (3) combat minimal and ramps at (5) and (7)', () => {
    expect(fx[0].goblinCombatBonusAtk).toBeUndefined();
    expect(fx[0].goblinCombatBonusHp).toBe(80);
    expect(fx[1].goblinCombatBonusAtk).toBe(25);
    expect(fx[2].goblinCombatBonusHp).toBe(600);
    expect(fx[2].goblinPerRoundJackpot).toBe(true);
    expect(fx[2].goblinCombatDamageReduction).toBe(0.12);
  });
});

describe('DopamineEngine GOLDEN_GOBLIN economy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scales loss stacks from trait multiplier (5 = 2x)', () => {
    const p = new Participant('t1', 'Test');
    placeUniqueGoblins(p, 5);
    p.loseStreak = 2;
    const state = SynergyEngine.getActiveSynergyMap(p).get('GOLDEN_GOBLIN')!;
    const pool = new SharedPoolManager();

    DopamineEngine.processGoldenGoblinTrait(p, state, false, pool);

    const baseGain = 4 + 2 * 2;
    expect(p.goblinVaultStacks).toBe(baseGain * 2);
  });

  it('cashes out vault on win at (3)+', () => {
    const p = new Participant('t2', 'Test');
    placeUniqueGoblins(p, 3);
    p.goblinVaultStacks = 12;
    const state = SynergyEngine.getActiveSynergyMap(p).get('GOLDEN_GOBLIN')!;
    const pool = new SharedPoolManager();

    const orbs = DopamineEngine.processGoldenGoblinTrait(p, state, true, pool);
    expect(p.goblinVaultStacks).toBe(0);
    expect(orbs.length).toBeGreaterThan(0);
  });

  it('grants win-sustain gold at (5) when goblins are on board', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const p = new Participant('t3', 'Test');
    placeUniqueGoblins(p, 5);
    p.winStreak = 1;
    const goldBefore = p.gold;
    const pool = new SharedPoolManager();

    const orbs = DopamineEngine.processRoundEnd(p, true, false, pool);
    expect(p.gold).toBe(goldBefore + 2);
    expect(orbs.length).toBeGreaterThanOrEqual(1);
  });

  it('drops per-round jackpot orb at (7) even on a loss', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const p = new Participant('t4', 'Test');
    placeUniqueGoblins(p, 7);
    const pool = new SharedPoolManager();

    const orbs = DopamineEngine.processRoundEnd(p, false, false, pool);
    expect(orbs).toHaveLength(1);
    expect(orbs[0].label).toMatch(/7고블린 매판/);
  });
});

describe('CombatEngine applies goblin combat from traits', () => {
  it('buffs goblin trait units at (5) synergy', () => {
    const home = new Participant('h', 'Home');
    const away = new Participant('a', 'Away');
    placeUniqueGoblins(home, 5);
    away.board[0][0] = Participant.createUnitInstance('u1_garen', 1);

    const engine = new CombatEngine();
    engine.initCombat(home, away);

    const pip = engine.units.find((u) => u.unitId === 'u1_pip');
    expect(pip).toBeDefined();
    const template = Participant.createUnitInstance('u1_pip', 1);
    const fx = TRAIT_DEFINITIONS.GOLDEN_GOBLIN.effects[1];
    expect(pip!.maxHp).toBe(template.maxHp + (fx.goblinCombatBonusHp ?? 0));
    expect(pip!.atk).toBe(template.atk + (fx.goblinCombatBonusAtk ?? 0));
  });

  it('applies damage reduction at (7)', () => {
    const home = new Participant('h7', 'Home');
    const away = new Participant('a7', 'Away');
    placeUniqueGoblins(home, 7);
    away.board[0][0] = Participant.createUnitInstance('u1_garen', 1);

    const engine = new CombatEngine();
    engine.initCombat(home, away);
    const goblin = engine.units.find((u) => u.traits.includes('GOLDEN_GOBLIN'));
    expect(goblin!.damageReductionRatio).toBe(0.12);
  });
});