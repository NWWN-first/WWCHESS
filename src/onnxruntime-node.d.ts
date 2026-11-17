/** Ambient types when optional `onnxruntime-node` native package is not installed (CI smoke). */
declare module 'onnxruntime-node' {
  export class Tensor {
    constructor(type: string, data: Float32Array, dims: number[]);
  }

  export class InferenceSession {
    static create(path: string): Promise<InferenceSession>;
    run(
      feeds: Record<string, Tensor>
    ): Promise<Record<string, { data: ArrayLike<number> }>>;
  }
}