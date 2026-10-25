import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';

async function startServer() {
  const app = express();
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve('dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(3000, '127.0.0.1', () => console.log('KARDS 工具箱: http://127.0.0.1:3000'));
}
startServer().catch(console.error);
