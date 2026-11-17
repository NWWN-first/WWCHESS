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

function headlessOnnxSimRequested(): boolean {
  return (
    typeof process !== 'undefined' &&
    (process.env.USE_ONNX_SIM === '1' || process.env.USE_ONNX_SIM === 'true')
  );
}

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

type OnnxRuntimeKind = 'web' | 'node' | null;

export class NeuralBotEngine {
  private static instance: NeuralBotEngine | null = null;
  private weights: NeuralNetworkWeights = TRAINED_NEURAL_WEIGHTS;
  private onnxSession: any = null;
  private isOnnxReady = false;
  private onnxRuntime: OnnxRuntimeKind = null;
  private headlessOnnxInit: Promise<void> | null = null;

  private constructor() {
    void this.tryInitOnnxWeb();
    if (headlessOnnxSimRequested()) {
      this.headlessOnnxInit = this.tryInitOnnxNode();
    }
  }

  public static getInstance(): NeuralBotEngine {
    if (!NeuralBotEngine.instance) {
      NeuralBotEngine.instance = new NeuralBotEngine();
    }
    return NeuralBotEngine.instance;
  }

  /** 웹 또는 헤드레스 Node ONNX 세션이 준비되었는지 */
  public isOnnxSessionReady(): boolean {
    return this.isOnnxReady && this.onnxSession != null;
  }

  /** `USE_ONNX_SIM=1` + onnxruntime-node 세션 활성 시 true */
  public useHeadlessOnnxInference(): boolean {
    return headlessOnnxSimRequested() && this.isOnnxReady && this.onnxRuntime === 'node';
  }

  /** 시뮬 시작 시 한 번 호출 (USE_ONNX_SIM) */
  public async ensureHeadlessOnnxReady(): Promise<boolean> {
    if (!headlessOnnxSimRequested()) return false;
    if (!this.headlessOnnxInit) {
      this.headlessOnnxInit = this.tryInitOnnxNode();
    }
    await this.headlessOnnxInit;
    return this.useHeadlessOnnxInference();
  }

  private async tryInitOnnxWeb(): Promise<void> {
    try {
      if (typeof window !== 'undefined') {
        const ort = await import('onnxruntime-web');
        ort.env.wasm.numThreads = 1;
        this.onnxSession = await ort.InferenceSession.create('./models/wwchess_bot.onnx');
        this.isOnnxReady = true;
        this.onnxRuntime = 'web';
        console.log('[NeuralBotEngine] ONNX Runtime Web session initialized successfully.');
      }
    } catch {
      this.isOnnxReady = false;
      this.onnxRuntime = null;
    }
  }

  private async tryInitOnnxNode(): Promise<void> {
    if (typeof window !== 'undefined') return;
    try {
      const path = await import('node:path');
      const ort = await import('onnxruntime-node');
      const modelPath =
        process.env.WWCHESS_ONNX_MODEL ??
        path.resolve(process.cwd(), 'public/models/wwchess_bot.onnx');
      this.onnxSession = await ort.InferenceSession.create(modelPath);
      this.isOnnxReady = true;
      this.onnxRuntime = 'node';
      console.log(`[NeuralBotEngine] ONNX Runtime Node session initialized (${modelPath}).`);
    } catch (e) {
      this.isOnnxReady = false;
      this.onnxRuntime = null;
      console.warn(
        '[NeuralBotEngine] Headless ONNX unavailable; sim uses SYNC.',
        e instanceof Error ? e.message : e
      );
    }
  }

  private async runOnnxNodeSession(
    features: number[],
    options?: NeuralPredictOptions
  ): Promise<NeuralInferenceResult> {
    const ort = await import('onnxruntime-node');
    const tensor = new ort.Tensor('float32', new Float32Array(features), [1, features.length]);
    const results = await this.onnxSession.run({ state_vector: tensor });

    const vArr = results.value_score.data as Float32Array;
    const pArr = results.policy_logits.data as Float32Array;
    const uArr = results.item_urgency.data as Float32Array;

    return buildNeuralResult(vArr[0], Array.from(pArr), uArr[0], 'ONNX_RUNTIME', options);
  }

