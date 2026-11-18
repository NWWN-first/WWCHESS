import { describe, expect, it } from 'vitest';
import { CombatEngine } from './CombatEngine';
import { Participant } from './Participant';

describe('CombatEvent skillType on SKILL_CAST', () => {
  it('includes METEOR_SWARM skillType when u5_viktor casts', () => {
    const home = new Participant('home', 'Home', false);
    const away = new Participant('away', 'Away', true);
    home.board[3][2] = Participant.createUnitInstance('u5_viktor', 1);
    away.board[0][2] = Participant.createUnitInstance('u1_garen', 1);

    const engine = new CombatEngine();
    engine.initCombat(home, away);

    const caster = engine.units.find((u) => u.unitId === 'u5_viktor');
    expect(caster).toBeDefined();
    caster!.currentMana = caster!.maxMana;

    const events = [];
    for (let i = 0; i < 120 && !engine.isFinished; i++) {
      events.push(...engine.stepTick(50));
    }

    const skillCast = events.find(
      (e) => e.type === 'SKILL_CAST' && e.unitId === 'u5_viktor'
    );
    expect(skillCast).toBeDefined();
    expect(skillCast!.skillType).toBe('METEOR_SWARM');
  });
});