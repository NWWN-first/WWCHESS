import { describe, expect, it } from 'vitest';
import { CombatEngine } from '../CombatEngine';
import { Participant } from '../Participant';
import { Set6TraitCombat } from '../set6/Set6TraitCombat';
import { SynergyEngine } from '../SynergyEngine';

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

  it('applies scrap shields from equipped item count', () => {
    const home = new Participant('h', 'H', false);
    const away = new Participant('a', 'A', true);
    const scrap1 = Participant.createUnitInstance('u1_ezreal', 1);
    scrap1.items = ['GIANT_SLAYER', 'INFINITY_EDGE'];
    home.board[0][2] = Participant.createUnitInstance('u2_trundle', 1);
    home.board[0][3] = scrap1;
    away.board[0][3] = Participant.createUnitInstance('u1_garen', 1);

    const engine = new CombatEngine();
    engine.initCombat(home, away);
    const scrapCu = engine.units.find((u) => u.traits.includes('SCRAP'));
    expect(scrapCu).toBeDefined();
    expect(scrapCu!.shield).toBeGreaterThan(0);
  });

  it('doubles max hp for bruisers when trait active', () => {
    const home = new Participant('h', 'H', false);
    const away = new Participant('a', 'A', true);
    home.board[0][2] = Participant.createUnitInstance('u1_illaoi', 1);
    home.board[0][3] = Participant.createUnitInstance('u2_trundle', 1);
    away.board[0][3] = Participant.createUnitInstance('u1_garen', 1);

    const synergy = SynergyEngine.getActiveSynergyMap(home);
    expect((synergy.get('BRUISER')?.count ?? 0) >= 2).toBe(true);

    const engine = new CombatEngine();
    engine.initCombat(home, away);
    const bruiser = engine.units.find((u) => u.traits.includes('BRUISER'));
    const templateHp = Participant.createUnitInstance('u2_trundle', 1).maxHp;
    expect(bruiser!.maxHp).toBeGreaterThan(templateHp);
  });

  it('assigns yordle dodge when six yordles on board', () => {
    const home = new Participant('h', 'H', false);
    const away = new Participant('a', 'A', true);
    const yordleIds = ['u1_poppy', 'u1_ziggs', 'u2_lulu'];
    yordleIds.forEach((id, i) => {
      home.board[0][i] = Participant.createUnitInstance(id, 1);
    });
    away.board[0][3] = Participant.createUnitInstance('u1_garen', 1);

    const engine = new CombatEngine();
    engine.initCombat(home, away);
    const yordle = engine.units.find((u) => u.traits.includes('YORDLE'));
    expect(yordle?.dodgeChance ?? 0).toBeGreaterThan(0);
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