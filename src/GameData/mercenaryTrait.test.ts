import { describe, expect, it } from 'vitest';
import { DopamineEngine } from '../DopamineEngine';
import { Participant } from '../Participant';
import { SharedPoolManager } from '../SharedPoolManager';
import { SynergyEngine } from '../SynergyEngine';
import { TRAIT_DEFINITIONS } from './traits';

function boardMercenaries(participant: Participant, count: number): void {
  const ids = ['u1_illaoi', 'u2_quinn', 'u3_gangplank', 'u3_miss_fortune', 'u5_tahm_kench'];
  for (let i = 0; i < count && i < ids.length; i++) {
    participant.board[0][i] = Participant.createUnitInstance(ids[i], 1);
  }
}

describe('MERCENARY trait definitions (3/5/7)', () => {
  const fx = TRAIT_DEFINITIONS.MERCENARY.effects;

  it('exposes Set 6 loot multipliers and dice counts', () => {
    expect(fx[0].mercenaryStackMultiplier).toBe(1);
    expect(fx[0].mercenaryDiceCount).toBe(1);
    expect(fx[1].mercenaryStackMultiplier).toBe(2);
    expect(fx[1].mercenaryDiceCount).toBe(2);
    expect(fx[2].mercenaryStackMultiplier).toBe(3);
    expect(fx[2].mercenaryDiceCount).toBe(3);
  });

  it('has no GOLDEN_GOBLIN legacy id', () => {
    expect((TRAIT_DEFINITIONS as Record<string, unknown>).GOLDEN_GOBLIN).toBeUndefined();
  });
});

describe('DopamineEngine Set 6 MERCENARY economy', () => {
  it('stores loot on defeat (no lose-streak vault) and cashes out on win', () => {
    const p = new Participant('p1', '플레이어', false);
    p.loseStreak = 5;
    boardMercenaries(p, 3);
    const pool = new SharedPoolManager();
    const state = SynergyEngine.getActiveSynergyMap(p).get('MERCENARY')!;

    DopamineEngine.processMercenaryTrait(p, state, false, pool);
    expect(p.mercenaryArmoryLoot).toBe(1);

    p.mercenaryArmoryLoot = 0;
    p.loseStreak = 0;
    boardMercenaries(p, 5);
    const state5 = SynergyEngine.getActiveSynergyMap(p).get('MERCENARY')!;
    DopamineEngine.processMercenaryTrait(p, state5, false, pool);
    expect(p.mercenaryArmoryLoot).toBe(2);

    const lootBefore = 3;
    p.mercenaryArmoryLoot = lootBefore;
    const orbs = DopamineEngine.processMercenaryTrait(p, state5, true, pool);
    expect(p.mercenaryArmoryLoot).toBe(0);
    expect(orbs.length).toBeGreaterThan(0);
    expect(orbs.length).toBeLessThanOrEqual(2);
  });
});