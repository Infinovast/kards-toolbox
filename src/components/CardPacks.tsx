import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ArrowLeft, Check, Flag, Info, Layers3, RotateCcw, X } from 'lucide-react';
import { CARD_PACKS, COIN_ICON, SET_ICONS, WILDCARDS, factionIcon, wildcardAsset, type CardPackAsset, type CardPackKind } from '../lib/assetCatalog';
import { NEUTRAL_CARD_BACK, defaultCardBackForNation } from '../lib/cardAssets';
import { cardPackPool, drawCardPack, packRewardRarity, packWildcardNation, PACK_FLIP_TIMINGS, PACK_RULES, type PackReward, type PackWildcard } from '../lib/cardPacks';
import type { PackHistory } from '../lib/packHistory';
import { handleDialogKeys } from '../lib/dialogKeyboard';
import { captureCardDetailOrigin, type CardDetailOrigin } from '../lib/cardDetailOrigin';
import { revealDetailItem } from '../lib/cardDetailPaging';
import { CARD_RARITIES, cardDisplayTitle, factionLabel, type KardsCardRecord } from '../types/card';
import { CardFace, RARITY_SLOTS } from './CardFace';
import CardDetailModal from './CardDetailModal';
import { FilterIcon } from './CardFilterSelects';
import './cardPacks.css';

const RARITY_LABELS = { Standard: '普通', Limited: '限定', Special: '特殊', Elite: '精英' };
const ELITE_LIFT = 26;

const wildcardNationLabel = (nation?: string) => nation ? factionLabel(nation) : '通用';
const wildcardLabel = ({ nation, rarity }: PackWildcard) => `${wildcardNationLabel(nation)}${RARITY_LABELS[rarity]}万能牌`;

function PackSourceIcon({ pack, rotation }: { pack: CardPackAsset; rotation: number }) {
  const nations = pack.nations;
  const nation = nations?.length ? nations[rotation % nations.length] : undefined;
  const src = pack.category === 'expansion' ? SET_ICONS[pack.set || ''] : factionIcon(nation, 'white');
  return <span className="pack-source-icon" aria-hidden="true"><span key={src} className="pack-source-icon-entry"><FilterIcon src={src || SET_ICONS.All} /></span></span>;
}

function PackInfo({ pack, kind }: { pack: CardPackAsset; kind: CardPackKind }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  const label = kind === 'standard' ? '标准包' : '军官包';
  const content = pack.source === 'Core' ? '来自常备卡池的'
    : pack.category === 'expansion' ? `${pack.name}套装` : pack.name;
  const wildcardSource = pack.source === 'Ally' ? '随机主国' : wildcardNationLabel(packWildcardNation(pack));
  return <span className="pack-info" onPointerEnter={() => setVisible(true)} onPointerLeave={() => setVisible(false)}>
    <button type="button" className="pack-info-button" aria-label={`${label}说明`} aria-describedby={visible ? id : undefined}
      onFocus={() => setVisible(true)} onBlur={() => setVisible(false)} onClick={() => setVisible(value => !value)}
      onKeyDown={event => { if (event.key === 'Escape' && visible) { event.preventDefault(); event.stopPropagation(); setVisible(false); } }}><Info className="h-4 w-4" /></button>
    <span id={id} role="tooltip" hidden={!visible} className="pack-info-tooltip">
      <strong>每个卡包内含：</strong>
      <span role="list" className="pack-info-list"><span role="listitem">{kind === 'standard' ? 5 : 7}张{content}卡牌</span>
        <span role="listitem">{kind === 'standard' ? '至少1张限定或更高稀有度卡牌' : '至少1张特殊或精英卡牌'}</span>
        {kind === 'officer' && <span role="listitem">可能掉落{wildcardSource}万能牌</span>}</span>
    </span>
  </span>;
}

function WildcardSymbol({ rarity }: { rarity: string }) {
  return <span className="ready-deck-rarity-icon" aria-hidden="true"><img src={WILDCARDS.Common[rarity]} alt="" /></span>;
}

function WildcardArt({ reward }: { reward: PackWildcard }) {
  return <img className="pack-wildcard-art" src={wildcardAsset(reward.nation, reward.rarity)} alt={wildcardLabel(reward)} draggable={false} />;
}

