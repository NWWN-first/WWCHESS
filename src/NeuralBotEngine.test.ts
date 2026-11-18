import { describe, expect, it } from 'vitest';
import { NeuralBotEngine } from './NeuralBotEngine';
import { BOT_NEURAL_FEATURE_DIM } from './set6/botNeuralFeatures';

describe('NeuralBotEngine', () => {
  it('predictSync returns stable macro outputs for zeroed features', () => {
    const engine = NeuralBotEngine.getInstance();
    const features = Array.from({ length: BOT_NEURAL_FEATURE_DIM }, () => 0.5);
    const result = engine.predictSync(features, { temperature: 0.12 });
    expect(result.backend).toBe('DIRECT_NEURAL_MATRIX');
    expect(result.policyLogits).toHaveLength(4);
    expect(result.macroAction).toBeTruthy();
    expect(result.valueScore).toBeGreaterThanOrEqual(0);
    expect(result.valueScore).toBeLessThanOrEqual(1);
  });

  it('predictONNX falls back to SYNC when no session (vitest)', async () => {
    const engine = NeuralBotEngine.getInstance();
    const features = Array.from({ length: BOT_NEURAL_FEATURE_DIM }, () => 0.25);
    const onnx = await engine.predictONNX(features, { temperature: 0.12 });
    const sync = engine.predictSync(features, { temperature: 0.12 });
    expect(onnx.backend).toBe('DIRECT_NEURAL_MATRIX');
    expect(onnx.macroAction).toBe(sync.macroAction);
    expect(onnx.policyLogits.length).toBe(sync.policyLogits.length);
  });

  it('ensureBrowserOnnxReady is false in vitest (no window)', async () => {
    const ready = await NeuralBotEngine.getInstance().ensureBrowserOnnxReady();
    expect(ready).toBe(false);
  });
});