/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_USE_ONNX_BOT?: string;
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}