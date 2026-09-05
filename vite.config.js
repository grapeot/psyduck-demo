import { defineConfig } from 'vite';
export default defineConfig({
  worker: { format: 'iife' },
  build: { rollupOptions: { input: { main: 'index.html', static: 'static.html' } } },
});
