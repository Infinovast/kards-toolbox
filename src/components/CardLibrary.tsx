import { useEffect, useMemo, useState } from 'react';
import { Search, X } from 'lucide-react';
import { cacheCardImage } from '../lib/cardImages';
import {
  CARD_FACTIONS,
  CARD_LANGUAGES,
  CARD_RARITIES,
  CARD_TYPES,
  cardText,
  cardTitle,
  factionLabel,
  typeLabel,
  type CardLanguage,
  type KardsCardRecord,
} from '../types/card';

const PAGE_SIZE = 36;
const DEFAULT_VERSION = 54;

function CardImage({ card, language, version, className = '' }: {
  card: KardsCardRecord;
  language: CardLanguage;
  version: number;
  className?: string;
}) {
  const [source, setSource] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setSource('');
    cacheCardImage(card, language, version)
      .then((url) => { if (active) setSource(url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [card.importId, language, version]);

  if (failed || !source) {
    return <div className={`flex items-center justify-center bg-black/30 text-center text-xs text-kards-text-muted ${className}`}>{failed ? '卡图暂不可用' : '正在载入卡图…'}</div>;
  }
  return <img src={source} alt={cardTitle(card, language)} className={className} />;
}

export default function CardLibrary({ cards }: { cards: KardsCardRecord[] }) {
  const [query, setQuery] = useState('');
  const [faction, setFaction] = useState('All');
  const [cardType, setCardType] = useState('All');
  const [rarity, setRarity] = useState('All');
  const [cost, setCost] = useState('All');
  const [expansion, setExpansion] = useState('All');
  const [status, setStatus] = useState('All');
  const expansions = useMemo(() => [...new Set(cards.map((card) => card.json.set).filter(Boolean))].sort(), [cards]);
  const [language, setLanguage] = useState<CardLanguage>('zh-Hans');
  const [version, setVersion] = useState(DEFAULT_VERSION);
  const [page, setPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<KardsCardRecord | null>(null);

  const filteredCards = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return cards.filter((card) => {
      const textMatch = !term || [card.cardId, card.importId, ...Object.values(card.json.title || {}), ...Object.values(card.json.text || card.json.description || {})]
        .some((value) => value.toLocaleLowerCase().includes(term));
      return textMatch
        && (faction === 'All' || card.json.faction === faction)
        && (cardType === 'All' || card.json.type === cardType)
        && (rarity === 'All' || card.json.rarity === rarity)
        && (cost === 'All' || (cost === '7' ? (card.json.kredits ?? 0) >= 7 : String(card.json.kredits ?? 0) === cost))
        && (expansion === 'All' || card.json.set === expansion)
        && (status === 'All' || (status === 'reserved' ? card.reserved : status === 'generated' ? ['OnlySpawnable', 'Special'].includes(card.json.set || '') : !card.reserved && !['OnlySpawnable', 'Special'].includes(card.json.set || '')));
    });
  }, [cards, query, faction, cardType, rarity, cost, expansion, status]);

  const pageCount = Math.max(1, Math.ceil(filteredCards.length / PAGE_SIZE));
  const pageCards = filteredCards.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const selectFilter = (value: string, setter: (value: string) => void) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="flex h-full min-h-0 gap-4 p-5">
      <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-kards-border bg-kards-panel/90 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kards-text-muted" />
            <input aria-label="搜索卡牌" value={query} onChange={(event) => selectFilter(event.target.value, setQuery)} placeholder="搜索卡名、卡牌文本或 ID" className="w-full rounded border border-kards-border bg-kards-input-bg py-2 pl-9 pr-3 text-sm text-kards-text outline-none focus:border-kards-gold" />
          </div>
          <select aria-label="阵营筛选" value={faction} onChange={(event) => selectFilter(event.target.value, setFaction)} className="rounded border border-kards-border bg-kards-input-bg px-3 py-2 text-sm text-kards-text"><option value="All">全部阵营</option>{CARD_FACTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <select aria-label="类型筛选" value={cardType} onChange={(event) => selectFilter(event.target.value, setCardType)} className="rounded border border-kards-border bg-kards-input-bg px-3 py-2 text-sm text-kards-text"><option value="All">全部类型</option>{CARD_TYPES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <select aria-label="费用筛选" value={cost} onChange={(event) => selectFilter(event.target.value, setCost)} className="rounded border border-kards-border bg-kards-input-bg px-3 py-2 text-sm text-kards-text"><option value="All">全部费用</option>{Array.from({ length: 8 }, (_, index) => <option key={index} value={String(index)}>{index === 7 ? '7 费及以上' : `${index} 费`}</option>)}</select>
          <select aria-label="稀有度筛选" value={rarity} onChange={(event) => selectFilter(event.target.value, setRarity)} className="rounded border border-kards-border bg-kards-input-bg px-3 py-2 text-sm text-kards-text"><option value="All">全部稀有度</option>{CARD_RARITIES.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select aria-label="卡牌语言" value={language} onChange={(event) => setLanguage(event.target.value as CardLanguage)} className="rounded border border-kards-border bg-kards-input-bg px-3 py-2 text-sm text-kards-text">{CARD_LANGUAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
          <select aria-label="卡图版本" value={version} onChange={(event) => setVersion(Number(event.target.value))} className="rounded border border-kards-border bg-kards-input-bg px-3 py-2 text-sm text-kards-text">{Array.from({ length: 15 }, (_, index) => DEFAULT_VERSION - index).map((item) => <option key={item} value={item}>卡图 v{item}</option>)}</select>
          <select aria-label="扩展包筛选" value={expansion} onChange={(e) => selectFilter(e.target.value, setExpansion)} className="max-w-48 rounded border border-kards-border bg-kards-input-bg px-3 py-2 text-sm text-kards-text"><option value="All">全部扩展包</option>{expansions.map((set) => <option key={set} value={set}>{set}</option>)}</select>
          <select aria-label="卡牌状态筛选" value={status} onChange={(e) => selectFilter(e.target.value, setStatus)} className="rounded border border-kards-border bg-kards-input-bg px-3 py-2 text-sm text-kards-text"><option value="All">全部状态</option><option value="active">现役可构筑</option><option value="reserved">预备卡</option><option value="generated">衍生/特殊形态</option></select>
          <button onClick={() => { setQuery(''); setFaction('All'); setCardType('All'); setRarity('All'); setCost('All'); setExpansion('All'); setStatus('All'); setPage(1); }} className="px-2 py-2 text-sm text-kards-text-muted hover:text-kards-text">重置筛选</button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-kards-text-muted">
          <span>本地目录 {cards.length.toLocaleString()} 张 · 当前结果 {filteredCards.length.toLocaleString()} 张</span>
          <span>首次显示的新卡图会自动下载并缓存</span>
        </div>

        <div className="grid min-h-0 flex-1 auto-rows-max content-start grid-cols-2 gap-3 overflow-y-auto pb-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {pageCards.map((card) => (
            <button key={card.importId} onClick={() => setSelectedCard(card)} className="group overflow-hidden rounded-lg border border-kards-border bg-kards-panel/90 text-left transition hover:border-kards-gold hover:shadow-lg">
              <CardImage card={card} language={language} version={version} className="aspect-[2/3] w-full object-cover transition group-hover:brightness-110" />
              <div className="space-y-1 p-2">
                <div className="truncate text-sm font-semibold text-kards-text">{cardTitle(card, language)}</div>
                <div className="flex justify-between gap-1 text-[11px] text-kards-text-muted"><span>{factionLabel(card.json.faction)}</span><span>{card.json.kredits ?? 0} 费 · {card.json.rarity || '—'}</span></div>
              </div>
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
        <aside className="relative flex w-[260px] shrink-0 flex-col overflow-y-auto rounded-lg border border-kards-border bg-kards-panel/95 p-4 xl:w-[300px]">
          <button onClick={() => setSelectedCard(null)} aria-label="关闭卡牌详情" className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1 text-white"><X className="h-4 w-4" /></button>
          <CardImage card={selectedCard} language={language} version={version} className="mx-auto mb-4 max-h-[55vh] w-auto rounded object-contain" />
          <h2 className="text-lg font-bold text-kards-text">{cardTitle(selectedCard, language)}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-kards-text-muted">{cardText(selectedCard, language)}</p>
          <dl className="mt-4 grid grid-cols-2 gap-2 border-t border-kards-border pt-4 text-sm"><dt>阵营</dt><dd>{factionLabel(selectedCard.json.faction)}</dd><dt>类型</dt><dd>{typeLabel(selectedCard.json.type)}</dd><dt>费用</dt><dd>{selectedCard.json.kredits ?? 0}</dd><dt>稀有度</dt><dd>{selectedCard.json.rarity || '—'}</dd><dt>扩展包</dt><dd>{String(selectedCard.json.set || '—')}</dd><dt>卡牌 ID</dt><dd>{selectedCard.importId}</dd><dt>状态</dt><dd>{selectedCard.reserved ? '预备卡' : '现役'}</dd></dl>
        </aside>
      )}
    </div>
  );
}
