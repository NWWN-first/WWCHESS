import { describe, expect, it } from 'vitest';
import {
  browserOnnxMacroEnabled,
  resolveBrowserOnnxModelUrl,
  shouldRefreshMacroWithBrowserOnnx,
} from './browserOnnxConfig';

describe('browserOnnxConfig', () => {
  it('disables macro ONNX in non-browser (vitest) environments', () => {
    expect(browserOnnxMacroEnabled()).toBe(false);
  });

  it('resolves model URL from Vite BASE_URL', () => {
    expect(resolveBrowserOnnxModelUrl()).toMatch(/models\/wwchess_bot\.onnx$/);
  });

  it('uses ONNX refresh when session ready and global browser flag would be on', () => {
    const engine = {
      useHeadlessOnnxInference: () => false,
      isOnnxSessionReady: () => true,
    };
    expect(shouldRefreshMacroWithBrowserOnnx(engine, false)).toBe(false);
    expect(shouldRefreshMacroWithBrowserOnnx(engine, true)).toBe(true);
  });

  it('never uses browser ONNX path under headless node sim', () => {
    const engine = {
      useHeadlessOnnxInference: () => true,
      isOnnxSessionReady: () => true,
    };
    expect(shouldRefreshMacroWithBrowserOnnx(engine, true)).toBe(false);
  });
});