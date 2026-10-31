import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { staticAssetMiddleware } from './electron/staticMiddleware';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), {
    name: 'kards-private-assets',
    configureServer(server) { server.middlewares.use(staticAssetMiddleware(import.meta.dirname, process.env.KARDS_PACK_SALT || loadEnv(server.config.mode, import.meta.dirname, 'KARDS_').KARDS_PACK_SALT)); },
    configurePreviewServer(server) { server.middlewares.use(staticAssetMiddleware(import.meta.dirname, process.env.KARDS_PACK_SALT || loadEnv(server.config.mode, import.meta.dirname, 'KARDS_').KARDS_PACK_SALT)); },
  }],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
  server: { host: '127.0.0.1' },
});
