// 브라우저 매크로 ONNX 사용 여부 (헤드리스 시뮬·vitest는 항상 SYNC)

export function browserOnnxMacroEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = import.meta.env.VITE_USE_ONNX_BOT;
  if (raw === '0' || raw === 'false') return false;
  return true;
}

export function resolveBrowserOnnxModelUrl(): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const normalized = base.endsWith('/') ? base : `${base}/`;
  return `${normalized}models/wwchess_bot.onnx`;
}

/** ONNX 세션이 준비되면 브라우저에서 매크로를 ONNX로 갱신할지 */
export function shouldRefreshMacroWithBrowserOnnx(
  engine: {
    useHeadlessOnnxInference(): boolean;
    isOnnxSessionReady(): boolean;
  },
  preferOnnxBackend: boolean
): boolean {
  if (engine.useHeadlessOnnxInference()) return false;
  if (!engine.isOnnxSessionReady()) return false;
  if (browserOnnxMacroEnabled()) return true;
  return preferOnnxBackend;
}