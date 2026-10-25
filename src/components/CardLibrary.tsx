import { useMemo, useState } from 'react';
import { Download, Search, X } from 'lucide-react';
import { CardFace } from './CardFace';
import { startImageDownload, useImageDownload } from '../lib/imageDownloads';
import { useDialogKeyboard } from '../lib/dialogKeyboard';
import { EMPTY_CARD_FILTERS, matchesCardFilters, type CardFilters } from '../lib/cardFilters';
import CustomSelect from './CustomSelect';
import CardFilterSelects from './CardFilterSelects';
import {
  CARD_LANGUAGES,
  cardText,
  cardTitle,
  factionLabel,
  typeLabel,
  type CardLanguage,
  type KardsCardRecord,
} from '../types/card';

const PAGE_SIZE = 36;
const DEFAULT_VERSION = 54;

export default function CardLibrary({ cards }: { cards: KardsCardRecord[] }) {
  const [filters, setFilters] = useState<CardFilters>({ ...EMPTY_CARD_FILTERS });
  const expansions = useMemo(() => [...new Set(cards.map((card) => card.json.set).filter(Boolean))].sort(), [cards]);
  const [language, setLanguage] = useState<CardLanguage>('zh-Hans');
  const [version, setVersion] = useState(DEFAULT_VERSION);
  const [page, setPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<KardsCardRecord | null>(null);
  const download = useImageDownload();
  const detailRef = useDialogKeyboard(!!selectedCard, () => setSelectedCard(null));

  const filteredCards = useMemo(() => cards.filter(card => matchesCardFilters(card, filters)), [cards, filters]);

  const pageCount = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
  const pageCards = filteredCards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectFilter = (value: CardFilters) => {
    setFilters(value);
    setPage(1);
  };
  const resetFilters = () => { setFilters({ ...EMPTY_CARD_FILTERS }); setPage(1); };

  return (
    <div onKeyDown={event => {
      if (event.defaultPrevented || event.nativeEvent.isComposing || event.key !== 'Escape' || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (selectedCard) { event.preventDefault(); setSelectedCard(null); }
      else if ((event.target as HTMLElement).tagName !== 'SELECT') { event.preventDefault(); resetFilters(); }
    }} className="relative flex h-full min-h-0 gap-4 p-5">
      <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-kards-border glass-panel p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kards-text-muted" />
            <input aria-label="搜索卡牌" value={filters.query} onChange={(event) => selectFilter({ ...filters, query: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.closest('section')?.querySelector<HTMLButtonElement>('[data-testid="library-grid"] button')?.focus(); } }} placeholder="搜索卡名、卡牌文本或 ID" className="w-full rounded border border-kards-border bg-kards-input-bg py-2 pl-9 pr-3 text-sm text-kards-text outline-none focus:border-kards-gold" />
          </div>
          <CardFilterSelects filters={filters} onChange={selectFilter} expansions={expansions} language={language} />
          <CustomSelect label="卡牌语言" value={language} onChange={value => setLanguage(value as CardLanguage)} options={CARD_LANGUAGES.map(item => ({ value: item.id, label: item.label }))} />
          <CustomSelect label="卡图版本" value={String(version)} onChange={value => setVersion(Number(value))} options={Array.from({ length: 15 }, (_, index) => DEFAULT_VERSION - index).map(item => ({ value: String(item), label: `卡图 v${item}` }))} />
          <button onClick={resetFilters} className="px-2 py-2 text-sm text-kards-text-muted hover:text-kards-text">重置筛选</button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-kards-text-muted">
          <span>本地目录 {cards.length.toLocaleString()} 张 · 当前结果 {filteredCards.length.toLocaleString()} 张</span>
          <button disabled={!filteredCards.length || download.status === 'running'} onClick={() => {
            if (filteredCards.length > 100 && !window.confirm(`下载当前筛选的全部 ${filteredCards.length.toLocaleString()} 张卡图（${language} / v${version}）？已有缓存会跳过；切换页面后仍会继续下载。`)) return;
            startImageDownload(filteredCards, language, version);
          }} className="flex items-center gap-1 rounded border border-kards-border glass-panel px-3 py-2 text-kards-text disabled:opacity-40"><Download className="h-3.5 w-3.5" />缓存筛选结果（{filteredCards.length.toLocaleString()} 张）</button>
        </div>

        <div data-testid="library-grid" className="card-gallery custom-scrollbar min-h-0 flex-1 overflow-y-auto pb-2">
          {pageCards.map((card) => (
            <button key={card.importId} onClick={() => setSelectedCard(card)} className="card-tile card-action group text-left" aria-label={`查看${cardTitle(card, language)}`}>
              <CardFace card={card} language={language} version={version} />
              <div className="card-caption" title={cardTitle(card, language)}>{cardTitle(card, language)}</div>
            </button>
          ))}
          {pageCards.length === 0 && <div className="col-span-full py-16 text-center text-kards-text-muted">没有找到匹配的卡牌</div>}
        </div>

        <div className="flex items-center justify-center gap-4 text-sm text-kards-text">
          <button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="rounded border border-kards-border px-3 py-1 disabled:opacity-40">上一页</button>
          <span>{page} / {pageCount}</span>
          <button onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount} className="rounded border border-kards-border px-3 py-1 disabled:opacity-40">下一页</button>
        </div>
      </section>

      {selectedCard && (
        <aside ref={detailRef} role="dialog" aria-modal="false" aria-label="卡牌详情" tabIndex={-1} className="glass-panel custom-scrollbar absolute bottom-5 right-5 top-5 z-30 flex w-[300px] max-w-[calc(100%-40px)] flex-col overflow-y-auto rounded-lg border border-kards-border p-4 shadow-xl">
          <button onClick={() => setSelectedCard(null)} aria-label="关闭卡牌详情" className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1 text-white"><X className="h-4 w-4" /></button>
          <CardFace card={selectedCard} language={language} version={version} className="mx-auto mb-4 max-h-[55vh] w-full object-contain" />
          <h2 className="text-lg font-bold text-kards-text">{cardTitle(selectedCard, language)}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-kards-text-muted">{cardText(selectedCard, language)}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-kards-border pt-4 text-sm"><dt>阵营</dt><dd>{factionLabel(selectedCard.json.faction)}</dd><dt>类型</dt><dd>{typeLabel(selectedCard.json.type)}</dd><dt>费用</dt><dd>{selectedCard.json.kredits ?? 0}</dd><dt>稀有度</dt><dd>{selectedCard.json.rarity || '—'}</dd><dt>扩展包</dt><dd>{String(selectedCard.json.set || '—')}</dd><dt>卡牌 ID</dt><dd>{selectedCard.importId}</dd><dt>状态</dt><dd>{selectedCard.reserved ? '预备卡' : '现役'}</dd></dl>
        </aside>
      )}
    </div>
  );
}
