import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {applyCacheBundle} from './lib/cacheBundle';
import './index.css';

const root = createRoot(document.getElementById('root')!);
const openApp = () => root.render(<StrictMode><App /></StrictMode>);

async function start() {
  const showProgress = (message: string) => root.render(
    <main className="flex h-screen flex-col items-center justify-center gap-4 bg-kards-bg text-kards-text" role="status" aria-live="polite">
      <h1 className="text-xl font-bold">KARDS 工具箱</h1>
      <p className="text-sm text-kards-text-muted">{message}</p>
    </main>,
  );
  showProgress('正在启动…');
  try {
    await applyCacheBundle((completed, total) => showProgress(`正在初始化卡图缓存 ${completed.toLocaleString()} / ${total.toLocaleString()}`));
    openApp();
  } catch (error) {
    root.render(<main className="flex h-screen flex-col items-center justify-center gap-4 bg-kards-bg p-8 text-kards-text" role="alert">
      <h1 className="text-xl font-bold">缓存初始化失败</h1>
      <p className="max-w-xl text-sm text-kards-text-muted">{error instanceof Error ? error.message : String(error)}</p>
      <div className="flex gap-3">
        <button className="rounded border border-kards-border px-4 py-2 hover:bg-kards-panel-hover" onClick={openApp}>继续启动</button>
        <button className="rounded bg-kards-accent px-4 py-2 text-white hover:opacity-80" onClick={start}>重试</button>
      </div>
    </main>);
  }
}

void start();
