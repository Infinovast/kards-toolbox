import { useEffect, useMemo, useState } from 'react';
import { Download, RotateCcw, Search, Trash2, X } from 'lucide-react';
import { cardDisplayTitle, type KardsCardRecord } from '../types/card';
import CustomSelect from './CustomSelect';
import { compareCardData, type CardFieldChange } from '../lib/cardData';
import type { CardDataSource } from '../lib/cardData';
import { applyCardData, cancelCardDataCheck, checkCardData, deleteDownloadedCardData, initializeCardDataSync, rollbackCardData, useCardDataSync } from '../lib/cardDataSync';

const labels: Record<string, string> = { cardId: '卡牌标识', imageUrl: '当前卡图地址', thumbUrl: '缩略图地址', reserved: '预备状态', title: '卡名', text: '卡牌文本', description: '描述', kredits: '费用', attack: '攻击力', defense: '防御力', rarity: '稀有度', faction: '阵营', type: '类型', set: '扩展包', image: '卡图路径', attributes: '关键词与老兵关系', operationCost: '行动费用', can_create: '衍生卡', exile: '放逐', permanent_pool: '常驻卡池', id: '卡牌标识', import_id: '卡组码编号' };
const kindLabels = { added: '新增', changed: '修改', removed: '移除' };
function fieldName(path: string) { const [field, ...rest] = path.split('.'); return `${labels[field] || field}${rest.length ? `（${rest.join('.')}）` : ''}`; }
function valueText(value: unknown) {
  if (value === undefined) return '—';
  if (value === null) return '空值';
  if (typeof value === 'boolean') return value ? '是' : '否';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
function timeText(value?: string | null) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '暂无'; }
function sourceLabel(source?: string) { return source === 'kardscom' || source === 'official' ? 'kards.com' : source === 'kardsplayer' ? 'kardsplayer.com' : '内置数据'; }

