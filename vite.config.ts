import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Build 1: página de opciones (React) + service worker (ES module).
// El content script se compila aparte (vite.content.config.ts) porque
// Chrome no carga content scripts como módulos ES.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        options: 'options.html',
        background: 'src/background/index.ts',
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