  /** 헤드레스 시뮬: SYNC vs ONNX 로짓 패리티 (게임플레이는 SYNC 유지) */
  public async verifyHeadlessOnnxParity(samples = 24): Promise<void> {
    if (!this.useHeadlessOnnxInference()) return;
    let worst = 0;
    for (let i = 0; i < samples; i++) {
      const features = Array.from({ length: 11 }, (_, j) => {
        const t = i * 0.17 + j * 0.09;
        return Math.max(0, Math.min(1, (Math.sin(t) + 1) * 0.5));
      });
      const sync = this.predictSync(features);
      const onnx = await this.runOnnxNodeSession(features);
      for (let k = 0; k < sync.policyLogits.length; k++) {
        worst = Math.max(worst, Math.abs(sync.policyLogits[k] - onnx.policyLogits[k]));
      }
      const valueDelta = Math.abs(sync.valueScore - onnx.valueScore);
      worst = Math.max(worst, valueDelta);
    }
    const limit = parseFloat(process.env.ONNX_PARITY_MAX_DELTA ?? '0.02');
    if (worst > limit) {
      throw new Error(
        `[NeuralBotEngine] ONNX parity failed: max delta ${worst.toFixed(4)} > ${limit}`
      );
    }
    console.log(
      `[NeuralBotEngine] ONNX parity OK (max logit/value delta ${worst.toFixed(4)} ≤ ${limit})`
    );
  }

  /**
   * 동기적 초고속(0.001ms) 순전파 추론
   * 실시간 게임 틱 및 1000판 시뮬레이션에서도 딜레이 없이 100% 네이티브 실행
   */
  public predictSync(features: number[], options?: NeuralPredictOptions): NeuralInferenceResult {
    const w = this.weights;

    const h1 = relu(matmul(features, w.fc1_w, w.fc1_b));
    const h2 = relu(matmul(h1, w.fc2_w, w.fc2_b));

    const v_h = relu(matmul(h2, w.val_fc_w, w.val_fc_b));
    const v_out = matmul(v_h, w.val_out_w, w.val_out_b)[0];
    const valueScore = sigmoid(v_out);

    const p_h = relu(matmul(h2, w.pol_fc_w, w.pol_fc_b));
    const policyLogits = matmul(p_h, w.pol_out_w, w.pol_out_b);

    const u_h = relu(matmul(h2, w.urg_fc_w, w.urg_fc_b));
    const u_out = matmul(u_h, w.urg_out_w, w.urg_out_b)[0];
    const itemUrgency = sigmoid(u_out);

    return buildNeuralResult(valueScore, policyLogits, itemUrgency, 'DIRECT_NEURAL_MATRIX', options);
  }

  /**
   * ONNX 모델 비동기 추론 (ONNX 세션 활성 시)
   */
  public async predictONNX(
    features: number[],
    options?: NeuralPredictOptions
  ): Promise<NeuralInferenceResult> {
    if (!this.isOnnxReady || !this.onnxSession) {
      return this.predictSync(features, options);
    }

    try {
      if (this.onnxRuntime === 'node' && this.onnxSession) {
        return await this.runOnnxNodeSession(features, options);
      }
      const ort = await import('onnxruntime-web');
      const tensor = new ort.Tensor('float32', new Float32Array(features), [1, features.length]);
      const results = await this.onnxSession.run({ state_vector: tensor });

      const vArr = results.value_score.data as Float32Array;
      const pArr = results.policy_logits.data as Float32Array;
      const uArr = results.item_urgency.data as Float32Array;

      return buildNeuralResult(vArr[0], Array.from(pArr), uArr[0], 'ONNX_RUNTIME', options);
    } catch {
      return this.predictSync(features, options);
    }
  }
}