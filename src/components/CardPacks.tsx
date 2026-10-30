import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, Flag, Info, Layers3, RotateCcw } from 'lucide-react';
import { CARD_PACKS, SET_ICONS, WILDCARDS, factionIcon, type CardPackAsset, type CardPackKind } from '../lib/assetCatalog';
import { defaultCardBackForNation } from '../lib/cardAssets';
import { cardPackPool, drawCardPack, PACK_FLIP_TIMINGS, PACK_RULES } from '../lib/cardPacks';
import { captureCardDetailOrigin, type CardDetailOrigin } from '../lib/cardDetailOrigin';
import { revealDetailItem } from '../lib/cardDetailPaging';
import { CARD_RARITIES, cardDisplayTitle, type KardsCardRecord } from '../types/card';
import { CardFace, RARITY_SLOTS } from './CardFace';
import CardDetailModal from './CardDetailModal';
import { FilterIcon } from './CardFilterSelects';
import './cardPacks.css';

const RARITY_LABELS = { Standard: '普通', Limited: '限定', Special: '特殊', Elite: '精英' };

function PackSourceIcon({ pack }: { pack: CardPackAsset }) {
  const [index, setIndex] = useState(0);
  const container = useRef<HTMLSpanElement>(null);
  const nations = pack.nations || [];
  useEffect(() => {
    if (nations.length < 2) return;
    const timer = window.setInterval(() => {
      const rect = container.current?.getBoundingClientRect();
      if (!document.hidden && rect && rect.bottom > 0 && rect.top < innerHeight) setIndex(value => (value + 1) % nations.length);
    }, 2000);
    return () => clearInterval(timer);
  }, [nations.length]);
  const src = pack.category === 'expansion' ? SET_ICONS[pack.set || ''] : factionIcon(nations[index % nations.length], 'white');
  return <span ref={container} className="pack-source-icon" aria-hidden="true"><span key={src} className="pack-source-icon-entry"><FilterIcon src={src || SET_ICONS.All} /></span></span>;
}

function PackInfo({ pack, kind }: { pack: CardPackAsset; kind: CardPackKind }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const label = kind === 'standard' ? '标准包' : '军官包';
  const content = pack.category === 'expansion' && pack.source !== 'Core' ? `${pack.name}套装` : pack.name;
  return <span className="pack-info" onPointerEnter={() => setVisible(true)} onPointerLeave={() => setVisible(false)}>
    <button type="button" className="pack-info-button" aria-label={`${label}说明`} aria-describedby={visible ? id : undefined}
      onFocus={() => setVisible(true)} onBlur={() => setVisible(false)} onClick={() => setVisible(value => !value)}
      onKeyDown={event => { if (event.key === 'Escape' && visible) { event.preventDefault(); event.stopPropagation(); setVisible(false); } }}><Info className="h-4 w-4" /></button>
    <span id={id} role="tooltip" hidden={!visible} className="pack-info-tooltip">
      <strong>每个卡包内含：</strong>
      <span role="list" className="pack-info-list"><span role="listitem">{kind === 'standard' ? 5 : 7}张{content}卡牌</span>
        <span role="listitem">{kind === 'standard' ? '至少1张限定或更高稀有度卡牌' : '至少1张特殊或精英卡牌'}</span>
        {kind === 'officer' && <span role="listitem">可能掉落万能牌</span>}</span>
    </span>
  </span>;
}

function WildcardSymbol({ rarity }: { rarity: string }) {
  const asset = WILDCARDS.Common[rarity];
  return <span className="ready-deck-rarity-icon" aria-hidden="true"><img src={asset.file} alt="" style={{
    width: `${100 / asset.crop.width}%`, height: `${100 / asset.crop.height}%`,
    left: `${-100 * asset.crop.x / asset.crop.width}%`, top: `${-100 * asset.crop.y / asset.crop.height}%`,
  }} /></span>;
}

