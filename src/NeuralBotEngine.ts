// src/NeuralBotEngine.ts
// Expanded offline neural policy: 24-d state → value + 8 macros + 4 urgencies

import { TRAINED_NEURAL_WEIGHTS, NeuralNetworkWeights } from './NeuralWeights';

export type NeuralMacroAction =
  | 'SAVE_INTEREST'
  | 'TEMPO_LEVEL'
  | 'ROLLDOWN'
  | 'STABILIZE_REROLL'
  | 'PIVOT_BOARD'
  | 'SLAM_ITEMS'
  | 'DENY_HOLD'
  | 'HIGHROLL_GREED';

export const NEURAL_MACRO_ACTIONS: NeuralMacroAction[] = [
  'SAVE_INTEREST',
  'TEMPO_LEVEL',
  'ROLLDOWN',
  'STABILIZE_REROLL',
  'PIVOT_BOARD',
  'SLAM_ITEMS',
  'DENY_HOLD',
  'HIGHROLL_GREED',
];

export interface NeuralUrgencies {
  item: number;
  pivot: number;
  deny: number;
  combatAugBias: number;
}

export interface NeuralInferenceResult {
  valueScore: number;
  macroAction: NeuralMacroAction;
  policyLogits: number[];
  /** @deprecated use urgencies.item */
  itemUrgency: number;
  urgencies: NeuralUrgencies;
  backend: 'DIRECT_NEURAL_MATRIX' | 'ONNX_RUNTIME';
}

function relu(arr: number[]): number[] {
  return arr.map((x) => (x > 0 ? x : 0));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, x))));
}

function matmul(vec: number[], weights: number[][], bias: number[]): number[] {
  const outRows = weights.length;
  const inCols = vec.length;
  const out = new Array(outRows);

  for (let i = 0; i < outRows; i++) {
    let sum = bias[i];
    const row = weights[i];
    for (let j = 0; j < inCols; j++) {
      sum += vec[j] * row[j];
    }
    out[i] = sum;
  }
  return out;
}

function packUrgencies(arr: number[]): NeuralUrgencies {
  return {
    item: Math.max(0, Math.min(1, arr[0] ?? 0.3)),
    pivot: Math.max(0, Math.min(1, arr[1] ?? 0.2)),
    deny: Math.max(0, Math.min(1, arr[2] ?? 0.2)),
    combatAugBias: Math.max(0, Math.min(1, arr[3] ?? 0.5)),
  };
}

export class NeuralBotEngine {
  private static instance: NeuralBotEngine | null = null;
  private weights: NeuralNetworkWeights = TRAINED_NEURAL_WEIGHTS;
  private onnxSession: any = null;
  private isOnnxReady = false;

  private constructor() {
    this.tryInitOnnx();
  }

  public static getInstance(): NeuralBotEngine {
    if (!NeuralBotEngine.instance) {
      NeuralBotEngine.instance = new NeuralBotEngine();
    }
    return NeuralBotEngine.instance;
  }

  /** Hot-reload after retrain in same JS context (sims / tests). */
  public static resetInstance(): void {
    NeuralBotEngine.instance = null;
  }

  private async tryInitOnnx(): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        const ort = await import('onnxruntime-web');
        ort.env.wasm.numThreads = 1;
        this.onnxSession = await ort.InferenceSession.create('./models/wwchess_bot.onnx');
        this.isOnnxReady = true;
        console.log('[NeuralBotEngine] ONNX Runtime Web session initialized successfully.');
      }
    } catch (_) {
      this.isOnnxReady = false;
    }
  }

  public predictSync(features: number[]): NeuralInferenceResult {
    const w = this.weights;
    const expectedIn = w.fc1_w[0]?.length ?? features.length;
    // 재학습 전/후 피처 차원 불일치 시 패딩·절단 (크래시 방지)
    let x = features;
    if (features.length !== expectedIn) {
      x = features.slice(0, expectedIn);
      while (x.length < expectedIn) x.push(0);
    }

    const h1 = relu(matmul(x, w.fc1_w, w.fc1_b));
    const h2 = relu(matmul(h1, w.fc2_w, w.fc2_b));

    const v_h = relu(matmul(h2, w.val_fc_w, w.val_fc_b));
    const v_out = matmul(v_h, w.val_out_w, w.val_out_b)[0];
    const valueScore = sigmoid(v_out);

    const p_h = relu(matmul(h2, w.pol_fc_w, w.pol_fc_b));
    const policyLogits = matmul(p_h, w.pol_out_w, w.pol_out_b);

    const u_h = relu(matmul(h2, w.urg_fc_w, w.urg_fc_b));
    const urgRaw = matmul(u_h, w.urg_out_w, w.urg_out_b).map(sigmoid);
    const urgencies = packUrgencies(urgRaw);

    let bestActionIdx = 0;
    let maxLogit = -Infinity;
    for (let i = 0; i < policyLogits.length; i++) {
      if (policyLogits[i] > maxLogit) {
        maxLogit = policyLogits[i];
        bestActionIdx = i;
      }
    }

    return {
      valueScore: Math.max(0, Math.min(1, valueScore)),
      macroAction: NEURAL_MACRO_ACTIONS[bestActionIdx] ?? 'SAVE_INTEREST',
      policyLogits,
      itemUrgency: urgencies.item,
      urgencies,
      backend: 'DIRECT_NEURAL_MATRIX',
    };
  }

  public async predictONNX(features: number[]): Promise<NeuralInferenceResult> {
    if (!this.isOnnxReady || !this.onnxSession) {
      return this.predictSync(features);
    }

    try {
      const ort = await import('onnxruntime-web');
      const tensor = new ort.Tensor('float32', new Float32Array(features), [1, features.length]);
      const results = await this.onnxSession.run({ state_vector: tensor });

      const vArr = results.value_score.data as Float32Array;
      const pArr = results.policy_logits.data as Float32Array;
      const uKey = results.urgencies ? 'urgencies' : 'item_urgency';
      const uArr = results[uKey].data as Float32Array;

      const policyLogits = Array.from(pArr);
      let bestActionIdx = 0;
      let maxLogit = -Infinity;
      for (let i = 0; i < policyLogits.length; i++) {
        if (policyLogits[i] > maxLogit) {
          maxLogit = policyLogits[i];
          bestActionIdx = i;
        }
      }

      const urgencies = packUrgencies(Array.from(uArr));
      return {
        valueScore: Math.max(0, Math.min(1, vArr[0])),
        macroAction: NEURAL_MACRO_ACTIONS[bestActionIdx] ?? 'SAVE_INTEREST',
        policyLogits,
        itemUrgency: urgencies.item,
        urgencies,
        backend: 'ONNX_RUNTIME',
      };
    } catch (_) {
      return this.predictSync(features);
    }
  }
}
