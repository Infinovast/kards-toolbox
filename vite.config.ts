import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { staticAssetMiddleware } from './tooling/staticMiddleware';
import { newsMiddleware } from './tooling/newsMiddleware';

function readCommitDate() {
  if (!existsSync(path.join(import.meta.dirname, '.git'))) return '';
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs'], {
      cwd: import.meta.dirname,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim().replaceAll('-', '.');
  } catch {
    return '';
  }
}

export default defineConfig({
  base: './',
  define: { __APP_COMMIT_DATE__: JSON.stringify(readCommitDate()) },
  plugins: [react(), tailwindcss(), {
    name: 'kards-news',
    configureServer(server) { server.middlewares.use(newsMiddleware); },
    configurePreviewServer(server) { server.middlewares.use(newsMiddleware); },
  }, {
    name: 'kards-private-assets',
    configureServer(server) { server.middlewares.use(staticAssetMiddleware(import.meta.dirname, process.env.KARDS_PACK_SALT || loadEnv(server.config.mode, import.meta.dirname, 'KARDS_').KARDS_PACK_SALT)); },
    configurePreviewServer(server) { server.middlewares.use(staticAssetMiddleware(import.meta.dirname, process.env.KARDS_PACK_SALT || loadEnv(server.config.mode, import.meta.dirname, 'KARDS_').KARDS_PACK_SALT)); },
  }],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
  server: { host: '127.0.0.1' },
});
