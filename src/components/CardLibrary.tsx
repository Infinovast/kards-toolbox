import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Download, Search, X } from 'lucide-react';
import { CardFace } from './CardFace';
import { cardFactionIcon, SET_ICONS } from '../lib/assetCatalog';
import { startImageDownload, useImageDownload } from '../lib/imageDownloads';
import { useDismissiblePanel } from '../lib/dialogKeyboard';
import { CARD_SEARCH_HINT, EMPTY_CARD_FILTERS, hasCardFilterConditions, matchesCardFilters, type CardFilters } from '../lib/cardFilters';
import { CARD_SORT_OPTIONS, sortCards, type CardSortDirection, type CardSortKey } from '../lib/cardSort';
import PageIndicator from './PageIndicator';
import CardDetailModal from './CardDetailModal';
import { captureCardDetailOrigin, type CardDetailOrigin } from '../lib/cardDetailOrigin';
import useCardPoolLayout from '../lib/useCardPoolLayout';
import { CardText } from './CardText';
import CardFilterSelects, { CardStatusSelect, CostFilterButtons, expansionLabel, FilterIcon } from './CardFilterSelects';
import { cardRelations, cardStatusLabel } from '../lib/cardDetails';
import CardKeywordList from './CardKeywordList';
import CardRarity from './CardRarity';
import CardSubtypeInfo from './CardSubtypeInfo';
import { HEADQUARTERS_STACKS, type HeadquartersAsset } from '../lib/cardAssets';
import ReservedBadge from './ReservedBadge';
import CustomSelect from './CustomSelect';
import SearchClearButton from './SearchClearButton';
import { revealDetailItem, type CardDetailItem } from '../lib/cardDetailPaging';
import useCardDetailPaging from '../lib/useCardDetailPaging';
import { CARD_LANGUAGES, type CardLanguage } from '../types/card';
import {
  cardText,
  cardTitle,
  cardDisplayTitle,
  factionLabel,
  typeLabel,
  type KardsCardRecord,
} from '../types/card';

