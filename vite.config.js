import { defineConfig } from 'vite';
import compression from 'compression';
export default defineConfig({
  plugins: [{
    name: 'compress-local-resources',
    configureServer(server) { server.middlewares.use(compression()); },
    configurePreviewServer(server) { server.middlewares.use(compression()); },
  }],
  worker: { format: 'iife' },
  build: { rollupOptions: { input: { main: 'index.html', static: 'static.html' } } },
});
