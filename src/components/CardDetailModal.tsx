import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Shield, X } from 'lucide-react';
import { CardFace } from './CardFace';
import { expansionLabel, FilterIcon } from './CardFilterSelects';
import { cardRelations, cardStatusLabel } from '../lib/cardDetails';
import { handleDialogKeys } from '../lib/dialogKeyboard';
import { cardDisplayTitle, cardText, typeLabel, type CardLanguage, type KardsCardRecord } from '../types/card';
import ReservedBadge from './ReservedBadge';
import { CardText } from './CardText';
import type { HeadquartersAsset } from '../lib/cardAssets';
import { captureCardDetailOrigin, type CardDetailOrigin } from '../lib/cardDetailOrigin';
import { SET_ICONS, TYPE_ICONS } from '../lib/assetCatalog';
import CardNationality from './CardNationality';
import CardKeywordList from './CardKeywordList';
import CardRarity from './CardRarity';
import CardSubtypeInfo from './CardSubtypeInfo';
import CardBrowsingTip from './CardBrowsingTip';
import { cardKeywordItems } from '../lib/cardKeywords';
import { isGeneratedCard } from '../lib/cardFilters';
import type { CardDetailItem } from '../lib/cardDetailPaging';
import useCardDetailPaging from '../lib/useCardDetailPaging';