export default function CardDataUpdater({ cards, onApplied }: { cards: KardsCardRecord[]; onApplied: (cards: KardsCardRecord[]) => void }) {
  const sync = useCardDataSync();
  const [source, setSource] = useState<CardDataSource>(() => localStorage.getItem('kards_card_data_source') === 'kardscom' ? 'kardscom' : 'kardsplayer');
  useEffect(() => { void initializeCardDataSync(); }, []);
  useEffect(() => { localStorage.setItem('kards_card_data_source', source); }, [source]);
  const [kind, setKind] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const pending = sync.stored.pending;
  const changes = useMemo(() => pending ? compareCardData(cards, pending.cards) : [], [cards, pending]);
  const counts = { added: changes.filter(change => change.kind === 'added').length, changed: changes.filter(change => change.kind === 'changed').length, removed: changes.filter(change => change.kind === 'removed').length };
  const filtered = changes.filter(change => (kind === 'all' || change.kind === kind) && [change.importId, change.before?.cardId, change.after?.cardId, change.before && cardDisplayTitle(change.before, 'zh-Hans'), change.after && cardDisplayTitle(change.after, 'zh-Hans')].filter(Boolean).some(text => text.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())));
  useEffect(() => setPage(1), [kind, query, pending]);
  const busy = sync.status === 'fetching' || sync.status === 'applying';
  const apply = async () => {
    if (counts.removed && !window.confirm(`本次更新会从卡牌资料库移除 ${counts.removed} 张远端不再返回的卡牌。已有卡组码、携带数量和用户数据会保留；缺失卡将显示编号。应用前会保存一份可回退的数据。是否继续？`)) return;
    try { onApplied(await applyCardData(cards)); } catch { /* The service exposes the write error inline. */ }
  };
  const rollback = async () => {
    if (!window.confirm('回退至上次卡牌数据？卡组、设置、桌布和卡图缓存不会改变。')) return;
    try { onApplied(await rollbackCardData()); } catch { /* Keep the current database visible on failure. */ }
  };
  const removeData = async (part: 'all' | 'active' | 'pending' | 'previous') => {
    const label = { all: '全部下载的卡牌数据（含已应用、待应用和回退数据）及更新记录', active: '当前已应用的更新数据', pending: '待应用数据', previous: '回退数据' }[part];
    if (!window.confirm(`删除${label}？${part === 'all' || part === 'active' ? '当前牌库将切回随包数据。' : ''}卡组和图片缓存会保留，需要时可重新获取数据。`)) return;
    try {
      const restored = await deleteDownloadedCardData(part);
      if (restored) onApplied(restored);
    } catch { /* The service exposes deletion errors inline. */ }
  };
  const hasDownloadedData = !!(sync.stored.active || sync.stored.pending || sync.stored.previous || sync.stored.lastCheckedAt);

  return <section aria-label="卡牌数据更新" className="mb-6 rounded-lg glass-panel p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <h3 className="text-base font-bold text-kards-text">卡牌数据</h3>
        <div role="group" aria-label="数据更新来源" className="inline-flex overflow-hidden rounded border border-kards-border">
          <button type="button" aria-pressed={source === 'kardsplayer'} onClick={() => setSource('kardsplayer')} className={`px-3 py-1.5 text-xs ${source === 'kardsplayer' ? 'bg-kards-gold/15 text-kards-text' : 'text-kards-text-muted hover:text-kards-text'}`}>kardsplayer.com</button>
          <button type="button" aria-pressed={source === 'kardscom'} onClick={() => setSource('kardscom')} className={`border-l border-kards-border px-3 py-1.5 text-xs ${source === 'kardscom' ? 'bg-kards-gold/15 text-kards-text' : 'text-kards-text-muted hover:text-kards-text'}`}>kards.com</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void checkCardData(source)} disabled={busy} className="flex items-center gap-2 rounded bg-kards-accent px-3 py-2 text-sm font-bold text-white disabled:opacity-40"><Download className="h-4 w-4" />{sync.status === 'fetching' ? '正在获取…' : '获取数据'}</button>
        <button onClick={rollback} disabled={busy || !sync.stored.previous} className="flex items-center gap-2 rounded border border-kards-border px-3 py-2 text-sm text-kards-text disabled:opacity-40"><RotateCcw className="h-4 w-4" />回退上次数据</button>
        <button onClick={() => void removeData('all')} disabled={busy || !hasDownloadedData} className="flex items-center gap-2 rounded border border-kards-border px-3 py-2 text-sm text-kards-text hover:border-red-500/60 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"><Trash2 className="h-4 w-4" />删除全部下载数据</button>
      </div>
    </div>
    <dl className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-kards-border pt-3 text-xs sm:grid-cols-4">
      <div><dt className="text-kards-text-muted">当前牌库</dt><dd className="mt-1 text-kards-text">{cards.length.toLocaleString()} 张 · {sourceLabel(sync.stored.active?.source)}</dd></div>
      <div><dt className="text-kards-text-muted">最近获取</dt><dd className="mt-1 text-kards-text">{timeText(sync.stored.lastCheckedAt)}</dd></div>
      <div><dt className="text-kards-text-muted">最近应用</dt><dd className="mt-1 text-kards-text">{timeText(sync.stored.active?.appliedAt)}</dd></div>
      <div><dt className="text-kards-text-muted">更新来源</dt><dd className="mt-1 text-kards-text">{source === 'kardscom' ? 'kards.com' : 'kardsplayer.com'}</dd></div>
    </dl>
    <details className="mt-4 text-sm text-kards-text"><summary className="cursor-pointer rounded py-1">已下载的卡牌数据</summary>
      <div className="mt-2 divide-y divide-kards-border">{(['active', 'pending', 'previous'] as const).map(part => {
        const data = sync.stored[part];
        const label = { active: '已应用的更新数据', pending: '待应用数据', previous: '回退数据' }[part];
        return <div key={part} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><span>{label}</span><p className="mt-1 text-xs text-kards-text-muted">{data ? `${data.cards.length.toLocaleString()} 张 · ${timeText(data.fetchedAt)}` : '未保存'}</p></div><button aria-label={`删除${label}`} disabled={busy || !data} onClick={() => void removeData(part)} className="flex items-center gap-1 rounded border border-kards-border px-2 py-1 text-xs hover:border-red-500/60 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" />删除</button></div>;
      })}</div>
    </details>
    {sync.status === 'fetching' && <div className="mt-4" role="status">
      <div className="flex items-center justify-between gap-3 text-sm text-kards-text"><span>已获取 {sync.completed.toLocaleString()} / {sync.total ? sync.total.toLocaleString() : '待确认'} 张 · 切换页面后继续获取</span><button onClick={cancelCardDataCheck} className="flex items-center gap-1 rounded border border-kards-border px-3 py-1"><X className="h-4 w-4" />取消获取</button></div>
      <progress aria-label="获取卡牌数据进度" value={sync.completed} max={sync.total || 1} className="mt-3 h-2 w-full accent-kards-accent" />
    </div>}
    {sync.error && <p role="alert" className="mt-4 rounded border border-red-500/40 bg-red-500/10 p-3 text-sm text-kards-text">{sync.error}。当前已应用数据保持不变，可重新操作。</p>}
    {sync.message && <p role="status" className="mt-4 text-sm text-kards-text">{sync.message}</p>}
    {pending && <div className="mt-6 border-t border-kards-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h4 className="font-bold text-kards-text">新旧数据对比</h4><p className="mt-2 text-sm text-kards-text-muted">当前 {cards.length.toLocaleString()} 张 → 待更新 {pending.cards.length.toLocaleString()} 张 · 新增 {counts.added} / 修改 {counts.changed} / 移除 {counts.removed}</p><p className="mt-1 text-xs text-kards-text-muted">候选数据获取于 {timeText(pending.fetchedAt)}</p></div>
        <button onClick={apply} disabled={busy || !changes.length || sync.status !== 'ready'} className="rounded bg-kards-accent px-5 py-2 text-sm font-bold text-white disabled:opacity-40">{sync.status === 'applying' ? '正在应用…' : '应用更新'}</button>
      </div>
      {!changes.length ? <p className="mt-4 text-sm text-kards-text">两份数据一致，无需更新。</p> : <>
        <div className="my-4 flex flex-wrap gap-3">
          <CustomSelect label="数据对比类型" value={kind} onChange={setKind} options={[{ value: 'all', label: `全部差异（${changes.length}）` }, ...Object.entries(kindLabels).map(([value, label]) => ({ value, label: `${label}（${counts[value]}）` }))]} />
          <div className="relative min-w-40 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-kards-text-muted" /><input aria-label="搜索数据差异" value={query} onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Escape' && query && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); setQuery(''); } }} placeholder="搜索卡名或编号" className="w-full rounded border border-kards-border bg-kards-input-bg py-2 pl-9 pr-3 text-sm text-kards-text" /></div>
        </div>
        <div className="divide-y divide-kards-border border-y border-kards-border">
          {filtered.slice((page - 1) * 30, page * 30).map(change => <details key={change.importId} className="py-1">
            <summary className="cursor-pointer py-3 text-sm text-kards-text"><span className="mr-3 text-kards-status">{kindLabels[change.kind]}</span><span className="font-bold">{cardDisplayTitle(change.after || change.before!, 'zh-Hans')}</span><span className="ml-3 text-xs text-kards-text-muted">{change.importId} · {change.fields.length} 项差异</span></summary>
            <div className="custom-scrollbar overflow-x-auto pb-3"><table className="w-full table-fixed text-left text-xs"><thead><tr className="border-b border-kards-border text-kards-text-muted"><th className="w-1/4 px-2 py-2">属性</th><th className="px-2 py-2">当前数据</th><th className="px-2 py-2">待更新数据</th></tr></thead><tbody>{change.fields.map((field: CardFieldChange) => <tr key={field.field} className="border-b border-kards-border align-top text-kards-text"><th className="break-words px-2 py-2 font-normal">{fieldName(field.field)}</th><td className="whitespace-pre-wrap break-words px-2 py-2">{valueText(field.before)}</td><td className="whitespace-pre-wrap break-words px-2 py-2">{valueText(field.after)}</td></tr>)}</tbody></table></div>
          </details>)}
          {!filtered.length && <p className="py-6 text-sm text-kards-text-muted">没有符合条件的差异</p>}
        </div>
        <div className="mt-4 flex items-center justify-center gap-4 text-xs text-kards-text"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-kards-border px-3 py-1 disabled:opacity-40">上一页差异</button><span>{page} / {Math.max(1, Math.ceil(filtered.length / 30))}</span><button disabled={page * 30 >= filtered.length} onClick={() => setPage(page + 1)} className="rounded border border-kards-border px-3 py-1 disabled:opacity-40">下一页差异</button></div>
      </>}
    </div>}
  </section>;
}
