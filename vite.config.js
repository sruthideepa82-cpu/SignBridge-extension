import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The popup is built to static files with relative paths, so it runs from the unpacked extension folder.
// Chrome's default extension content security policy forbids inline scripts, and this build emits none.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: 'popup.html',
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
});
