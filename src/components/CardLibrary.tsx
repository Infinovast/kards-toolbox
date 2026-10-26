import { useMemo, useState, type ReactNode } from 'react';
import { Download, Search, X } from 'lucide-react';
import { CardFace } from './CardFace';
import { startImageDownload, useImageDownload } from '../lib/imageDownloads';
import { useDismissiblePanel } from '../lib/dialogKeyboard';
import { EMPTY_CARD_FILTERS, isGeneratedCard, matchesCardFilters, type CardFilters } from '../lib/cardFilters';
import CustomSelect from './CustomSelect';
import CardFilterSelects, { expansionOptions } from './CardFilterSelects';
import { cardKeywords, cardRelations } from '../lib/cardDetails';
import { HEADQUARTERS_STACKS, type HeadquartersAsset } from '../lib/cardAssets';
import ReservedBadge from './ReservedBadge';
import {
  CARD_LANGUAGES,
  cardText,
  cardTitle,
  cardDisplayTitle,
  isVeteranCard,
  factionLabel,
  typeLabel,
  type CardLanguage,
  type KardsCardRecord,
} from '../types/card';

const PAGE_SIZE = 36;
const CARD_TEXT_KEYWORDS = /情报(?:X|\d+)|被收缴|部署|亡计|伏击|免疫|动员|压制|奋战|守护|山地|情报|控制|流亡|烟幕|重甲|钳击|闪击|收缴|撤退|抑制|转换|抉择|冲击|协力|开发|战斗(?!机)|抽取|老兵|隐蔽|预报/gu;

function emphasizeCardText(text: string) {
  const result: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(CARD_TEXT_KEYWORDS)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push(text.slice(cursor, index));
    result.push(<strong key={`${index}-${match[0]}`} className="font-bold text-kards-text">{match[0]}</strong>);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return result;
}