export default function CardDetailModal({ card: initialCard, headquarters: initialHeadquarters, origin, cards, sequence = [], onNavigate, language = 'zh-Hans', onClose, onSourceDoubleClick }: {
  card?: KardsCardRecord;
  headquarters?: HeadquartersAsset;
  origin?: CardDetailOrigin;
  cards: KardsCardRecord[];
  sequence?: CardDetailItem[];
  onNavigate?: (item: CardDetailItem) => Promise<CardDetailOrigin | undefined>;
  language?: CardLanguage;
  onClose: () => void;
  onSourceDoubleClick?: () => void;
}) {
  const [card, setCard] = useState<KardsCardRecord | null>(initialCard || null);
  const [headquarters, setHeadquarters] = useState(initialHeadquarters);
  const overlay = useRef<HTMLDivElement>(null);
  const currentOrigin = useRef(origin);
  const panel = useRef<HTMLElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const entrance = useRef<Animation | null>(null);
  const exit = useRef<Animation | null>(null);
  const backdropExit = useRef<Animation | null>(null);
  const closing = useRef(false);
  const requestCloseRef = useRef<() => void>(() => {});
  const [isClosing, setIsClosing] = useState(false);
  const [arrived, setArrived] = useState(!origin);
  const close = useRef(onClose);
  close.current = onClose;
  const repeatSource = useRef(onSourceDoubleClick);
  repeatSource.current = onSourceDoubleClick;
  useEffect(() => {
    const activation = origin?.activation;
    if (!activation || !onSourceDoubleClick) return;
    // The modal covers the source immediately. Recognize the second click at
    // the original pointer position without delaying the first-click animation.
    const repeat = (event: MouseEvent) => {
      if (closing.current || event.button !== 0 || event.timeStamp - activation.time > 500
        || Math.abs(event.clientX - activation.x) > 5 || Math.abs(event.clientY - activation.y) > 5) return;
      event.preventDefault(); event.stopImmediatePropagation();
      closing.current = true;
      repeatSource.current?.();
      close.current();
    };
    document.addEventListener('click', repeat, true);
    return () => document.removeEventListener('click', repeat, true);
  }, [origin, !!onSourceDoubleClick]);
  const cancelPaging = useCardDetailPaging({ ref: overlay, enabled: true, ready: arrived && !isClosing, items: sequence,
    item: card ? { card } : headquarters ? { headquarters } : undefined, mode: 'modal',
    onSelect: item => { setCard(item.card || null); setHeadquarters(item.headquarters); },
    onReveal: async item => { currentOrigin.current = await onNavigate?.(item); },
    onMoving: moving => { entrance.current?.cancel(); setArrived(!moving); },
  });
  useEffect(() => { setCard(initialCard || null); setHeadquarters(initialHeadquarters); currentOrigin.current = origin; }, [initialCard, initialHeadquarters]);
  useLayoutEffect(() => {
    const element = art.current;
    if (!element || !origin || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setArrived(true);
      return;
    }
    const target = element.getBoundingClientRect();
    if (!target.width || !target.height) { setArrived(true); return; }
    setArrived(false);
    const x = origin.left + origin.width / 2 - target.left - target.width / 2;
    const y = origin.top + origin.height / 2 - target.top - target.height / 2;
    const animation = element.animate([
      { transform: `translate(${x}px, ${y}px) scale(${origin.width / target.width}, ${origin.height / target.height})`, opacity: origin.kind === 'strip' ? 0 : 1 },
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
    ], { duration: origin.kind === 'strip' ? 380 : 340, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'both' });
    entrance.current = animation;
    animation.onfinish = () => { if (!closing.current) setArrived(true); animation.cancel(); };
    // Finish cleanly when the destination changes while the card is moving.
    const finish = () => { if (!closing.current) animation.finish(); };
    window.addEventListener('resize', finish);
    return () => { window.removeEventListener('resize', finish); animation.onfinish = null; animation.cancel(); };
  }, [origin]);
  const requestClose = () => {
    if (closing.current) return;
    closing.current = true;
    setIsClosing(true);
    const element = art.current;
    if (!element) { close.current(); return; }
    const current = getComputedStyle(element);
    const from = { transform: current.transform, opacity: current.opacity };
    cancelPaging();
    entrance.current?.cancel();
    const target = element.getBoundingClientRect();
    const source = currentOrigin.current;
    const destination = source?.element?.isConnected ? captureCardDetailOrigin(source.element, source.kind, source.image) : source;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const transform = destination && !reduced
      ? `translate(${destination.left + destination.width / 2 - target.left - target.width / 2}px, ${destination.top + destination.height / 2 - target.top - target.height / 2}px) scale(${destination.width / target.width}, ${destination.height / target.height})`
      : 'none';
    const duration = reduced ? 80 : 260;
    exit.current = element.animate([from, { transform, opacity: destination?.kind === 'pool' && !reduced ? 1 : 0 }],
      { duration, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'both' });
    backdropExit.current = backdrop.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration, fill: 'both' }) || null;
    exit.current.onfinish = () => close.current();
  };
  requestCloseRef.current = requestClose;
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus({ preventScroll: true });
    window.dispatchEvent(new CustomEvent('kards-deck-card-preview', { detail: null }));
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      requestCloseRef.current();
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      exit.current?.cancel(); backdropExit.current?.cancel();
      const source = currentOrigin.current?.element;
      const focusTarget = source?.closest<HTMLElement>('button, [tabindex="0"]') || previous;
      if (focusTarget instanceof HTMLElement && focusTarget.isConnected) focusTarget.focus({ preventScroll: true });
    };
  }, []);
  const cardsById = useMemo(() => new Map(cards.map(item => [item.cardId, item])), [cards]);
  const keywords = card ? cardKeywordItems(card, language) : [];
  const relatedCards = (card ? cardRelations(card) : []).flatMap(relation => {
    const related = cardsById.get(relation.cardId);
    return related ? [{ ...relation, card: related }] : [];
  });
  if (!card && !headquarters) return null;
  const title = card ? cardDisplayTitle(card, language) : headquarters!.name;
  const englishName = card ? language.startsWith('zh') ? card.json.title?.['en-EN'] : undefined : headquarters!.englishName;
  const type = (card?.json.type || '').toLowerCase();
  const isUnit = !['order', 'countermeasure'].includes(type);
  const setName = card ? expansionLabel(card.json.set, language) : '';
  const faction = card?.json.faction || (headquarters?.nation === 'Blank' ? 'Neutral' : headquarters?.nation) || 'Neutral';
  return createPortal(<div ref={overlay} className="card-detail-overlay" data-phase={isClosing ? 'closing' : arrived ? 'ready' : 'moving'} data-origin={origin?.kind}>
    <div ref={backdrop} className="card-detail-backdrop" onClick={requestClose} />
    <section ref={panel} role="dialog" aria-modal="true" aria-label={'卡牌详情：' + title}
      tabIndex={-1} onKeyDown={event => {
        if ((!arrived || isClosing) && event.key === 'Tab') {
          event.preventDefault();
          panel.current?.focus({ preventScroll: true });
        } else handleDialogKeys(event);
      }} onClick={event => {
        if (!(event.target as HTMLElement).closest('.card-detail-panel, .card-detail-art, .card-detail-close, .card-browsing-tip')) requestClose();
      }} className="card-detail-dialog custom-scrollbar">
      <button data-dialog-cancel aria-label="关闭卡牌详情" disabled={!arrived || isClosing} onClick={requestClose} className="card-detail-close"><X className="h-5 w-5" /></button>
      <div className="card-detail-layout">
        <aside inert={!arrived || isClosing} className="card-detail-panel custom-scrollbar">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className="flex shrink-0 items-center gap-3 text-lg font-bold"><span className="h-7 w-7">{card ? <FilterIcon src={TYPE_ICONS[type]} /> : <Shield className="h-7 w-7" />}</span>{card ? typeLabel(type) : '总部'}</h2>
            <CardNationality faction={faction} exile={card?.json.exile} type={type} className="ml-auto" />
          </div>
          {keywords.length > 0 && <section className="card-detail-section">
            <h3 className="mb-3 font-bold">词条</h3>
            <CardKeywordList card={card!} language={language} className="text-sm leading-7 text-kards-text" />
          </section>}
          {card ? <dl className="card-detail-section grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
            <CardSubtypeInfo cardId={card.cardId} language={language} />
            {!isGeneratedCard(card) && <><dt className="self-center">稀有度</dt><dd className="flex items-center"><CardRarity rarity={card.json.rarity} faction={faction} previewEnabled={arrived && !isClosing} /></dd></>}
            <dt>状态</dt><dd className="flex items-center gap-2">{card.reserved && <ReservedBadge />}{cardStatusLabel(card)}</dd>
            <dt>卡池</dt><dd>{card.json.permanent_pool ? '常备卡池' : '轮换卡池'}</dd>
          </dl> : <dl className="card-detail-section grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 text-sm"><dt>稀有度</dt><dd>{headquarters?.rarity || '普通'}</dd></dl>}
        </aside>
        <div ref={art} className="card-detail-art">{card ? <CardFace card={card} initialSource={card === initialCard ? origin?.image : undefined} /> : <img src={headquarters!.image} alt={title} className="card-face" />}
          <CardBrowsingTip className="card-detail-tip" />
        </div>
        <div inert={!arrived || isClosing} className="card-detail-panel custom-scrollbar">
          <h1 className="text-2xl font-bold">{title}</h1>
          {englishName && <p className="mt-1 text-xs text-kards-text-muted" lang="en">{englishName}</p>}
          {card && cardText(card, language) && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-kards-text"><CardText text={cardText(card, language)} /></p>}
          {card && <dl className="card-detail-section grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
            <dt>部署费用</dt><dd>{card.json.kredits ?? '—'} K</dd>
            {isUnit && <><dt>行动费用</dt><dd>{card.json.operationCost ?? '—'} K</dd><dt>攻击 / 生命</dt><dd>{card.json.attack ?? '—'} / {card.json.defense ?? '—'}</dd></>}
            {card.json.set && card.json.set !== 'OnlySpawnable' && <><dt>扩展包</dt><dd className="flex items-center gap-1"><span className="h-5 w-5 shrink-0"><FilterIcon src={SET_ICONS[card.json.set] || SET_ICONS.All} /></span>{setName}</dd></>}
            <dt>卡组码 ID</dt><dd>{card.importId}</dd>
            <dt>卡牌 ID</dt><dd className="break-all">{card.cardId}</dd>
          </dl>}
          {!card && headquarters?.brief && <p className="mt-4 text-sm leading-7">{headquarters.brief}</p>}
          {!card && headquarters?.history && <section className="card-detail-section"><h3 className="mb-3 font-bold">历史背景</h3><p className="whitespace-pre-wrap text-sm leading-7">{headquarters.history}</p></section>}
          {relatedCards.length > 0 && <section className="card-detail-section">
            <h3 className="mb-3 font-bold">关联卡牌</h3>
            <div className="flex flex-wrap gap-3">{relatedCards.map(related => <button key={related.label + related.cardId} type="button"
              title={related.label + '：' + cardDisplayTitle(related.card, language)} aria-label={related.label + '：' + cardDisplayTitle(related.card, language)}
              onClick={() => { setCard(related.card); setHeadquarters(undefined); currentOrigin.current = undefined; }} className="card-action w-[86px]"><CardFace card={related.card} /></button>)}</div>
          </section>}
        </div>
      </div>
    </section>
  </div>, document.body);
}