function PackHistorySummary({ history }: { history: PackHistory }) {
  return <div className="pack-history" aria-label="开包历史">
    <p className="pack-history-cost"><span className="pack-history-amount">100<img src={COIN_ICON} alt="金币" className="pack-history-coin" draggable={false} /></span>×<strong className="pack-history-count">{history.standard}</strong> + <span className="pack-history-amount">330<img src={COIN_ICON} alt="金币" className="pack-history-coin" draggable={false} /></span>×<strong className="pack-history-count">{history.officer}</strong> = <strong className="pack-history-total pack-history-amount">{history.standard * 100 + history.officer * 330}<img src={COIN_ICON} alt="金币" className="pack-history-coin" draggable={false} /></strong></p>
    <div className="pack-history-rarities">{CARD_RARITIES.map(rarity => <span key={rarity} aria-label={`${RARITY_LABELS[rarity]} ${history.rarities[rarity]}`}><WildcardSymbol rarity={rarity} /><strong>{history.rarities[rarity]}</strong></span>)}</div>
  </div>;
}

function PackRevealCard({ reward, index, requested, onRequest, onComplete, onZoom, onImpact, onInspect }: {
  reward: PackReward;
  index: number;
  requested: boolean;
  onRequest: () => void;
  onComplete: () => void;
  onZoom: (card: HTMLButtonElement) => void;
  onImpact: (distance: number, duration: number) => void;
  onInspect: (origin?: CardDetailOrigin) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const deal = useRef<HTMLSpanElement>(null);
  const rotator = useRef<HTMLSpanElement>(null);
  const [dealt, setDealt] = useState(false);
  const [phase, setPhase] = useState<'concealed' | 'revealing' | 'revealed'>('concealed');
  const rarity = packRewardRarity(reward);
  const callbacks = useRef({ onComplete, onZoom, onImpact }); callbacks.current = { onComplete, onZoom, onImpact };
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
    const timing = PACK_FLIP_TIMINGS[rarity];
    const duration = timing.lift + timing.flip + timing.settle;
    const elite = rarity === 'Elite';
    const raised = elite ? `translateY(-${ELITE_LIFT}px) scale(1)` : 'translateY(-32px) scale(1.12)';
    if (!reduced && elite && button.current) callbacks.current.onZoom(button.current);
    const animation = element.animate(reduced ? [
      { transform: 'rotateY(0deg)', opacity: 0.5 }, { transform: 'rotateY(180deg)', opacity: 1 },
    ] : [
      { transform: 'translateY(0) scale(1) rotateY(0deg)', offset: 0, easing: 'ease-out' },
      { transform: `${raised} rotateY(0deg)`, offset: timing.lift / duration, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
      { transform: `${raised} rotateY(180deg)`, offset: (timing.lift + timing.flip) / duration,
        easing: elite ? 'cubic-bezier(0.55, 0.04, 0.95, 0.65)' : 'cubic-bezier(0.2, 0.9, 0.4, 1)' },
      { transform: 'translateY(0) scale(1) rotateY(180deg)', offset: 1 },
    ], { duration: reduced ? 100 : duration, fill: 'both' });
    animation.onfinish = () => {
      element.style.transform = 'rotateY(180deg)';
      animation.cancel();
      setPhase('revealed');
      if (!reduced && timing.impact) callbacks.current.onImpact(timing.impact.distance, timing.impact.duration);
      callbacks.current.onComplete();
    };
    return () => { animation.onfinish = null; animation.cancel(); };
  }, [requested, dealt, rarity]);
  return <button ref={button} type="button" data-detail-source={reward.kind === 'card' ? reward.card.cardId : undefined} data-reward-kind={reward.kind} data-state={phase} disabled={!dealt || phase === 'revealing'}
    aria-label={phase === 'revealed' ? `查看${reward.kind === 'card' ? cardDisplayTitle(reward.card, 'zh-Hans') : wildcardLabel(reward)}` : `翻开第 ${index + 1} 张卡牌`}
    onClick={event => phase === 'revealed' ? onInspect(captureCardDetailOrigin(event.currentTarget, 'pool')) : onRequest()}
    onDragStart={event => event.preventDefault()}
    className="pack-reveal-card card-action" style={{ '--pack-rarity': RARITY_SLOTS[rarity]?.color } as CSSProperties}>
    <span ref={deal} className="pack-reveal-deal">
      <span ref={rotator} className="pack-card-rotator">
        <span className="pack-card-face pack-card-back"><img src={reward.kind === 'card' ? defaultCardBackForNation(reward.card.json.faction || '') : NEUTRAL_CARD_BACK} alt="" draggable={false} /></span>
        <span className="pack-card-face pack-card-front">{reward.kind === 'card' ? <CardFace card={reward.card} /> : <WildcardArt reward={reward} />}</span>
      </span>
    </span>
    <span className="pack-reveal-rarity"><WildcardSymbol rarity={rarity} />{RARITY_LABELS[rarity]}{reward.kind === 'wildcard' ? '万能牌' : ''}</span>
  </button>;
}

