import { describe, expect, it } from 'vitest';
import { AIBotController, BotBrainState, rollWeightedPersona } from './AIBotController';
import { Participant } from './Participant';
import { RankManager } from './RankManager';
import { NeuralInferenceResult } from './NeuralBotEngine';

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
      targetTrait: 'HOLY_EMPIRE',
      secondaryTrait: 'ARCANE_TOWER',
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