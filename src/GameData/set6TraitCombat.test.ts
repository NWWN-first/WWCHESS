import { describe, expect, it } from 'vitest';
import { CombatEngine } from '../CombatEngine';
import { Participant } from '../Participant';
import { Set6TraitCombat } from '../set6/Set6TraitCombat';

describe('Set 6 trait combat hooks', () => {
  it('assigns colossus 2-hex occupation keys', () => {
    const cu = {
      row: 4,
      col: 3,
      set6Colossus: true,
    } as Parameters<typeof Set6TraitCombat.occupiedTileKeys>[0];
    const keys = Set6TraitCombat.occupiedTileKeys(cu);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    expect(keys).toContain('4,3');
  });

  it('spawns innovator mechs when trait active', () => {
    const home = new Participant('h', 'H', false);
    const away = new Participant('a', 'A', true);
    home.board[0][3] = Participant.createUnitInstance('u1_ezreal', 2);
    home.board[0][4] = Participant.createUnitInstance('u2_zilean', 1);
    home.board[0][2] = Participant.createUnitInstance('u1_singed', 1);
    away.board[0][2] = Participant.createUnitInstance('u1_garen', 1);

    const engine = new CombatEngine();
    engine.initCombat(home, away);
    const mech = engine.units.find((u) => u.set6InnovatorSummon);
    expect(mech).toBeDefined();
    expect(mech!.maxHp).toBeGreaterThan(0);
  });
});