function PackRevealCard({ card, index, requested, onRequest, onComplete, onImpact, onInspect }: {
  card: KardsCardRecord;
  index: number;
  requested: boolean;
  onRequest: () => void;
  onComplete: () => void;
  onImpact: (amount: number) => void;
  onInspect: (origin?: CardDetailOrigin) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const deal = useRef<HTMLSpanElement>(null);
  const rotator = useRef<HTMLSpanElement>(null);
  const [dealt, setDealt] = useState(false);
  const [phase, setPhase] = useState<'concealed' | 'revealing' | 'revealed'>('concealed');
  const callbacks = useRef({ onComplete, onImpact }); callbacks.current = { onComplete, onImpact };
  useLayoutEffect(() => {
    const element = deal.current, stage = button.current?.closest('[data-pack-stage]');
    if (!element || !stage) { setDealt(true); return; }
    const target = element.getBoundingClientRect(), source = stage.getBoundingClientRect();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animation = element.animate([
      { opacity: 0, transform: reduced ? 'none' : `translate(${source.left + source.width / 2 - target.left - target.width / 2}px, ${source.top + source.height / 2 - target.top - target.height / 2}px) scale(0.6)` },
      { opacity: 1, transform: 'none' },
    ], { duration: reduced ? 80 : 420, delay: reduced ? 0 : 140 + index * 65, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' });
    animation.onfinish = () => { setDealt(true); animation.cancel(); };
    return () => { animation.onfinish = null; animation.cancel(); };
  }, [index]);
  useEffect(() => {
    if (!requested || !dealt) return;
    const element = rotator.current;
    if (!element) return;
    setPhase('revealing');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timing = PACK_FLIP_TIMINGS[card.json.rarity as keyof typeof PACK_FLIP_TIMINGS] || PACK_FLIP_TIMINGS.Standard;
    const duration = timing.lift + timing.flip + timing.settle;
    const animation = element.animate(reduced ? [
      { transform: 'rotateY(0deg)', opacity: 0.5 }, { transform: 'rotateY(180deg)', opacity: 1 },
    ] : [
      { transform: 'translateY(0) scale(1) rotateY(0deg)', offset: 0, easing: 'ease-out' },
      { transform: 'translateY(-32px) scale(1.12) rotateY(0deg)', offset: timing.lift / duration, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      { transform: 'translateY(-32px) scale(1.12) rotateY(180deg)', offset: (timing.lift + timing.flip) / duration, easing: 'cubic-bezier(0.2, 0.9, 0.4, 1)' },
      { transform: 'translateY(0) scale(1) rotateY(180deg)', offset: 1 },
    ], { duration: reduced ? 100 : duration, fill: 'both' });
    animation.onfinish = () => {
      element.style.transform = 'rotateY(180deg)';
      animation.cancel();
      setPhase('revealed');
      if (!reduced) callbacks.current.onImpact(timing.impact);
      callbacks.current.onComplete();
    };
    return () => { animation.onfinish = null; animation.cancel(); };
  }, [requested, dealt, card]);
  const rarity = card.json.rarity as keyof typeof RARITY_LABELS;
  return <button ref={button} type="button" data-detail-source={card.cardId} data-state={phase} disabled={!dealt || phase === 'revealing'}
    aria-label={phase === 'revealed' ? `查看${cardDisplayTitle(card, 'zh-Hans')}` : `翻开第 ${index + 1} 张卡牌`}
    onClick={event => phase === 'revealed' ? onInspect(captureCardDetailOrigin(event.currentTarget, 'pool')) : onRequest()}
    className="pack-reveal-card card-action" style={{ '--pack-rarity': RARITY_SLOTS[rarity]?.color } as CSSProperties}>
    <span ref={deal} className="pack-reveal-deal">
      <span ref={rotator} className="pack-card-rotator">
        <span className="pack-card-face pack-card-back"><img src={defaultCardBackForNation(card.json.faction || '')} alt="" /></span>
        <span className="pack-card-face pack-card-front"><CardFace card={card} /></span>
      </span>
    </span>
    <span className="pack-reveal-rarity"><WildcardSymbol rarity={rarity} />{RARITY_LABELS[rarity]}</span>
  </button>;
}

export default function CardPacks({ cards }: { cards: KardsCardRecord[] }) {
  const [category, setCategory] = useState<CardPackAsset['category']>('nation');
  const [kind, setKind] = useState<CardPackKind>('standard');
  const [source, setSource] = useState('Britain');
  const [opened, setOpened] = useState<{ pack: CardPackAsset; cards: KardsCardRecord[]; serial: number } | null>(null);
  const [requested, setRequested] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<{ card: KardsCardRecord; origin?: CardDetailOrigin } | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLElement>(null);
  const impact = useRef<Animation | null>(null);
  const options = useMemo(() => CARD_PACKS.filter(pack => pack.category === category && pack.kind === kind), [category, kind]);
  const selected = options.find(pack => pack.source === source) || options[0];
  const pool = useMemo(() => cardPackPool(cards, selected), [cards, selected]);
  const rules = PACK_RULES[opened?.pack.kind || kind];
  const complete = !!opened && revealed.length === opened.cards.length;
  const detailSequence = useMemo(() => [...new Map((opened?.cards || []).filter((_, index) => revealed.includes(index))
    .map(card => [card.cardId, { card }])).values()], [opened, revealed]);
  const open = (pack: CardPackAsset = opened?.pack || selected) => {
    try {
      const drawn = drawCardPack(cardPackPool(cards, pack), pack.kind);
      setOpened(current => ({ pack, cards: drawn, serial: (current?.serial || 0) + 1 }));
      setRequested([]); setRevealed([]); setError('');
    } catch (error) { setError(error instanceof Error ? error.message : '无法打开卡包'); }
  };
  useEffect(() => () => impact.current?.cancel(), []);
  const shake = (amount: number) => {
    if (!stage.current || !amount) return;
    impact.current?.cancel();
    const displacement = 2 + amount * 4;
    impact.current = stage.current.animate([
      { transform: 'none' }, { transform: `translate(${displacement}px, ${-displacement / 2}px)` },
      { transform: `translate(${-displacement / 2}px, ${displacement / 3}px)` }, { transform: 'none' },
    ], { duration: 300 + amount * 600, easing: 'ease-out' });
  };
  const leaveOpening = () => { setOpened(null); setError(''); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.pack-choice[aria-pressed="true"]')?.focus()); };
  useEffect(() => {
    if (!opened) return;
    page.current?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== 'Escape'
        || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault(); leaveOpening();
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [opened]);
  return <section ref={page} tabIndex={-1} aria-label="模拟开包" className="card-packs-page">
    <div className="pack-page-toolbar glass-panel">
      {opened ? <>
        <button type="button" onClick={leaveOpening} className="pack-back-button"><ArrowLeft className="h-4 w-4" />选择卡包</button>
        <h2 className="pack-opening-title">{opened.pack.name}<span>{opened.pack.kind === 'standard' ? '标准包' : '军官包'}</span></h2>
        <span className="pack-reveal-progress" role="status" aria-live="polite">已翻开 {revealed.length} / {opened.cards.length}</span>
      </> : <>
        <div role="group" aria-label="卡包来源" className="pack-segmented" data-second={category === 'expansion'}>
          <span className="pack-segmented-indicator" aria-hidden="true" />
          {([{ id: 'nation', name: '国家卡包' }, { id: 'expansion', name: '扩展卡包' }] as const).map(item => <button key={item.id} type="button" aria-pressed={category === item.id}
            onClick={() => { setCategory(item.id); setError(''); }}>{item.id === 'nation' ? <Flag className="h-4 w-4" /> : <Layers3 className="h-4 w-4" />}{item.name}</button>)}
        </div>
        <div role="group" aria-label="卡包规格" className="pack-segmented pack-kind-segmented" data-second={kind === 'officer'}>
          <span className="pack-segmented-indicator" aria-hidden="true" />
          {([{ id: 'standard', name: '标准包' }, { id: 'officer', name: '军官包' }] as const).map(item => <div key={item.id} className="pack-kind-option">
            <button type="button" aria-pressed={kind === item.id} onClick={() => { setKind(item.id); setError(''); }}>{item.name}</button>
            <PackInfo pack={selected} kind={item.id} />
          </div>)}
        </div>
      </>}
    </div>
    {opened ? <>
      <div ref={stage} data-pack-stage className="pack-opening-stage" key={opened.serial}>
        <img src={opened.pack.file} alt="" className="pack-opening-cover" />
        {[opened.cards.slice(0, opened.pack.kind === 'standard' ? 3 : 4), opened.cards.slice(opened.pack.kind === 'standard' ? 3 : 4)].map((row, rowIndex) => <div key={rowIndex} className="pack-opening-row">
          {row.map((card, column) => {
            const index = column + (rowIndex ? (opened.pack.kind === 'standard' ? 3 : 4) : 0);
            return <PackRevealCard key={index} card={card} index={index} requested={requested.includes(index)}
              onRequest={() => setRequested(current => [...new Set([...current, index])])}
              onComplete={() => setRevealed(current => [...new Set([...current, index])])} onImpact={shake}
              onInspect={origin => setDetail({ card, origin })} />;
          })}
        </div>)}
      </div>
      <footer className="pack-opening-footer glass-panel">
        <div className="pack-result-summary" aria-label="开包结果">{complete && CARD_RARITIES.map(rarity => {
          const count = opened.cards.filter(card => card.json.rarity === rarity).length;
          return count > 0 && <span key={rarity}><WildcardSymbol rarity={rarity} />{RARITY_LABELS[rarity]}<strong>{count}</strong></span>;
        })}</div>
        {complete ? <button type="button" onClick={() => open()} className="pack-open-button"><RotateCcw className="h-4 w-4" />再开一包</button>
          : <button type="button" disabled={requested.length === opened.cards.length} onClick={() => setRequested(opened.cards.map((_, index) => index))} className="pack-open-button">{requested.length === opened.cards.length ? '翻开中…' : '全部翻开'}</button>}
      </footer>
    </> : <>
      <div className="pack-selection-stage">
        <div key={`${category}-${kind}`} role="group" aria-label="选择卡包" data-category={category} className="pack-selection-grid">
          {options.map(pack => <button key={pack.id} type="button" aria-pressed={selected.id === pack.id} aria-label={`${pack.name}${kind === 'standard' ? '标准包' : '军官包'}`}
            onClick={() => { setSource(pack.source); setError(''); }} onDoubleClick={() => open(pack)} className="pack-choice card-action">
            <span className="pack-choice-art"><img src={pack.file} alt="" />{selected.id === pack.id && <Check className="pack-choice-check h-5 w-5" />}</span>
            <span className="pack-choice-name"><PackSourceIcon pack={pack} />{pack.name}</span>
          </button>)}
        </div>
      </div>
      <footer className="pack-selection-footer glass-panel">
        <div className="pack-selection-description"><h2><span className="pack-selected-source"><PackSourceIcon key={selected.source} pack={selected} />{selected.name}</span><span className="pack-selected-kind">{kind === 'standard' ? '标准包' : '军官包'}</span></h2><span className="text-xs text-kards-text-muted">卡池 {pool.length.toLocaleString()} 张</span></div>
        <div className="pack-probabilities" aria-label="单卡基础出卡概率">{CARD_RARITIES.map(rarity => <span key={rarity}><WildcardSymbol rarity={rarity} /><span>{RARITY_LABELS[rarity]}<strong>{rules.probabilities[rarity]}%</strong></span></span>)}</div>
        <button type="button" onClick={() => open()} disabled={!pool.length} className="pack-open-button">打开卡包</button>
      </footer>
    </>}
    {error && <p role="alert" className="pack-error">{error}</p>}
    {detail && <CardDetailModal card={detail.card} origin={detail.origin} cards={cards} sequence={detailSequence}
      onNavigate={item => revealDetailItem(item, 'pool', stage.current)} onClose={() => setDetail(null)} />}
  </section>;
}