export default function CardLibrary({ cards, detailMode, onDetailModeChange }: {
  cards: KardsCardRecord[];
  detailMode: 'modal' | 'sidebar';
  onDetailModeChange: (mode: 'modal' | 'sidebar') => void;
}) {
  const [filters, setFilters] = useState<CardFilters>({ ...EMPTY_CARD_FILTERS });
  const expansions = useMemo(() => [...new Set(cards.map((card) => card.json.set).filter(Boolean))].sort(), [cards]);
  const [language, setLanguage] = useState<CardLanguage>('zh-Hans');
  const [sortKey, setSortKey] = useState<CardSortKey>('kredits');
  const [sortDirection, setSortDirection] = useState<CardSortDirection>('asc');
  const [page, setPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<KardsCardRecord | null>(null);
  const [selectedHeadquarters, setSelectedHeadquarters] = useState<HeadquartersAsset | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<CardDetailOrigin | undefined>();
  const [expandedHeadquarters, setExpandedHeadquarters] = useState<string | null>(null);
  const headquartersDialogRef = useRef<HTMLElement>(null);
  const download = useImageDownload();
  const closeDetails = () => { setSelectedCard(null); setSelectedHeadquarters(null); };
  const detailRef = useDismissiblePanel(detailMode === 'sidebar' && (!!selectedCard || !!selectedHeadquarters), closeDetails);
  const cardsByCardId = useMemo(() => new Map(cards.map(card => [card.cardId, card])), [cards]);
  const relations = selectedCard ? cardRelations(selectedCard) : [];

  const filteredCards = useMemo(() => sortCards(cards.filter(card => matchesCardFilters(card, filters)), sortKey, sortDirection), [cards, filters, sortKey, sortDirection]);
  const searchAlternatives = useMemo(() => {
    if (filteredCards.length > 3 || !filters.query.trim() || !hasCardFilterConditions(filters)) return { queryOnly: 0, filtersOnly: 0 };
    const queryOnly = { ...EMPTY_CARD_FILTERS, query: filters.query };
    const filtersOnly = { ...filters, query: '' };
    return {
      queryOnly: cards.filter(card => matchesCardFilters(card, queryOnly)).length,
      filtersOnly: cards.filter(card => matchesCardFilters(card, filtersOnly)).length,
    };
  }, [cards, filteredCards.length, filters]);
  const visibleHeadquartersStacks = useMemo(() => {
    if (filters.query.trim() || filters.cardType.length || filters.subtypes.length || filters.keywords.length || filters.cost.length || filters.rarity.length
      || filters.expansion !== 'All' || filters.status.length) return [];
    const factions = filters.factions.map(faction => faction.toLowerCase());
    return HEADQUARTERS_STACKS.filter(stack => !factions.length
      || factions.includes(stack.id === 'Common' ? 'neutral' : stack.nation.toLowerCase()));
  }, [filters]);
  const expandedStack = visibleHeadquartersStacks.find(stack => stack.id === expandedHeadquarters);
  const poolItems = useMemo(() => [
    ...visibleHeadquartersStacks.map(stack => ({ kind: 'headquarters' as const, stack })),
    ...filteredCards.map(card => ({ kind: 'card' as const, card })),
  ], [visibleHeadquartersStacks, filteredCards]);
  const pool = useCardPoolLayout('library', poolItems.length, page, setPage);
  const pageItems = poolItems.slice(pool.start, pool.end);
  const detailSequence: CardDetailItem[] = useMemo(() => expandedStack
    ? expandedStack.cards.map(headquarters => ({ headquarters }))
    : poolItems.flatMap<CardDetailItem>(item => item.kind === 'card' ? [{ card: item.card }] : item.stack.cards.map(headquarters => ({ headquarters }))), [expandedStack, poolItems]);
  const revealSource = async (item: CardDetailItem) => {
    const index = poolItems.findIndex(entry => item.card ? entry.kind === 'card' && entry.card.cardId === item.card.cardId
      : entry.kind === 'headquarters' && entry.stack.cards.some(hq => hq.id === item.headquarters.id));
    if (index >= 0) setPage(Math.floor(index / pool.capacity) + 1);
    return revealDetailItem(item, 'pool', expandedStack && item.headquarters ? headquartersDialogRef.current : pool.ref.current);
  };
  useCardDetailPaging({
    ref: detailRef, enabled: detailMode === 'sidebar' && !!(selectedCard || selectedHeadquarters), items: detailSequence,
    item: selectedCard ? { card: selectedCard } : selectedHeadquarters ? { headquarters: selectedHeadquarters } : undefined, mode: 'sidebar',
    onSelect: item => { setSelectedCard(item.card || null); setSelectedHeadquarters(item.headquarters || null); },
    onReveal: revealSource,
  });

  useEffect(() => {
    if (!expandedStack) return;
    const previous = document.activeElement;
    const panel = headquartersDialogRef.current;
    panel?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== 'Escape'
        || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault(); event.stopPropagation();
      setExpandedHeadquarters(null);
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if ((document.activeElement === document.body || (document.activeElement && panel?.contains(document.activeElement)))
        && previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, [expandedStack]);

  const selectFilter = (value: CardFilters) => {
    setFilters(value);
    setPage(1);
    setExpandedHeadquarters(null);
  };
  const resetFilters = () => { setFilters({ ...EMPTY_CARD_FILTERS }); setSortKey('kredits'); setSortDirection('asc'); setPage(1); setExpandedHeadquarters(null); };
  const searchHint = <div role="status" className="library-empty-content glass-panel">
    <h2 className="library-empty-title">{filteredCards.length ? '当前条件下搜索+筛选结果较少' : '当前条件下搜索+筛选无结果'}</h2>
    {searchAlternatives.queryOnly > 0 && <button type="button" className="library-global-search" onClick={() => selectFilter({ ...EMPTY_CARD_FILTERS, query: filters.query })}>
      单独搜索找到了 <strong>{searchAlternatives.queryOnly.toLocaleString()}</strong> 个结果，<span className="underline underline-offset-4">点击查看</span>
    </button>}
    {searchAlternatives.filtersOnly > 0 && <button type="button" className="library-global-search" onClick={() => selectFilter({ ...filters, query: '' })}>
      单独筛选找到了 <strong>{searchAlternatives.filtersOnly.toLocaleString()}</strong> 个结果，<span className="underline underline-offset-4">点击查看</span>
    </button>}
  </div>;

  return (
    <div onKeyDown={event => {
      if (event.defaultPrevented || event.nativeEvent.isComposing || event.key !== 'Escape' || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (selectedCard || selectedHeadquarters) { event.preventDefault(); closeDetails(); }
      else if (expandedStack) { event.preventDefault(); setExpandedHeadquarters(null); }
      else if ((event.target as HTMLElement).tagName !== 'SELECT') { event.preventDefault(); resetFilters(); }
    }} className="relative flex h-full min-h-0 gap-4 p-5">
      <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden">
        <div className="builder-filter-bar library-filter-bar glass-panel custom-scrollbar">
          <CardStatusSelect value={filters.status} onChange={status => selectFilter({ ...filters, status })} />
          <CostFilterButtons value={filters.cost} onChange={cost => selectFilter({ ...filters, cost })} />
          <CardFilterSelects filters={filters} onChange={selectFilter} expansions={expansions} language={language} />
          <button onClick={resetFilters} className="shrink-0 whitespace-nowrap px-2 py-2 text-sm text-kards-text-muted hover:text-kards-text">重置筛选</button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-kards-text-muted">
          <div className="library-search-controls">
            <div className="library-search relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kards-text-muted" />
              <input title={CARD_SEARCH_HINT} aria-label="搜索卡牌" value={filters.query} onChange={(event) => selectFilter({ ...filters, query: event.target.value })} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.closest('section')?.querySelector<HTMLButtonElement>('[data-testid="library-grid"] button')?.focus(); } }} placeholder="名称、描述、词条..." className="w-full rounded border border-kards-border bg-kards-input-bg py-2 pl-9 pr-9 text-sm text-kards-text outline-none focus:border-kards-gold" />
              <SearchClearButton label="清除卡牌搜索" value={filters.query} onClear={() => selectFilter({ ...filters, query: '' })} />
            </div>
            <div role="group" aria-label="卡牌排序" className="library-sort-controls">
              <CustomSelect label="卡牌排序依据" value={sortKey} onChange={value => { setSortKey(value as CardSortKey); setPage(1); }} options={[...CARD_SORT_OPTIONS]} />
              <button type="button" className="library-sort-direction" aria-label={`排序方向：${sortDirection === 'asc' ? '升序' : '降序'}`} aria-pressed={sortDirection === 'desc'} title={sortDirection === 'asc' ? '升序，点击切换降序' : '降序，点击切换升序'} onClick={() => { setSortDirection(value => value === 'asc' ? 'desc' : 'asc'); setPage(1); }}>
                {sortKey === 'nameZh' || sortKey === 'nameEn' ? <span>{sortDirection === 'asc' ? 'A-Z' : 'Z-A'}</span> : sortDirection === 'asc' ? <ArrowUp aria-hidden="true" className="h-4 w-4" /> : <ArrowDown aria-hidden="true" className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="library-result-count">找到 <strong>{filteredCards.length.toLocaleString()}</strong> 张</span>
            <button disabled={!filteredCards.length || download.status === 'running' || download.status === 'paused'} onClick={() => {
              if (filteredCards.length > 100 && !window.confirm(`缓存当前筛选的 ${filteredCards.length.toLocaleString()} 张卡牌大图+缩略图？`)) return;
              startImageDownload(filteredCards);
            }} className="flex h-9 items-center gap-1 rounded border border-kards-border glass-panel px-3 py-2 text-kards-text disabled:opacity-40"><Download className="h-3.5 w-3.5" />缓存卡牌图片（{filteredCards.length.toLocaleString()}）</button>
            <CustomSelect label="卡牌文字语言" value={language} onChange={value => setLanguage(value as CardLanguage)} options={CARD_LANGUAGES.map(item => ({ value: item.id, label: item.label }))} />
            <button type="button" aria-pressed={detailMode === 'modal'} onClick={() => onDetailModeChange(detailMode === 'modal' ? 'sidebar' : 'modal')} className="builder-reserved-toggle">卡牌详情：{detailMode === 'modal' ? '浮窗' : '侧栏'}</button>
          </div>
        </div>

        <div ref={pool.ref} style={pool.style} data-testid="library-grid" data-capacity={pool.capacity} className="card-gallery card-gallery-library relative min-h-0 flex-1">
          {pageItems.map(item => {
            if (item.kind === 'headquarters') return <button key={item.stack.id} type="button" aria-haspopup="dialog" aria-expanded={expandedHeadquarters === item.stack.id} aria-label={`展开${item.stack.label}总部`} onClick={() => setExpandedHeadquarters(item.stack.id)} className="card-tile hq-stack-tile card-action group">
              <span className="hq-stack-art" aria-hidden="true">{item.stack.cards.map((headquarters, index) => {
                const offset = index - (item.stack.cards.length - 1) / 2;
                return <img key={headquarters.id} data-detail-source={`hq:${headquarters.id}`} src={headquarters.image} alt="" style={{ transform: `translateX(${offset * 3}px) rotate(${offset * 1.4}deg)`, zIndex: index + 1 }} />;
              })}</span>
            </button>;
            const { card } = item;
            return <button key={card.importId} data-detail-source={card.cardId} onClick={event => { setDetailOrigin(captureCardDetailOrigin(event.currentTarget, 'pool')); setSelectedHeadquarters(null); setSelectedCard(card); }} className="card-tile card-action group text-left" title={cardDisplayTitle(card, language)} aria-label={`查看${cardDisplayTitle(card, language)}`}>
              <span className="library-card-art"><CardFace card={card} />{card.reserved && <ReservedBadge className="library-reserved-badge" />}</span>
            </button>;
          })}
          {(!poolItems.length || (filteredCards.length <= 3 && filters.query.trim())) && <div className={`library-empty-results text-kards-text-muted ${poolItems.length ? 'has-results' : ''}`}>
            {searchHint}
          </div>}
        </div>

        <PageIndicator page={pool.page} pageCount={pool.pageCount} onChange={setPage} />
      </section>

      {expandedStack && <div className="absolute inset-0 z-20 flex items-center justify-center p-5">
        <div onClick={() => setExpandedHeadquarters(null)} className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm" />
        <section ref={headquartersDialogRef} role="dialog" aria-modal="false" aria-label={expandedStack.label + '总部卡牌'} tabIndex={-1}
          className="headquarters-gallery-dialog glass-panel relative flex w-full max-w-4xl flex-col rounded-lg border border-kards-border p-5 shadow-2xl">
          <div className="mb-4 flex shrink-0 items-center justify-between gap-3 border-b border-kards-border pb-3">
            <h2 className="text-lg font-bold text-kards-text">{expandedStack.label}总部</h2>
            <button onClick={() => setExpandedHeadquarters(null)} aria-label="关闭总部卡牌" className="rounded p-1 text-kards-text-muted hover:text-kards-text"><X className="h-5 w-5" /></button>
          </div>
          <div className="custom-scrollbar grid min-h-0 grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3 overflow-y-auto">
            {expandedStack.cards.map(headquarters => <button key={headquarters.id} data-detail-source={`hq:${headquarters.id}`} type="button" title={headquarters.name}
              onClick={event => { setDetailOrigin(captureCardDetailOrigin(event.currentTarget, 'pool')); setSelectedCard(null); setSelectedHeadquarters(headquarters); }}
              aria-label={'查看总部卡牌：' + headquarters.name} className="hq-expanded-card card-action min-w-0">
              <img src={headquarters.image} alt="" className="card-face hq-expanded-card-art" />
            </button>)}
          </div>
        </section>
      </div>}

      {detailMode === 'sidebar' && (selectedCard || selectedHeadquarters) && (
        <aside ref={detailRef} role="dialog" aria-modal="false" aria-label={selectedCard ? '卡牌详情' : '总部详情'} tabIndex={-1} className="glass-panel custom-scrollbar absolute bottom-5 right-5 top-5 z-30 flex w-[300px] max-w-[calc(100%-40px)] flex-col overflow-y-auto rounded-lg border border-kards-border p-4 shadow-xl">
          <button onClick={closeDetails} aria-label="关闭卡牌详情" className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1 text-white"><X className="h-4 w-4" /></button>
          <div className="detail-sidebar-content">
            {selectedCard && <>
              <CardFace card={selectedCard} className="mx-auto mb-4 max-h-[55vh] w-full object-contain" />
              <h2 className="text-lg font-bold text-kards-text">{cardDisplayTitle(selectedCard, language)}</h2>
              {language.startsWith('zh') && selectedCard.json.title?.['en-EN'] && <p className="mt-1 text-xs text-kards-text-muted" lang="en">{selectedCard.json.title['en-EN']}</p>}
              <CardKeywordList card={selectedCard} language={language} className="mt-2 text-sm text-kards-text" />
              {cardText(selectedCard, language) && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-kards-text-muted"><CardText text={cardText(selectedCard, language)} /></p>}
              <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-kards-border pt-4 text-sm text-kards-text">
                <dt>阵营</dt><dd className="flex items-center gap-2"><img src={cardFactionIcon(selectedCard.json.faction, selectedCard.json.type)} alt="" className="h-5 w-5 object-contain" />{factionLabel(selectedCard.json.faction)}</dd><dt>类型</dt><dd>{typeLabel(selectedCard.json.type)}</dd>
                <CardSubtypeInfo cardId={selectedCard.cardId} language={language} />
                <dt>部署费用</dt><dd>{selectedCard.json.kredits ?? '—'} K</dd>
                {!['order', 'countermeasure'].includes(selectedCard.json.type || '') && <><dt>行动费用</dt><dd>{selectedCard.json.operationCost ?? '—'} K</dd><dt>攻击 / 生命</dt><dd>{selectedCard.json.attack ?? '—'} / {selectedCard.json.defense ?? '—'}</dd></>}
                <dt>稀有度</dt><dd><CardRarity rarity={selectedCard.json.rarity} faction={selectedCard.json.faction} /></dd>
                <dt>状态</dt><dd>{cardStatusLabel(selectedCard)}</dd>
                {selectedCard.json.set && selectedCard.json.set !== 'OnlySpawnable' && <><dt>扩展包</dt><dd className="flex items-center gap-1"><span className="h-5 w-5 shrink-0"><FilterIcon src={SET_ICONS[selectedCard.json.set] || SET_ICONS.All} /></span>{expansionLabel(selectedCard.json.set, language)}</dd></>}
                <dt>常备卡池</dt><dd>{selectedCard.json.permanent_pool ? '是' : '否'}</dd><dt>卡组码 ID</dt><dd>{selectedCard.importId}</dd>
                <dt>卡牌 ID</dt><dd className="break-all">{selectedCard.cardId}</dd>
              </dl>
              {relations.length > 0 && <section aria-label="关联卡牌" className="mt-4 border-t border-kards-border pt-4"><h3 className="text-sm font-bold text-kards-text">关联卡牌</h3><div className="mt-2 flex flex-wrap gap-2">
                {relations.map(({ cardId, label }) => {
                  const related = cardsByCardId.get(cardId); return related
                    ? <button key={`${label}:${cardId}`} title={`${label}：${cardDisplayTitle(related, language)}`} aria-label={`${label}：${cardDisplayTitle(related, language)}`} onClick={() => setSelectedCard(related)} className="w-[84px] rounded border border-kards-border bg-kards-input-bg p-1 hover:border-kards-gold"><CardFace card={related} className="w-full" /></button>
                    : <p key={`${label}:${cardId}`} className="break-all text-xs text-kards-text-muted">{label}：{cardId}（本地缺少资料，请在设置中更新）</p>;
                })}
              </div></section>}
            </>}
            {selectedHeadquarters && <>
              <img src={selectedHeadquarters.image} alt={selectedHeadquarters.name} className="mx-auto mb-4 max-h-[55vh] w-full object-contain" />
              <h2 className="text-lg font-bold text-kards-text">{selectedHeadquarters.name}</h2>
              <p className="mt-1 text-xs text-kards-text-muted" lang="en">{selectedHeadquarters.englishName}</p>
              <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-kards-border pt-3 text-sm text-kards-text"><dt>阵营</dt><dd>{factionLabel(selectedHeadquarters.sourceFaction)}</dd><dt>总部图</dt><dd>{factionLabel(selectedHeadquarters.nation)}</dd><dt>稀有度</dt><dd><CardRarity rarity={selectedHeadquarters.rarity === '普通' ? 'Standard' : selectedHeadquarters.rarity} faction={selectedHeadquarters.nation} /></dd></dl>
              {selectedHeadquarters.brief && <p className="mt-3 text-sm leading-relaxed text-kards-text">{selectedHeadquarters.brief}</p>}
              {selectedHeadquarters.history && <section className="mt-4 border-t border-kards-border pt-3"><h3 className="text-sm font-bold text-kards-text">历史背景</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-kards-text-muted">{selectedHeadquarters.history}</p></section>}
            </>}
          </div>
        </aside>)}
      {detailMode === 'modal' && (selectedCard || selectedHeadquarters) && <CardDetailModal card={selectedCard || undefined} headquarters={selectedHeadquarters || undefined} origin={detailOrigin} cards={cards} sequence={detailSequence} onNavigate={revealSource} language={language} onClose={closeDetails} />}
    </div>
  );
}
