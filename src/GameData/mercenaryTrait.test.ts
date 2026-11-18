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

  it('exposes stack multipliers at breakpoints', () => {
    expect(fx[0].mercenaryStackMultiplier).toBe(1);
    expect(fx[1].mercenaryStackMultiplier).toBe(2);
    expect(fx[2].mercenaryStackMultiplier).toBe(3);
  });

  it('has no GOLDEN_GOBLIN legacy id', () => {
    expect((TRAIT_DEFINITIONS as Record<string, unknown>).GOLDEN_GOBLIN).toBeUndefined();
  });
});

describe('DopamineEngine MERCENARY economy', () => {
  it('stacks on defeat and cashes out on win', () => {
    const p = new Participant('p1', '플레이어', false);
    boardMercenaries(p, 3);
    const pool = new SharedPoolManager();
    const state = SynergyEngine.getActiveSynergyMap(p).get('MERCENARY')!;

    DopamineEngine.processMercenaryTrait(p, state, false, pool);
    expect(p.goblinVaultStacks).toBeGreaterThan(0);

    const stacksBefore = p.goblinVaultStacks;
    const orbs = DopamineEngine.processMercenaryTrait(p, state, true, pool);
    expect(p.goblinVaultStacks).toBe(0);
    expect(orbs.length).toBeGreaterThan(0);
    expect(stacksBefore).toBeGreaterThan(0);
  });
});