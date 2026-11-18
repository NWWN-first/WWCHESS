import { describe, expect, it } from 'vitest';
import {
  AIBotController,
  BotBrainState,
  getUnitRole,
  rollWeightedPersona,
} from './AIBotController';
import { TRAIT_DEFINITIONS } from './GameData/traits';
import { UNIT_TEMPLATES } from './GameData/units';
import { Participant } from './Participant';
import { RankManager } from './RankManager';
import { NeuralInferenceResult } from './NeuralBotEngine';
import { SharedPoolManager } from './SharedPoolManager';

function rngFromSeed(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('rollWeightedPersona', () => {
  it('allows duplicate personas across independent draws', () => {
    const rng = rngFromSeed(42);
    const draws = Array.from({ length: 14 }, () => rollWeightedPersona(rng));
    const unique = new Set(draws);
    expect(unique.size).toBeLessThan(draws.length);
  });
});

describe('Set 6 bot heuristics', () => {
  it('classifies Colossus and Challenger units for item/positioning', () => {
    expect(getUnitRole('u5_galio')).toBe('TANK');
    expect(getUnitRole('u4_sion')).toBe('TANK');
    expect(getUnitRole('u1_camille')).toBe('BRUISER');
    expect(getUnitRole('u3_samira')).toBe('BRUISER');
    expect(getUnitRole('u3_miss_fortune')).toBe('AD_CARRY');
    expect(getUnitRole('u3_malzahar')).toBe('AP_CARRY');
  });

  it('assigns only valid Set 6 target traits when spawning bots', () => {
    const validTraits = new Set(Object.keys(TRAIT_DEFINITIONS));
    const rm = new RankManager();
    const ai = new AIBotController(rm);
    const bots = ai.createSevenAIBots();
    expect(bots).toHaveLength(7);
    for (const bot of bots) {
      const brain = (ai as unknown as { botBrains: Map<string, BotBrainState> })
        .botBrains.get(bot.id)!;
      expect(validTraits.has(brain.targetTrait)).toBe(true);
      expect(validTraits.has(brain.secondaryTrait)).toBe(true);
    }
  });

  it('prefers MERCENARY shop units for MERCENARY_GAMBLER persona', () => {
    const rm = new RankManager();
    const ai = new AIBotController(rm);
    const pool = new SharedPoolManager();
    const bot = new Participant('mb1', 'merc', true, 'MERCENARY_GAMBLER');
    const brain: BotBrainState = {
      botId: bot.id,
      persona: 'MERCENARY_GAMBLER',
      targetTrait: 'MERCENARY',
      secondaryTrait: 'BRUISER',
      deniedUnitInstanceIds: new Set(),
      pivotedCount: 0,
      isRolldownActive: false,
      nextActionDelayMs: 0,
      rerollsExecutedThisRound: 0,
      maxRerollsAllowedThisRound: 8,
      targetGoldFloorThisRound: 10,
      unitsToDenyCache: new Set(),
      decisionSeed: 99,
      policyTemperature: 1,
      preferOnnxBackend: false,
      macroPickNonce: 0,
      inferenceBackendLogged: false,
    };
  (ai as unknown as { botBrains: Map<string, BotBrainState> }).botBrains.set(
      bot.id,
      brain
    );
    const gangplank = UNIT_TEMPLATES.u3_gangplank;
    const lux = UNIT_TEMPLATES.u4_lux;
    const params = rm.getAISkillParameters();
    const mercScore = ai.evaluateShopUnitUtility(
      bot,
      brain,
      gangplank,
      pool,
      params
    );
    const offTraitScore = ai.evaluateShopUnitUtility(bot, brain, lux, pool, params);
    expect(mercScore).toBeGreaterThan(offTraitScore);
    expect(gangplank.traits).toContain('MERCENARY');
  });

  it('scouts BODYGUARD and enchanter lines instead of legacy vanguard', () => {
    const rm = new RankManager();
    const ai = new AIBotController(rm);
    const scoutBot = new Participant('s0', 'scout', true, 'FLEX_MASTER');
    const bodyguardStack = new Participant('s1', 'tank', true, 'FAST_NINE_ECONOMIST');
    bodyguardStack.board[0][0] = Participant.createUnitInstance('u3_leona', 2);
    bodyguardStack.board[0][1] = Participant.createUnitInstance('u1_darius', 2);
    const ctx = ai.analyzeScoutingContext(scoutBot, [scoutBot, bodyguardStack]);
    expect(ctx.opponentBodyguardCount).toBeGreaterThanOrEqual(1);
    expect(ctx).not.toHaveProperty('opponentVanguardCount');
  });
});

describe('resolveEffectiveGoldFloor', () => {
  it('caps floor for stabilize reroll macros on rollers', () => {
    const rm = new RankManager();
    const ai = new AIBotController(rm);
    const bot = new Participant('b1', 'test', true, 'HYPER_ROLLER');
    bot.gold = 30;
    bot.level = 6;
    const brain: BotBrainState = {
      botId: bot.id,
      persona: 'HYPER_ROLLER',
      targetTrait: 'ACADEMY',
      secondaryTrait: 'SCHOLAR',
      deniedUnitInstanceIds: new Set(),
      pivotedCount: 0,
      isRolldownActive: false,
      nextActionDelayMs: 0,
      rerollsExecutedThisRound: 0,
      maxRerollsAllowedThisRound: 8,
      targetGoldFloorThisRound: 22,
      unitsToDenyCache: new Set(),
      lastNeuralResult: {
        valueScore: 0.5,
        macroAction: 'STABILIZE_REROLL',
        policyLogits: [0, 0, 0, 1],
        itemUrgency: 0.2,
        backend: 'DIRECT_NEURAL_MATRIX',
      } satisfies NeuralInferenceResult,
      decisionSeed: 1,
      policyTemperature: 0.5,
      preferOnnxBackend: false,
      macroPickNonce: 0,
      inferenceBackendLogged: false,
    };
    const floor = ai.resolveEffectiveGoldFloor(bot, brain);
    expect(floor).toBeLessThanOrEqual(6);
    expect(bot.gold - 2).toBeGreaterThanOrEqual(floor);
  });
});