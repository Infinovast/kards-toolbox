import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { cancelImageDownload, dismissImageDownload, startImageDownload, useImageDownload } from '../lib/imageDownloads';

export default function ImageDownloadProgress() {
  const task = useImageDownload();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (task.status !== 'running') return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [task.status]);
  if (task.status === 'idle') return null;
  const seconds = Math.max(1, (now - task.startedAt) / 1000);
  const speed = task.bytes / seconds;
  const remaining = task.completed ? Math.ceil((task.total - task.completed) * seconds / task.completed) : null;
  const eta = remaining === null ? '估算中' : remaining >= 60 ? `${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒` : `${remaining} 秒`;
  return <section aria-label="卡图缓存下载进度" onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); if (task.status === 'running') cancelImageDownload(); else dismissImageDownload(); } }} className="glass-panel fixed bottom-5 right-5 z-40 w-[340px] max-w-[calc(100vw-40px)] rounded-lg border border-kards-border p-4 text-sm text-kards-text shadow-xl">
    <div className="flex items-center gap-2"><Download className="h-4 w-4" /><h2 className="flex-1 font-bold">{task.status === 'running' ? '正在缓存卡图' : task.status === 'canceled' ? '缓存已停止' : '缓存完成'}</h2>
      {task.status !== 'running' && <button aria-label="关闭下载进度" onClick={dismissImageDownload}><X className="h-4 w-4" /></button>}
    </div>
    <p className="mt-2 text-xs text-kards-text-muted">{task.language} · {task.version === 'current' ? '当前卡图' : `v${task.version}`} · {task.completed} / {task.total} 张（含缩略图）</p>
    <progress aria-label="卡图缓存进度" value={task.completed} max={task.total} className="mt-2 h-2 w-full accent-kards-gold" />
    <p role="status" className="mt-2 text-xs text-kards-text-muted">下载 {task.downloaded} · 已缓存 {task.cached} · 失败 {task.failed}</p>
    {task.status === 'running' ? <div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="tabular-nums">{(speed / 1024).toFixed(1)} KB/s · 预计剩余 {eta}</span><button onClick={cancelImageDownload} className="rounded border border-kards-border px-2 py-1">停止下载</button></div>
      : task.failed > 0 && <button onClick={() => startImageDownload(task.failedCards, task.language, task.version)} className="mt-3 rounded border border-kards-border px-3 py-1">重试失败卡图</button>}
  </section>;
}
