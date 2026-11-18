import { describe, expect, it } from 'vitest';
import { AIBotController } from '../AIBotController';
import { Participant } from '../Participant';
import { RankManager } from '../RankManager';
import {
  BOT_NEURAL_FEATURE_DIM,
  BOT_NEURAL_FEATURE_NAMES,
} from './botNeuralFeatures';

describe('botNeuralFeatures', () => {
  it('defines 18 dims with named schema', () => {
    expect(BOT_NEURAL_FEATURE_NAMES).toHaveLength(BOT_NEURAL_FEATURE_DIM);
    expect(BOT_NEURAL_FEATURE_DIM).toBe(18);
  });

  it('extractAIStateTensor emits 18 normalized features', () => {
    const rm = new RankManager();
    const ai = new AIBotController(rm);
    const bot = new Participant('n1', 'bot', true, 'FLEX_MASTER');
    bot.goblinVaultStacks = 14;
    bot.augments.push('AUG_MERCENARY_HEART');
    const tensor = ai.extractAIStateTensor(bot, [bot], '4-2');
    expect(tensor.features).toHaveLength(18);
    for (const v of tensor.features) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.0001);
    }
    expect(tensor.mercenaryVaultNorm).toBeGreaterThan(0);
    expect(tensor.augmentSlotsNorm).toBeGreaterThan(0);
  });
});