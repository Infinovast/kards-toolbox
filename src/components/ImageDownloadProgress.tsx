import { useEffect, useState } from 'react';
import { Download, Minus, Pause, Play, Plus, X } from 'lucide-react';
import { cancelImageDownload, dismissImageDownload, pauseImageDownload, resumeImageDownload, setImageDownloadInterval, setImageDownloadThreads, startImageDownload, useImageDownload } from '../lib/imageDownloads';

export default function ImageDownloadProgress() {
  const task = useImageDownload();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (task.status !== 'running' && task.status !== 'paused') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [task.status]);
  if (task.status === 'idle') return null;
  const elapsedAt = task.status === 'paused' ? task.pausedAt : task.endedAt || now;
  const seconds = Math.max(1, (elapsedAt - task.startedAt - task.pausedMs) / 1000);
  const speed = task.bytes / seconds;
  const remaining = task.completed ? Math.ceil((task.total - task.completed) * seconds / task.completed) : null;
  const eta = remaining === null ? '估算中' : remaining >= 60 ? `${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒` : `${remaining} 秒`;
  return <section aria-label="卡图缓存下载进度" onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); if (task.status === 'running' || task.status === 'paused') cancelImageDownload(); else dismissImageDownload(); } }} className="glass-panel fixed bottom-5 right-5 z-40 w-[360px] max-w-[calc(100vw-40px)] rounded-lg border border-kards-border p-4 text-sm text-kards-text shadow-xl">
    <div className="flex items-center gap-2"><Download className="h-4 w-4" /><h2 className="flex-1 font-bold">{task.status === 'running' ? '正在缓存卡图' : task.status === 'paused' ? '缓存已暂停' : task.status === 'canceled' ? '缓存已停止' : '缓存完成'}</h2>
      {task.status !== 'running' && task.status !== 'paused' && <button aria-label="关闭下载进度" onClick={dismissImageDownload}><X className="h-4 w-4" /></button>}
    </div>
    <p className="mt-2 text-xs text-kards-text-muted">{task.language} · {task.completed} / {task.total} 张（含缩略图）</p>
    <progress aria-label="卡图缓存进度" value={task.completed} max={task.total} className="mt-2 h-2 w-full accent-kards-gold" />
    <p role="status" className="mt-2 text-xs text-kards-text-muted">下载 {task.downloaded} · 已缓存 {task.cached} · 失败 {task.failed}</p>
    {task.current.length > 0 && <div aria-label="当前下载内容" className="custom-scrollbar mt-2 max-h-20 overflow-y-auto text-xs text-kards-text">{task.current.map(item => <p key={item.importId} className="truncate" title={`${item.title}（${item.kinds.map(kind => kind === 'full' ? '卡图' : '缩略图').join('/')}）`}>{item.title}（{item.kinds.map(kind => kind === 'full' ? '卡图' : '缩略图').join('/')}）</p>)}</div>}
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div className="flex items-center justify-between gap-1 rounded border border-kards-border px-2 py-1"><span>间隔</span><button aria-label="减少卡间等待" disabled={task.intervalMs <= 100} onClick={() => setImageDownloadInterval(task.intervalMs - 100)} className="rounded p-1 hover:bg-kards-panel-hover disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button><span className="min-w-9 text-center tabular-nums">{(task.intervalMs / 1000).toFixed(1)}s</span><button aria-label="增加卡间等待" disabled={task.intervalMs >= 30000} onClick={() => setImageDownloadInterval(task.intervalMs + 100)} className="rounded p-1 hover:bg-kards-panel-hover disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button></div>
      <div className="flex items-center justify-between gap-1 rounded border border-kards-border px-2 py-1"><span>线程</span><button aria-label="减少下载线程" disabled={task.threads <= 1} onClick={() => setImageDownloadThreads(task.threads - 1)} className="rounded p-1 hover:bg-kards-panel-hover disabled:opacity-40"><Minus className="h-3.5 w-3.5" /></button><span className="min-w-5 text-center tabular-nums">{task.threads}</span><button aria-label="增加下载线程" disabled={task.threads >= 8} onClick={() => setImageDownloadThreads(task.threads + 1)} className="rounded p-1 hover:bg-kards-panel-hover disabled:opacity-40"><Plus className="h-3.5 w-3.5" /></button></div>
    </div>
    <div className="mt-3 flex items-center justify-between gap-2 text-xs"><span className="tabular-nums">{(speed / 1024).toFixed(1)} KB/s · 预计剩余 {eta}</span>{task.status === 'running' || task.status === 'paused' ? <div className="flex gap-2">{task.status === 'running' ? <button onClick={pauseImageDownload} className="flex items-center gap-1 rounded border border-kards-border px-2 py-1"><Pause className="h-3.5 w-3.5" />暂停</button> : <button onClick={resumeImageDownload} className="flex items-center gap-1 rounded border border-kards-border px-2 py-1"><Play className="h-3.5 w-3.5" />继续</button>}<button onClick={cancelImageDownload} className="rounded border border-kards-border px-2 py-1">停止</button></div> : task.failed > 0 && <button onClick={() => startImageDownload(task.failedCards, task.language, true)} className="rounded border border-kards-border px-3 py-1">重试失败卡图</button>}</div>
  </section>;
}
