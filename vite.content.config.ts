import { defineConfig } from 'vite';

// Build 2: content script como IIFE autocontenido.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/content/index.ts',
      name: 'ApplyAssistant',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
  },
});