export default function CardPacks({ cards, history, onOpenPack }: { cards: KardsCardRecord[]; history: PackHistory; onOpenPack: (kind: CardPackKind, rewards: PackReward[]) => Promise<void> }) {
  const [category, setCategory] = useState<CardPackAsset['category']>('expansion');
  const [kind, setKind] = useState<CardPackKind>('standard');
  const [source, setSource] = useState('Britain');
  const [opened, setOpened] = useState<{ pack: CardPackAsset; cards: PackReward[]; serial: number } | null>(null);
  const [emblemRotation, setEmblemRotation] = useState(0);
  const [opening, setOpening] = useState(false);
  const openingLock = useRef(false);
  const [requested, setRequested] = useState<number[]>([]);
  const [revealed, setRevealed] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<{ card: KardsCardRecord; origin?: CardDetailOrigin } | null>(null);
  const [wildcardDetail, setWildcardDetail] = useState<PackWildcard | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLElement>(null);
  const camera = useRef<Animation | null>(null);
  const impact = useRef<{ animation: Animation; distance: number } | null>(null);
  const options = useMemo(() => CARD_PACKS.filter(pack => pack.category === category && pack.kind === kind), [category, kind]);
  const selected = options.find(pack => pack.source === source) || options[0];
  const pool = useMemo(() => cardPackPool(cards, selected), [cards, selected]);
  const rules = PACK_RULES[opened?.pack.kind || kind];
  const complete = !!opened && revealed.length === opened.cards.length;
  useEffect(() => {
    if (category !== 'nation' || opened) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setEmblemRotation(rotation => rotation + 1);
    }, 2000);
    return () => clearInterval(timer);
  }, [category, opened]);
  const detailSequence = useMemo(() => [...new Map((opened?.cards || []).filter((_, index) => revealed.includes(index))
    .flatMap(reward => reward.kind === 'card' ? [[reward.card.cardId, { card: reward.card }] as const] : [])).values()], [opened, revealed]);
  const open = async (pack: CardPackAsset = opened?.pack || selected) => {
    if (openingLock.current) return;
    openingLock.current = true; setOpening(true);
    try {
      const drawn = drawCardPack(cardPackPool(cards, pack), pack);
      await onOpenPack(pack.kind, drawn);
      setOpened(current => ({ pack, cards: drawn, serial: (current?.serial || 0) + 1 }));
      setRequested([]); setRevealed([]); setError('');
    } catch (error) { setError(error instanceof Error ? `无法打开卡包：${error.message}` : '无法打开卡包'); }
    finally { openingLock.current = false; setOpening(false); }
  };
  useEffect(() => {
    const element = page.current;
    if (!element || opened || opening) return;
    let scrolling = false;
    let resetTimer: number | undefined;
    const wheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || !event.deltaY || openingLock.current
        || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => { scrolling = false; }, 220);
      if (scrolling) return;
      scrolling = true;
      if (event.clientX < window.innerWidth / 2) setCategory(current => current === 'nation' ? 'expansion' : 'nation');
      else setKind(current => current === 'standard' ? 'officer' : 'standard');
      setError('');
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { element.removeEventListener('wheel', wheel); window.clearTimeout(resetTimer); };
  }, [opened, opening]);
  useLayoutEffect(() => () => {
    camera.current?.cancel();
    camera.current = null;
    impact.current?.animation.cancel();
    impact.current = null;
  }, [opened?.serial]);
  const zoomOnCard = (card: HTMLButtonElement) => {
    const element = stage.current;
    if (!element) return;
    const { lift, flip, settle, impact } = PACK_FLIP_TIMINGS.Elite;
    const landing = lift + flip + settle;
    const duration = landing + impact.duration;
    const scale = 1.22;
    const x = card.offsetLeft + card.offsetWidth / 2 - element.offsetWidth / 2;
    const raisedTop = card.offsetTop - ELITE_LIFT;
    // Keep the raised card clear of the top edge at the minimum window height.
    const focusY = Math.min(raisedTop + card.offsetHeight / 4, (raisedTop * scale - 4) / (scale - 1));
    const y = focusY - element.offsetHeight / 2;
    const closeUp = `translate(${x * (1 - scale)}px, ${y * (1 - scale)}px) scale(${scale})`;
    // Keep the current framing when several elite cards are flipped together.
    const start = camera.current ? getComputedStyle(element).transform : 'none';
    camera.current?.cancel();
    camera.current = element.animate([
      { transform: start, easing: 'ease-out' },
      { transform: closeUp, offset: lift / duration },
      { transform: closeUp, offset: landing / duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      { transform: 'none' },
    ], { duration });
  };
  const shake = (distance: number, duration: number) => {
    if (!stage.current) return;
    if (impact.current?.animation.playState === 'running' && impact.current.distance > distance) return;
    impact.current?.animation.cancel();
    // The independent translate lets impacts play during a camera move.
    const animation = stage.current.animate([
      { translate: '0px 0px' },
      { translate: `${distance}px ${distance * 0.65}px`, offset: 0.07 },
      { translate: `${-distance * 0.72}px ${-distance * 0.35}px`, offset: 0.18 },
      { translate: `${distance * 0.42}px ${distance * 0.22}px`, offset: 0.31 },
      { translate: `${-distance * 0.24}px ${-distance * 0.12}px`, offset: 0.46 },
      { translate: `${distance * 0.10}px 0px`, offset: 0.62 },
      { translate: '0px 0px' },
    ], { duration });
    impact.current = { animation, distance };
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
    <div className="pack-page-toolbar glass-panel" aria-busy={opening}>
      {opened ? <>
        <div className="pack-opening-heading"><button type="button" disabled={opening} onClick={leaveOpening} className="pack-back-button"><ArrowLeft className="h-4 w-4" />选择卡包</button>
        <h2 className="pack-opening-title">{opened.pack.name}<span>{opened.pack.kind === 'standard' ? '标准包' : '军官包'}</span></h2></div>
        <PackHistorySummary history={history} />
        <span className="pack-reveal-progress" role="status" aria-live="polite">已翻开 {revealed.length} / {opened.cards.length}</span>
      </> : <>
        <div role="group" aria-label="卡包来源" className="pack-segmented" data-second={category === 'nation'}>
          <span className="pack-segmented-indicator" aria-hidden="true" />
          {([{ id: 'expansion', name: '扩展卡包' }, { id: 'nation', name: '国家卡包' }] as const).map(item => <button key={item.id} type="button" aria-pressed={category === item.id}
            onClick={() => { setCategory(item.id); setError(''); }}>{item.id === 'nation' ? <Flag className="h-4 w-4" /> : <Layers3 className="h-4 w-4" />}{item.name}</button>)}
        </div>
        <PackHistorySummary history={history} />
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
      <div className="pack-opening-viewport">
        <div ref={stage} data-pack-stage className="pack-opening-stage" key={opened.serial}>
          <img src={opened.pack.file} alt="" className="pack-opening-cover" />
          {[opened.cards.slice(0, opened.pack.kind === 'standard' ? 3 : 4), opened.cards.slice(opened.pack.kind === 'standard' ? 3 : 4)].map((row, rowIndex) => <div key={rowIndex} className="pack-opening-row">
            {row.map((reward, column) => {
              const index = column + (rowIndex ? (opened.pack.kind === 'standard' ? 3 : 4) : 0);
              return <PackRevealCard key={index} reward={reward} index={index} requested={requested.includes(index)}
                onRequest={() => setRequested(current => [...new Set([...current, index])])}
                onComplete={() => setRevealed(current => [...new Set([...current, index])])} onZoom={zoomOnCard} onImpact={shake}
                onInspect={origin => reward.kind === 'card' ? setDetail({ card: reward.card, origin }) : setWildcardDetail(reward)} />;
            })}
          </div>)}
        </div>
      </div>
      <footer className="pack-opening-footer glass-panel">
        <div className="pack-result-summary" aria-label="开包结果">{complete && CARD_RARITIES.map(rarity => {
          const count = opened.cards.filter(reward => packRewardRarity(reward) === rarity).length;
          return count > 0 && <span key={rarity}><WildcardSymbol rarity={rarity} />{RARITY_LABELS[rarity]}<strong>{count}</strong></span>;
        })}</div>
        {complete ? <button type="button" disabled={opening} onClick={() => { void open(); }} className="pack-open-button"><RotateCcw className="h-4 w-4" />再开一包</button>
          : <button type="button" disabled={requested.length === opened.cards.length} onClick={() => setRequested(opened.cards.map((_, index) => index))} className="pack-open-button">{requested.length === opened.cards.length ? '翻开中…' : '全部翻开'}</button>}
      </footer>
    </> : <>
      <div className="pack-selection-stage">
        <div key={`${category}-${kind}`} role="group" aria-label="选择卡包" data-category={category} className="pack-selection-grid">
          {options.map(pack => <button key={pack.id} type="button" aria-pressed={selected.id === pack.id} aria-label={`${pack.name}${kind === 'standard' ? '标准包' : '军官包'}`}
            disabled={opening} onClick={() => { setSource(pack.source); setError(''); }} onDoubleClick={() => { void open(pack); }} className="pack-choice card-action">
            <span className="pack-choice-art"><img src={pack.file} alt="" />{selected.id === pack.id && <Check size={26} className="pack-choice-check" aria-hidden="true" />}</span>
            <span className="pack-choice-name glass-panel"><PackSourceIcon pack={pack} rotation={emblemRotation} />{pack.name}</span>
          </button>)}
        </div>
      </div>
      <footer className="pack-selection-footer glass-panel">
        <div className="pack-selection-description"><h2><span className="pack-selected-source"><PackSourceIcon key={selected.id} pack={selected} rotation={emblemRotation} />{selected.name}</span><span className="pack-selected-kind">{kind === 'standard' ? '标准包' : '军官包'}</span></h2><span className="text-xs text-kards-text-muted">卡池 {pool.length.toLocaleString()} 张</span></div>
        <div className="pack-probabilities" aria-label="单卡基础出卡概率">{CARD_RARITIES.map(rarity => <span key={rarity}><WildcardSymbol rarity={rarity} /><span>{RARITY_LABELS[rarity]}<strong>{rules.probabilities[rarity]}%</strong></span></span>)}</div>
        <button type="button" onClick={() => { void open(); }} disabled={!pool.length || opening} className="pack-open-button">{opening ? '打开中…' : '打开卡包'}</button>
      </footer>
    </>}
    {error && <p role="alert" className="pack-error">{error}</p>}
    {detail && <CardDetailModal card={detail.card} origin={detail.origin} cards={cards} sequence={detailSequence}
      onNavigate={item => revealDetailItem(item, 'pool', stage.current)} onClose={() => setDetail(null)} />}
    {wildcardDetail && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-kards-modal-overlay p-6 backdrop-blur-sm" onClick={() => setWildcardDetail(null)}>
      <section role="dialog" aria-modal="true" aria-label={`${wildcardNationLabel(wildcardDetail.nation)}万能牌`} tabIndex={-1} onKeyDown={handleDialogKeys} onClick={event => event.stopPropagation()} className="pack-wildcard-detail">
        <button type="button" data-dialog-cancel aria-label="关闭万能牌详情" onClick={() => setWildcardDetail(null)} className="pack-wildcard-close"><X className="h-5 w-5" /></button>
        <WildcardArt reward={wildcardDetail} /><p className="mt-3 text-center text-sm text-kards-text">{wildcardLabel(wildcardDetail)}</p>
      </section>
    </div>}
  </section>;
}