export default function CardLibrary({ cards }: { cards: KardsCardRecord[] }) {
  const [filters, setFilters] = useState<CardFilters>({ ...EMPTY_CARD_FILTERS });
  const expansions = useMemo(() => [...new Set(cards.map((card) => card.json.set).filter(Boolean))].sort(), [cards]);
  const [language, setLanguage] = useState<CardLanguage>('zh-Hans');
  const [page, setPage] = useState(1);
  const [selectedCard, setSelectedCard] = useState<KardsCardRecord | null>(null);
  const [selectedHeadquarters, setSelectedHeadquarters] = useState<HeadquartersAsset | null>(null);
  const [expandedHeadquarters, setExpandedHeadquarters] = useState<string | null>(null);
  const download = useImageDownload();
  const closeDetails = () => { setSelectedCard(null); setSelectedHeadquarters(null); };
  const detailRef = useDismissiblePanel(!!selectedCard || !!selectedHeadquarters, closeDetails);
  const cardsByCardId = useMemo(() => new Map(cards.map(card => [card.cardId, card])), [cards]);
  const keywords = selectedCard ? cardKeywords(selectedCard, language) : [];
  const relations = selectedCard ? cardRelations(selectedCard) : [];

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
          <button onClick={resetFilters} className="px-2 py-2 text-sm text-kards-text-muted hover:text-kards-text">重置筛选</button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-kards-text-muted">
          <span>本地目录 {cards.length.toLocaleString()} 张 · 当前结果 {filteredCards.length.toLocaleString()} 张</span>
          <button disabled={!filteredCards.length || download.status === 'running' || download.status === 'paused'} onClick={() => {
            if (filteredCards.length > 100 && !window.confirm(`下载当前筛选的全部 ${filteredCards.length.toLocaleString()} 张卡图及缩略图（${language}）？已有缓存会跳过；切换页面后仍会继续下载。`)) return;
            startImageDownload(filteredCards, language);
          }} className="flex items-center gap-1 rounded border border-kards-border glass-panel px-3 py-2 text-kards-text disabled:opacity-40"><Download className="h-3.5 w-3.5" />缓存筛选结果（{filteredCards.length.toLocaleString()} 张）</button>
        </div>

        <div data-testid="library-grid" className="card-gallery custom-scrollbar min-h-0 flex-1 overflow-y-auto pb-2">
          {page === 1 && HEADQUARTERS_STACKS.map(stack => <button key={stack.id} type="button" aria-expanded={expandedHeadquarters === stack.id} aria-label={`${expandedHeadquarters === stack.id ? '收起' : '展开'}${stack.label}总部`} onClick={() => setExpandedHeadquarters(current => current === stack.id ? null : stack.id)} className="card-tile hq-stack-tile card-action group">
            <span className="hq-stack-art" aria-hidden="true">{stack.cards.map((headquarters, index) => <img key={headquarters.id} src={headquarters.image} alt="" style={{ transform: `translate(${index * 3}px, ${index * 2}px) rotate(${(index - (stack.cards.length - 1) / 2) * 1.4}deg)`, zIndex: index + 1 }} />)}</span>
          </button>)}
          {page === 1 && expandedHeadquarters && <div aria-label={`${HEADQUARTERS_STACKS.find(stack => stack.id === expandedHeadquarters)?.label || ''}总部卡牌`} className="col-span-full grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-3">
            {HEADQUARTERS_STACKS.find(stack => stack.id === expandedHeadquarters)?.cards.map(headquarters => <button key={headquarters.id} type="button" title={`${headquarters.name} · ${headquarters.nation}`} onClick={() => { setSelectedCard(null); setSelectedHeadquarters(headquarters); }} aria-label={`查看总部卡牌：${headquarters.name}`} className="hq-expanded-card card-action min-w-0">
              <img src={headquarters.image} alt="" className="hq-expanded-card-art" />
            </button>)}
          </div>}
          {pageCards.map((card) => (
            <button key={card.importId} onClick={() => setSelectedCard(card)} className="card-tile card-action group text-left" aria-label={`查看${cardDisplayTitle(card, language)}`}>
              <span className="library-card-art"><CardFace card={card} language={language} />{card.reserved && <ReservedBadge className="library-reserved-badge" />}</span>
              <div className="card-caption" title={cardDisplayTitle(card, language)}>{cardDisplayTitle(card, language)}</div>
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
          <button onClick={closeDetails} aria-label="关闭卡牌详情" className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1 text-white"><X className="h-4 w-4" /></button>
          <CardFace card={selectedCard} language={language} className="mx-auto mb-4 max-h-[55vh] w-full object-contain" />
          <h2 className="text-lg font-bold text-kards-text">{cardDisplayTitle(selectedCard, language)}</h2>
          {keywords.length > 0 && <p aria-label="卡牌关键词" className="mt-2 text-sm text-kards-status">{keywords.join(' · ')}</p>}
          {cardText(selectedCard, language) && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-kards-text-muted">{emphasizeCardText(cardText(selectedCard, language))}</p>}
          <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-kards-border pt-4 text-sm text-kards-text">
            <dt>阵营</dt><dd>{factionLabel(selectedCard.json.faction)}</dd><dt>类型</dt><dd>{typeLabel(selectedCard.json.type)}</dd>
            <dt>部署费用</dt><dd>{selectedCard.json.kredits ?? '—'} K</dd>
            {!['order', 'countermeasure'].includes(selectedCard.json.type || '') && <><dt>行动费用</dt><dd>{selectedCard.json.operationCost ?? '—'} K</dd><dt>攻击 / 生命</dt><dd>{selectedCard.json.attack ?? '—'} / {selectedCard.json.defense ?? '—'}</dd></>}
            <dt>稀有度</dt><dd>{({ Standard: '普通', Limited: '稀有', Special: '罕见', Elite: '精英' })[selectedCard.json.rarity || ''] || selectedCard.json.rarity || '—'}</dd>
            <dt>扩展包</dt><dd>{expansionOptions(expansions, language).find(option => option.value === selectedCard.json.set)?.label || selectedCard.json.set || '—'}</dd>
            <dt>状态</dt><dd>{[selectedCard.reserved ? '预备卡' : '现役', isVeteranCard(selectedCard) ? '老兵形态' : isGeneratedCard(selectedCard) ? '衍生卡' : '可构筑'].join(' · ')}</dd>
            <dt>永久卡池</dt><dd>{selectedCard.json.permanent_pool ? '是' : '否'}</dd><dt>卡组码编号</dt><dd>{selectedCard.importId}</dd>
            <dt>卡牌 ID</dt><dd className="break-all">{selectedCard.cardId}</dd>
          </dl>
          {relations.length > 0 && <section aria-label="关联卡牌" className="mt-4 border-t border-kards-border pt-4"><h3 className="text-sm font-bold text-kards-text">关联卡牌</h3><div className="mt-2 flex flex-wrap gap-2">
            {relations.map(({ cardId, label }) => { const related = cardsByCardId.get(cardId); return related
              ? <button key={`${label}:${cardId}`} title={`${label}：${cardDisplayTitle(related, language)}`} aria-label={`${label}：${cardDisplayTitle(related, language)}`} onClick={() => setSelectedCard(related)} className="w-[84px] rounded border border-kards-border bg-kards-input-bg p-1 hover:border-kards-gold"><CardFace card={related} language={language} className="w-full" /></button>
              : <p key={`${label}:${cardId}`} className="break-all text-xs text-kards-text-muted">{label}：{cardId}（本地缺少资料，请在设置中更新）</p>; })}
          </div></section>}
        </aside>
      )}
      {selectedHeadquarters && <aside ref={detailRef} role="dialog" aria-modal="false" aria-label="总部详情" tabIndex={-1} className="glass-panel custom-scrollbar absolute bottom-5 right-5 top-5 z-30 flex w-[300px] max-w-[calc(100%-40px)] flex-col overflow-y-auto rounded-lg border border-kards-border p-4 shadow-xl">
        <button onClick={closeDetails} aria-label="关闭总部详情" className="absolute right-3 top-3 z-10 rounded-full bg-black/60 p-1 text-white"><X className="h-4 w-4" /></button>
        <img src={selectedHeadquarters.image} alt={selectedHeadquarters.name} className="mx-auto mb-4 max-h-[55vh] w-full object-contain" />
        <h2 className="text-lg font-bold text-kards-text">{selectedHeadquarters.name}</h2>
        <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-kards-border pt-3 text-sm text-kards-text"><dt>阵营</dt><dd>{factionLabel(selectedHeadquarters.sourceFaction)}</dd><dt>总部图</dt><dd>{factionLabel(selectedHeadquarters.nation)}</dd><dt>稀有度</dt><dd>{selectedHeadquarters.rarity || '—'}</dd></dl>
        {selectedHeadquarters.brief && <p className="mt-3 text-sm leading-relaxed text-kards-text">{selectedHeadquarters.brief}</p>}
        {selectedHeadquarters.history && <section className="mt-4 border-t border-kards-border pt-3"><h3 className="text-sm font-bold text-kards-text">历史背景</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-kards-text-muted">{selectedHeadquarters.history}</p></section>}
      </aside>}
    </div>
  );
}
