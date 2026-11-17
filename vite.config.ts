import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    rollupOptions: {
      external: ['onnxruntime-node'],
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('node_modules/pixi.js')) return 'vendor-pixi';
          if (id.includes('node_modules/onnxruntime-web')) return 'vendor-onnx';
        },
      },
    },
  },
});
