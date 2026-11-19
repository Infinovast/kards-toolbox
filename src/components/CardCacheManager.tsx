import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Search, Trash2 } from 'lucide-react';
import { cardDisplayTitle, type KardsCardRecord } from '../types/card';
import { compactCardImageCache, deleteCachedImages, getCachedCardImage, readCardImageCache, useImageCacheInventoryRevision, type CardCacheEntry } from '../lib/cardImages';
import { startImageDownload, useImageDownload } from '../lib/imageDownloads';
import { requestConfirmation } from '../lib/appDialogs';
import CustomSelect from './CustomSelect';
import PageIndicator from './PageIndicator';
import SearchClearButton from './SearchClearButton';

type CacheSnapshot = Awaited<ReturnType<typeof readCardImageCache>>;
const labels = { cached: '已缓存', missing: '未缓存', failed: '缓存失败', running: '正在缓存' };
const pageSize = 30;
const storageSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes.toLocaleString()} B`;
  const unit = bytes < 1024 ** 2 ? 1 : bytes < 1024 ** 3 ? 2 : 3;
  return `${(bytes / 1024 ** unit).toFixed(1)} ${['B', 'KiB', 'MiB', 'GiB'][unit]}`;
};

export default function CardCacheManager({ cards }: { cards: KardsCardRecord[] }) {
  const revision = useImageCacheInventoryRevision();
  const task = useImageDownload();
  const [snapshot, setSnapshot] = useState<CacheSnapshot>();
  const [imageData, setImageData] = useState<Record<string, string | null>>({});
  const loadedImageKeys = useRef(new Set<string>());
  const [scope, setScope] = useState('all');
  const [status, setStatus] = useState<CardCacheEntry['status']>('cached');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [readAttempt, setReadAttempt] = useState(0);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const batchSeen = useRef('');
  const pendingAction = useRef(false);

  useEffect(() => {
    let active = true;
    void readCardImageCache(cards).then(result => {
      if (!active) return;
      setSnapshot(result); setError('');
      if (result.batch && batchSeen.current !== result.batch.startedAt) {
        batchSeen.current = result.batch.startedAt;
        setScope('recent');
      }
    }).catch(() => { if (active) { setSnapshot(undefined); setError('读取本地缓存清单失败，请重新读取。'); } });
    return () => { active = false; };
  }, [cards, revision, readAttempt]);

  const entries = useMemo(() => {
    if (scope === 'recent' && snapshot?.batch?.cardIds) {
      const ids = new Set(snapshot.batch.cardIds);
      return snapshot.entries.filter(entry => ids.has(entry.card.cardId));
    }
    const ids = scope === 'recent' ? new Set(snapshot?.batch?.importIds) : undefined;
    return (snapshot?.entries || []).filter(entry => !ids || ids.has(entry.card.importId));
  }, [snapshot, scope]);
  const counts = { cached: 0, missing: 0, failed: 0 };
  entries.forEach(entry => counts[entry.status]++);
  const filtered = useMemo(() => entries.filter(entry => entry.status === status && [cardDisplayTitle(entry.card, 'zh-Hans'), ...Object.values(entry.card.json.title || {}), entry.card.cardId, entry.card.importId].some(text => text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [entries, status, query]);
  useEffect(() => setPage(1), [status, query, scope]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visibleEntries = useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage]);

  useEffect(() => {
    let active = true;
    const visibleKeys = new Set(visibleEntries.flatMap(entry => [entry.full, entry.thumbnail].filter(part => part.status === 'cached').map(part => part.key)));
    loadedImageKeys.current.forEach(key => { if (!visibleKeys.has(key)) loadedImageKeys.current.delete(key); });
    setImageData(current => Object.fromEntries(Object.entries(current).filter(([key]) => visibleKeys.has(key))));
    const requests = visibleEntries.flatMap(entry => (['full', 'thumbnail'] as const).flatMap(kind => {
      const part = kind === 'full' ? entry.full : entry.thumbnail;
      if (part.status !== 'cached') { loadedImageKeys.current.delete(part.key); return []; }
      if (loadedImageKeys.current.has(part.key)) return [];
      loadedImageKeys.current.add(part.key);
      return [{ entry, kind, key: part.key }];
    }));
    const pendingKeys = new Set(requests.map(request => request.key));
    void Promise.all(requests.map(async ({ entry, kind, key }) => {
      const image = await getCachedCardImage(entry.card, kind).catch(() => null);
      pendingKeys.delete(key);
      if (image === null) loadedImageKeys.current.delete(key);
      if (active) setImageData(current => ({ ...current, [key]: image }));
    }));
    return () => { active = false; pendingKeys.forEach(key => loadedImageKeys.current.delete(key)); };
  }, [visibleEntries, readAttempt]);

  const busy = deleting || task.status === 'running' || task.status === 'paused' || !!snapshot?.downloading;
  const remove = async (keys: string[], label: string, confirm = true) => {
    if (busy || pendingAction.current || !keys.length) return;
    pendingAction.current = true;
    try {
      if (confirm && !await requestConfirmation(`删除${label}？共 ${keys.length.toLocaleString()} 项，包含对应失败记录。`, { title: '删除缓存', confirmLabel: '删除' })) return;
      setDeleting(true); setActionError(''); setMessage('');
      await deleteCachedImages(keys); setMessage(`已删除${label}。`);
    } catch (error) { setActionError(error instanceof Error ? error.message : '删除缓存失败，请重试。'); }
    finally { setDeleting(false); pendingAction.current = false; }
  };
  const deleteButton = (keys: string[], label: string, text = '删除', confirm = true) => <button type="button" aria-label={`删除${label}`} disabled={!snapshot || busy || !keys.length} onClick={() => void remove(keys, label, confirm)} className="inline-flex items-center gap-1 rounded border border-kards-border px-2 py-1 text-xs text-kards-text hover:border-red-500/60 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />{text}</button>;
  const downloadEntries = status === 'cached' ? entries.filter(entry => entry.status !== 'cached') : filtered;
  const downloadLabel = status === 'failed' ? '重试失败卡图' : status === 'missing' ? '缓存未缓存卡图' : '补全当前范围';
  const download = async () => {
    if (busy || pendingAction.current || !downloadEntries.length) return;
    pendingAction.current = true;
    try {
      const selected = downloadEntries.map(entry => entry.card);
      if (selected.length > 100 && !await requestConfirmation(`缓存 ${selected.length.toLocaleString()} 张卡牌的大图和缩略图？`, { title: '批量缓存卡图', confirmLabel: '开始缓存' })) return;
      setActionError(''); setMessage('');
      await startImageDownload(selected, scope === 'recent' || status === 'failed');
    } catch (error) { setActionError(error instanceof Error ? error.message : '启动缓存失败，请重试。'); }
    finally { pendingAction.current = false; }
  };
  const compact = async () => {
    if (busy || pendingAction.current) return;
    pendingAction.current = true;
    setDeleting(true); setActionError(''); setMessage('');
    try { await compactCardImageCache(); setMessage('卡图缓存已整理。'); }
    catch (error) { setActionError(error instanceof Error ? error.message : '整理缓存失败'); }
    finally { setDeleting(false); pendingAction.current = false; }
  };
  const allImageKeys = snapshot ? [...snapshot.imageKeys.full, ...snapshot.imageKeys.thumbnail, ...snapshot.deckImageEntries.map(entry => entry.key)] : [];

  return <section aria-label="本地缓存" className="mb-8 rounded-lg glass-panel p-5 md:p-6">
    <div className="flex items-center justify-between gap-3"><h3 className="text-lg font-bold text-kards-text">本地缓存</h3><span className="text-xs text-kards-text-muted">随缓存变更自动更新</span></div>
    <dl aria-label="缓存统计" className="mt-5 grid grid-cols-4 gap-3 text-xs lg:gap-6 lg:text-sm">
      <div className="min-w-0"><dt className="text-kards-text-muted">卡牌数据</dt><dd className="mt-2 text-base font-bold tabular-nums text-kards-text">{cards.length.toLocaleString()} <span className="text-xs font-normal">张</span></dd></div>
      <div className="min-w-0"><dt className="text-kards-text-muted">已缓存卡牌大图</dt><dd className="mt-2 text-base font-bold tabular-nums text-kards-text">{snapshot ? snapshot.cachedFull.toLocaleString() : '—'} <span className="text-xs font-normal">张</span><span className="mt-1 block text-xs font-normal text-kards-text-muted" aria-label="卡牌大图占用空间">{snapshot ? storageSize(snapshot.storageBytes.full) : '—'}</span></dd></div>
      <div className="min-w-0"><dt className="text-kards-text-muted">已缓存卡牌缩略图</dt><dd className="mt-2 text-base font-bold tabular-nums text-kards-text">{snapshot ? snapshot.cachedThumbnail.toLocaleString() : '—'} <span className="text-xs font-normal">张</span><span className="mt-1 block text-xs font-normal text-kards-text-muted" aria-label="卡牌缩略图占用空间">{snapshot ? storageSize(snapshot.storageBytes.thumbnail) : '—'}</span></dd></div>
      <div className="min-w-0"><dt className="text-kards-text-muted">已生成卡组图片</dt><dd className="mt-2 text-base font-bold tabular-nums text-kards-text">{snapshot ? snapshot.deckImages.toLocaleString() : '—'} <span className="text-xs font-normal">张</span><span className="mt-1 block text-xs font-normal text-kards-text-muted" aria-label="卡组图片占用空间">{snapshot ? storageSize(snapshot.storageBytes.deckImages) : '—'}</span></dd></div>
    </dl>
    <p className="mt-3 text-xs text-kards-text-muted">空间包含旧缓存，按有效缓存内容统计，不含存储索引与待回收碎片。</p>
    <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-kards-border pt-4">
      <CustomSelect label="缓存查看范围" value={scope} onChange={setScope} options={[{ value: 'all', label: '全部牌库' }, ...(snapshot?.batch ? [{ value: 'recent', label: `最近批量缓存（${snapshot.batch.importIds.length} 张）` }] : [])]} />
      <div className="relative min-w-40 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-kards-text-muted" /><input aria-label="搜索缓存卡牌" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && query && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); setQuery(''); } }} placeholder="搜索卡名或编号" className="w-full rounded border border-kards-border bg-kards-input-bg py-2 pl-9 pr-9 text-sm text-kards-text" /><SearchClearButton label="清除缓存卡牌搜索" value={query} onClear={() => setQuery('')} /></div>
    </div>
    {scope === 'recent' && snapshot?.batch && <time dateTime={snapshot.batch.startedAt} className="mt-3 block text-xs text-kards-text-muted">{new Date(snapshot.batch.startedAt).toLocaleString('zh-CN', { hour12: false })}</time>}
    <div className="my-4 flex flex-wrap items-center justify-between gap-3">
      <div className="inline-flex overflow-hidden rounded border border-kards-border" role="group" aria-label="缓存状态分类">
        {(['cached', 'missing', 'failed'] as const).map((kind, index) => <button type="button" key={kind} aria-pressed={status === kind} onClick={() => setStatus(kind)} className={`px-3 py-2 text-xs tabular-nums lg:text-sm ${index ? 'border-l border-kards-border' : ''} ${status === kind ? 'bg-kards-gold/15 text-kards-text' : 'text-kards-text-muted hover:bg-kards-panel-hover hover:text-kards-text'}`}>{labels[kind]}（{counts[kind].toLocaleString()}）</button>)}
      </div>
      <button type="button" onClick={() => void download()} disabled={!snapshot || !!error || !downloadEntries.length || busy} className="inline-flex items-center gap-2 rounded bg-kards-accent px-3 py-2 text-sm font-bold text-white disabled:opacity-40"><Download className="h-4 w-4" aria-hidden="true" />{downloadLabel}（{downloadEntries.length.toLocaleString()} 张）</button>
      {(task.status === 'paused' || task.status === 'running') && <span role="status" className="self-center text-xs text-kards-status">{task.status === 'paused' ? '已暂停' : '缓存中'}</span>}
    </div>
    <details aria-label="缓存维护" className="mb-4 border-y border-kards-border py-2 text-sm text-kards-text">
      <summary className="cursor-pointer py-1 text-kards-text-muted">缓存维护<span className="ml-2 text-xs">删除、清理与空间整理</span></summary>
      <div className="mt-3 flex flex-wrap gap-2">
        {deleteButton(filtered.flatMap(entry => [entry.full, entry.thumbnail].filter(part => part.status === 'cached' || part.status === 'failed').map(part => part.key)), `当前筛选的 ${filtered.length} 张卡牌的图片缓存和失败记录`, '删除当前筛选缓存')}
        {deleteButton(snapshot?.imageKeys.full || [], '全部卡牌大图', '删除全部大图')}
        {deleteButton(snapshot?.imageKeys.thumbnail || [], '全部卡牌缩略图', '删除全部缩略图')}
        {deleteButton(snapshot?.deckImageEntries.map(entry => entry.key) || [], '全部卡组图片缓存', '删除全部卡组图片')}
        {deleteButton(allImageKeys, '全部图片缓存', '删除全部图片缓存')}
      </div>
      {!!snapshot?.unusedImageKeys.length && <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-kards-text-muted"><span>旧缓存与失败记录 · {snapshot.unusedImageKeys.length.toLocaleString()} 项</span>{deleteButton(snapshot.unusedImageKeys, '未使用的旧卡图缓存与失败记录', '清理旧缓存')}</div>}
      {window.kardsDesktop?.compactCardPack && <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-kards-text-muted"><span>可回收空间 {storageSize(snapshot?.packDeadBytes || 0)}</span><button type="button" disabled={!snapshot || busy || !snapshot.packDeadBytes} onClick={() => void compact()} className="rounded border border-kards-border px-2 py-1 text-kards-text disabled:opacity-40">整理卡图缓存</button></div>}
      <details className="my-3 text-xs"><summary className="cursor-pointer py-1">已生成卡组图片列表（{snapshot?.deckImages || 0} 份）</summary>
        <div className="custom-scrollbar mt-2 max-h-64 overflow-y-auto">{snapshot?.deckImageEntries.length ? snapshot.deckImageEntries.map(entry => <div key={entry.key} className="flex items-center justify-between gap-3 border-b border-kards-border py-2"><span className="min-w-0 break-all">{entry.name}</span><div className="shrink-0">{deleteButton([entry.key], `卡组“${entry.name}”的图片缓存`, '删除', false)}</div></div>) : <p className="py-3 text-kards-text-muted">暂无卡组图片缓存。</p>}</div>
      </details>
    </details>
    {(error || actionError || snapshot?.recordError) && <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded border border-red-500/40 p-3 text-sm text-kards-text"><p>{error || actionError || snapshot?.recordError}</p>{(error || snapshot?.recordError) && <button type="button" onClick={() => setReadAttempt(value => value + 1)} className="shrink-0 rounded border border-kards-border px-3 py-1 hover:border-kards-gold">重新读取</button>}</div>}
    {message && <p role="status" className="mb-4 text-sm text-kards-text">{message}</p>}
    {!snapshot && !error ? <p role="status" className="py-6 text-sm text-kards-text-muted">正在读取本地缓存清单…</p> : !filtered.length ? <p role="status" className="border-y border-kards-border py-6 text-sm text-kards-text-muted">{query ? '没有符合搜索条件的卡牌。' : status === 'cached' ? '当前范围尚无完整缓存的卡牌。' : status === 'missing' ? '当前范围没有未缓存的卡牌。' : '当前范围没有缓存失败的卡牌。'}</p> : <div aria-label="卡牌缓存图片清单" className="grid grid-cols-3 gap-2 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 2xl:grid-cols-10">
      {visibleEntries.map(entry => {
        const title = cardDisplayTitle(entry.card, 'zh-Hans');
        const parts = [{ key: 'full', label: '完整卡图', cache: entry.full, image: imageData[entry.full.key] }, { key: 'thumbnail', label: '缩略图', cache: entry.thumbnail, image: imageData[entry.thumbnail.key] }];
        return <article key={entry.card.cardId} className="min-w-0 rounded border border-kards-border bg-kards-panel/40 p-1.5">
          <div className="mb-1 flex items-center gap-1"><h4 className="min-w-0 flex-1 truncate text-xs font-bold text-kards-text" title={`${title} · ${entry.card.cardId}`}>{title}</h4><button type="button" aria-label={`删除${title}的卡图和缩略图`} title="删除卡图和缩略图" disabled={busy || !parts.some(part => part.cache.status === 'cached' || part.cache.status === 'failed')} onClick={() => void remove([entry.full.key, entry.thumbnail.key], `${title}的卡图和缩略图`, false)} className="shrink-0 rounded p-1 text-kards-text-muted hover:bg-kards-panel-hover hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"><Trash2 className="h-3 w-3" /></button></div>
          <div className="grid grid-cols-2 gap-1">{parts.map(part => <div key={part.key} aria-label={`${title} ${part.label}：${labels[part.cache.status]}`} title={part.cache.error ? `${part.label}：${part.cache.error.message} · ${new Date(part.cache.error.at).toLocaleString('zh-CN', { hour12: false })}` : `${part.label}：${labels[part.cache.status]}`} className="flex h-24 min-w-0 items-center justify-center bg-black/10">
            {part.cache.status === 'cached' && part.image ? <img src={part.image} alt={`${title} ${part.label}`} loading="lazy" className="h-full w-full object-contain" /> : <span className={`px-1 text-center text-xs ${part.cache.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-kards-text-muted'}`}>{part.cache.status === 'cached' ? part.image === undefined ? '读取中…' : '读取失败' : labels[part.cache.status]}</span>}
          </div>)}</div>
        </article>;
      })}
    </div>}
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-kards-text-muted"><span>共 {filtered.length} 张</span><PageIndicator page={currentPage} pageCount={pages} onChange={setPage} /></div>
  </section>;
}
