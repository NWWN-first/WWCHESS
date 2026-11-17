// src/NeuralBotEngine.ts
// 딥러닝 ONNX 및 초고속 인라인 행렬 순전파(0ms) 신경망 추론 엔진
// 100% 완전 오프라인 지원: 외부 서버 통신 없이 기기 내부에서 동작합니다.

import { TRAINED_NEURAL_WEIGHTS, NeuralNetworkWeights } from './NeuralWeights';

export type NeuralMacroAction =
  | 'SAVE_INTEREST'
  | 'TEMPO_LEVEL'
  | 'ROLLDOWN'
  | 'STABILIZE_REROLL';

export interface NeuralInferenceResult {
  valueScore: number; // 0.0 (8등 기대) ~ 1.0 (1등 기대)
  macroAction: NeuralMacroAction;
  policyLogits: number[];
  itemUrgency: number; // 0.0 (여유) ~ 1.0 (즉시 템 소진 필요)
  backend: 'DIRECT_NEURAL_MATRIX' | 'ONNX_RUNTIME';
}

export interface NeuralPredictOptions {
  temperature?: number;
  rng?: () => number;
  logitBias?: (logits: number[]) => number[];
}

const MACRO_ACTIONS: NeuralMacroAction[] = [
  'SAVE_INTEREST',
  'TEMPO_LEVEL',
  'ROLLDOWN',
  'STABILIZE_REROLL',
];

function pickMacroFromLogits(
  policyLogits: number[],
  temperature: number,
  rng: () => number
): NeuralMacroAction {
  if (policyLogits.length === 0) {
    return 'SAVE_INTEREST';
  }
  const temp = Math.max(0.12, temperature);
  if (temp <= 0.14) {
    let bestIdx = 0;
    let maxLogit = -Infinity;
    for (let i = 0; i < policyLogits.length; i++) {
      if (policyLogits[i] > maxLogit) {
        maxLogit = policyLogits[i];
        bestIdx = i;
      }
    }
    return MACRO_ACTIONS[bestIdx] ?? 'SAVE_INTEREST';
  }

  const scaled = policyLogits.map((l) => l / temp);
  const maxL = Math.max(...scaled);
  const exps = scaled.map((l) => Math.exp(l - maxL));
  const sum = exps.reduce((a, b) => a + b, 0);
  let roll = rng() * sum;
  for (let i = 0; i < exps.length; i++) {
    roll -= exps[i];
    if (roll <= 0) {
      return MACRO_ACTIONS[i] ?? 'SAVE_INTEREST';
    }
  }
  return MACRO_ACTIONS[MACRO_ACTIONS.length - 1];
}

function buildNeuralResult(
  valueScore: number,
  policyLogits: number[],
  itemUrgency: number,
  backend: NeuralInferenceResult['backend'],
  options?: NeuralPredictOptions
): NeuralInferenceResult {
  const temperature = options?.temperature ?? 0.45;
  const rng = options?.rng ?? Math.random;
  const biasedLogits = options?.logitBias
    ? options.logitBias([...policyLogits])
    : policyLogits;
  return {
    valueScore: Math.max(0, Math.min(1, valueScore)),
    macroAction: pickMacroFromLogits(biasedLogits, temperature, rng),
    policyLogits,
    itemUrgency: Math.max(0, Math.min(1, itemUrgency)),
    backend,
  };
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

  /** 웹 클라이언트에서 ONNX Runtime 세션이 준비되었는지 (Node 시뮬·세션 미로드 시 false) */
  public isOnnxSessionReady(): boolean {
    return this.isOnnxReady && this.onnxSession != null;
  }

  /**
   * onnxruntime-web 비동기 세션 초기화 시도
   * (웹뷰 오프라인 또는 환경에 따라 실패해도 Direct Matrix로 100% 정상 작동)
   */
  private async tryInitOnnx(): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        const ort = await import('onnxruntime-web');
        // wasm 경로 설정 및 로드
        ort.env.wasm.numThreads = 1;
        this.onnxSession = await ort.InferenceSession.create('./models/wwchess_bot.onnx');
        this.isOnnxReady = true;
        console.log('[NeuralBotEngine] ONNX Runtime Web session initialized successfully.');
      }
    } catch (e) {
      // Direct Neural Matrix가 항상 즉시 폴백 대기
      this.isOnnxReady = false;
    }
  }

  /**
   * 동기적 초고속(0.001ms) 순전파 추론
   * 실시간 게임 틱 및 1000판 시뮬레이션에서도 딜레이 없이 100% 네이티브 실행
   */
  public predictSync(features: number[], options?: NeuralPredictOptions): NeuralInferenceResult {
    const w = this.weights;

    // Backbone: fc1 (11 -> 32) -> relu -> fc2 (32 -> 32) -> relu
    const h1 = relu(matmul(features, w.fc1_w, w.fc1_b));
    const h2 = relu(matmul(h1, w.fc2_w, w.fc2_b));

    // Value Head (순위 기대치 0~1)
    const v_h = relu(matmul(h2, w.val_fc_w, w.val_fc_b));
    const v_out = matmul(v_h, w.val_out_w, w.val_out_b)[0];
    const valueScore = sigmoid(v_out);

    // Policy Head (4종 매크로 행동 로짓)
    const p_h = relu(matmul(h2, w.pol_fc_w, w.pol_fc_b));
    const policyLogits = matmul(p_h, w.pol_out_w, w.pol_out_b);

    // Item Urgency Head (0~1)
    const u_h = relu(matmul(h2, w.urg_fc_w, w.urg_fc_b));
    const u_out = matmul(u_h, w.urg_out_w, w.urg_out_b)[0];
    const itemUrgency = sigmoid(u_out);

    return buildNeuralResult(valueScore, policyLogits, itemUrgency, 'DIRECT_NEURAL_MATRIX', options);
  }

  /**
   * ONNX 모델 비동기 추론 (ONNX 세션 활성화 시)
   */
  public async predictONNX(
    features: number[],
    options?: NeuralPredictOptions
  ): Promise<NeuralInferenceResult> {
    if (!this.isOnnxReady || !this.onnxSession) {
      return this.predictSync(features, options);
    }

    try {
      const ort = await import('onnxruntime-web');
      const tensor = new ort.Tensor('float32', new Float32Array(features), [1, features.length]);
      const results = await this.onnxSession.run({ state_vector: tensor });

      const vArr = results.value_score.data as Float32Array;
      const pArr = results.policy_logits.data as Float32Array;
      const uArr = results.item_urgency.data as Float32Array;

      const policyLogits = Array.from(pArr);
      return buildNeuralResult(
        vArr[0],
        policyLogits,
        uArr[0],
        'ONNX_RUNTIME',
        options
      );
    } catch (_) {
      return this.predictSync(features, options);
    }
  }
}
