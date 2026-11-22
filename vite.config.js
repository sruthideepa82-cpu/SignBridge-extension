import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The popup, captions window, offscreen page, service worker and AudioWorklet are built together. Relative paths keep
// the unpacked extension self-contained. Chrome's extension CSP forbids inline scripts, and this build emits none.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: 'popup.html',
        captions: 'captions.html',
        offscreen: 'offscreen.html',
        background: 'src/background.js',
        worklet: 'src/offscreen/worklet.js',
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js';
          if (chunk.name === 'worklet') return 'worklet.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
});
