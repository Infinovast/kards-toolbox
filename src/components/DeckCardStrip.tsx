import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff } from 'lucide-react';
import { cacheCardImage } from '../lib/cardImages';
import { headquartersForDeck, type HeadquartersAsset } from '../lib/cardAssets';
import { cardDisplayTitle, factionLabel, type KardsCardRecord } from '../types/card';
import ReservedBadge from './ReservedBadge';
import { RARITY_SLOTS } from './CardFace';
import { captureCardDetailOrigin, type CardDetailOrigin } from '../lib/cardDetailOrigin';

let previewPointer: { x: number; y: number } | null = null;
let dismissedPreviewPointer: { x: number; y: number } | null = null;
let previewUsers = 0;
const trackPreviewPointer = (event: PointerEvent) => {
  previewPointer = { x: event.clientX, y: event.clientY };
  if (dismissedPreviewPointer && Math.hypot(event.clientX - dismissedPreviewPointer.x, event.clientY - dismissedPreviewPointer.y) >= 2) dismissedPreviewPointer = null;
};

function usePreviewDismissal(open: boolean, hide: () => void) {
  const blocked = useRef(false);
  const close = useRef(hide);
  close.current = hide;
  useEffect(() => {
    if (previewUsers++ === 0) document.addEventListener('pointermove', trackPreviewPointer, true);
    return () => {
      if (--previewUsers === 0) {
        document.removeEventListener('pointermove', trackPreviewPointer, true);
        previewPointer = null; dismissedPreviewPointer = null;
      }
    };
  }, []);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      dismissedPreviewPointer = event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : previewPointer;
      blocked.current = true; close.current();
    };
    const events = ['pointerdown', 'click', 'dblclick', 'contextmenu', 'keydown', 'dragstart', 'wheel'];
    events.forEach(type => document.addEventListener(type, dismiss, true));
    return () => events.forEach(type => document.removeEventListener(type, dismiss, true));
  }, [open]);
  const resume = (event: { clientX: number; clientY: number }, show?: () => void) => {
    previewPointer = { x: event.clientX, y: event.clientY };
    // A row sliding under a stationary pointer after removal must not reopen a preview.
    if (dismissedPreviewPointer && Math.hypot(previewPointer.x - dismissedPreviewPointer.x, previewPointer.y - dismissedPreviewPointer.y) < 2) return;
    dismissedPreviewPointer = null; blocked.current = false;
    show?.();
  };
  return { blocked, resume };
}

// Median RGB of x=120..390, y=80..88 in the supplied 500px card headers.
// Nation colors are shared by card rows and headquarters rows.
export const CARD_STRIP_NATIONS: Record<string, { color: string; icon: string; darkText?: boolean }> = {
  Germany: { color: '#5e6b66', icon: './assets/icons/Germany/German.png' },
  Britain: { color: '#968c6f', icon: './assets/icons/Britain/Britain.png', darkText: true },
  Japan: { color: '#9e8041', icon: './assets/icons/Japan/Japan.png', darkText: true },
  Soviet: { color: '#655541', icon: './assets/icons/Soviet/Soviet.png' },
  USA: { color: '#656d4f', icon: './assets/icons/USA/Usa.png' },
  France: { color: '#515a78', icon: './assets/icons/France/France.png' },
  Italy: { color: '#6a6969', icon: './assets/icons/Italy/Italy.png' },
  Poland: { color: '#676452', icon: './assets/icons/Poland/Poland.jpg' },
  Finland: { color: '#bbbaaa', icon: './assets/filters/finland.svg', darkText: true },
  Neutral: { color: '#3c3d41', icon: './assets/filters/neutral.svg' },
  Anzac: { color: '#9e6f34', icon: './assets/filters/anzac.svg', darkText: true },
};

const HEADQUARTERS: Record<string, string> = {
  Britain: 'ALAM EL HALFA', Germany: 'DANZIG', Soviet: 'STALINGRAD', Japan: 'TRUK', USA: 'CHERBOURG',
};

export function DeckHeadquartersStrip({ nation, headquartersId, onClick }: { nation: string; headquartersId?: string; onClick?: (headquarters: HeadquartersAsset, origin?: CardDetailOrigin) => void }) {
  const appearance = CARD_STRIP_NATIONS[nation] || CARD_STRIP_NATIONS.Neutral;
  const headquarters = headquartersForDeck(headquartersId, nation);
  const title = headquarters?.name || HEADQUARTERS[nation] || `${factionLabel(nation)}总部`;
  const root = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<CSSProperties | null>(null);
  const previewBlocked = usePreviewDismissal(!!preview, () => setPreview(null));
  const showPreview = () => {
    if (previewBlocked.blocked.current || dismissedPreviewPointer || !headquarters || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    const bounds = root.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = Math.min(250, (window.innerHeight - 32) * 618 / 867, bounds.left - 24);
    if (width < 100) return;
    const height = width * 867 / 618;
    window.dispatchEvent(new CustomEvent('kards-deck-card-preview', { detail: root.current }));
    setPreview({ width, left: bounds.left - width - 12, top: Math.max(12, Math.min(window.innerHeight - height - 12, bounds.top + bounds.height / 2 - height / 2)) });
  };
  useEffect(() => {
    if (!preview) return;
    const hide = () => setPreview(null);
    const otherPreview = (event: Event) => { if ((event as CustomEvent).detail !== root.current) hide(); };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('kards-deck-card-preview', otherPreview);
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); window.removeEventListener('blur', hide); window.removeEventListener('kards-deck-card-preview', otherPreview); };
  }, [preview]);
  return <div ref={root} className="deck-headquarters-strip" role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} aria-label={`主国总部 ${title}`} style={{ '--strip-color': appearance.color, '--strip-text': appearance.darkText ? '#12130e' : '#fff9e8' } as CSSProperties} onMouseEnter={event => previewBlocked.resume(event, showPreview)} onMouseMove={event => previewBlocked.resume(event, preview ? undefined : showPreview)} onMouseLeave={() => setPreview(null)} onFocus={showPreview} onBlur={() => setPreview(null)}
    onClick={() => { if (headquarters && onClick) { setPreview(null); onClick(headquarters, captureCardDetailOrigin(root.current, 'strip', headquarters.image)); } }}
    onKeyDown={event => { if (!event.nativeEvent.isComposing && !event.ctrlKey && !event.metaKey && (event.key === 'Enter' || event.key === ' ') && headquarters && onClick) { event.preventDefault(); event.stopPropagation(); setPreview(null); onClick(headquarters, captureCardDetailOrigin(root.current, 'strip', headquarters.image)); } }}>
    <div className="deck-card-strip-body"><span className="deck-card-name">{title}</span><img className="deck-card-nation" src={appearance.icon} alt={factionLabel(nation)} /></div>
    {headquarters && preview && createPortal(<div role="tooltip" aria-label={`${title}总部大图`} className="deck-card-preview glass-panel" style={preview}><img className="card-face" src={headquarters.image} alt={title} /></div>, document.body)}
  </div>;
}

export default function DeckCardStrip({ card, importId, count, enabled = true, controls, draggable = false, onDragStart, onDragEnd, onClick, onDoubleClick, onRemove }: {
  card?: KardsCardRecord;
  importId: string;
  count: number;
  enabled?: boolean;
  controls?: ReactNode;
  draggable?: boolean;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: DragEvent<HTMLDivElement>) => void;
  onClick?: (origin?: CardDetailOrigin) => void;
  onDoubleClick?: () => void;
  onRemove?: () => void;
}) {
  const title = card ? cardDisplayTitle(card, 'zh-Hans') : `未知卡牌 ${importId}`;
  const nation = Object.keys(CARD_STRIP_NATIONS).find(key => key.toLowerCase() === card?.json.faction?.toLowerCase());
  const appearance = CARD_STRIP_NATIONS[nation || 'Neutral'];
  const isUnit = !!card && !['order', 'countermeasure'].includes((card.json.type || '').toLowerCase());
  const [source, setSource] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState<CSSProperties | null>(null);
  const previewBlocked = usePreviewDismissal(!!preview, () => setPreview(null));
  const showPreview = () => {
    if (previewBlocked.blocked.current || dismissedPreviewPointer || !enabled || !card || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    const bounds = root.current?.getBoundingClientRect();
    if (!bounds) return;
    const width = Math.min(250, (window.innerHeight - 32) * 618 / 867, bounds.left - 24);
    if (width < 100) return;
    const height = width * 867 / 618;
    window.dispatchEvent(new CustomEvent('kards-deck-card-preview', { detail: root.current }));
    setPreview({ width, left: bounds.left - width - 12, top: Math.max(12, Math.min(window.innerHeight - height - 12, bounds.top + bounds.height / 2 - height / 2)) });
  };
  useEffect(() => {
    if (!preview) return;
    const hide = () => setPreview(null);
    const otherPreview = (event: Event) => { if ((event as CustomEvent).detail !== root.current) hide(); };
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    window.addEventListener('kards-deck-card-preview', otherPreview);
    return () => { window.removeEventListener('scroll', hide, true); window.removeEventListener('resize', hide); window.removeEventListener('blur', hide); window.removeEventListener('kards-deck-card-preview', otherPreview); };
  }, [preview]);
  useEffect(() => {
    setSource(''); setThumbnail('');
    if (!enabled || !card) return;
    let active = true;
    cacheCardImage(card).then(url => { if (active) setSource(url); }).catch(() => {});
    cacheCardImage(card, 'thumbnail').then(url => { if (active) setThumbnail(url); }).catch(() => {});
    return () => { active = false; };
  }, [card, enabled]);
  return <div ref={root} tabIndex={card ? 0 : undefined} role={onClick ? 'button' : undefined} aria-label={`${title}，${count} 张`} className="deck-card-strip" data-deck-card-id={importId} data-nation={nation || 'Unknown'} data-preview={!!preview && enabled} style={{ '--strip-color': appearance.color, '--strip-text': appearance.darkText ? '#12130e' : '#fff9e8', '--rarity-color': (RARITY_SLOTS[card?.json.rarity || 'Standard'] || RARITY_SLOTS.Standard).color } as CSSProperties}
    onClick={event => {
      if (!enabled || !onClick || (event.target as HTMLElement).closest('.deck-card-controls')) return;
      setPreview(null);
      if (onDoubleClick && event.detail > 1) onDoubleClick();
      else onClick(captureCardDetailOrigin(root.current, 'strip', source, event.nativeEvent));
    }}
    onContextMenu={event => { if (enabled && onRemove) { event.preventDefault(); setPreview(null); onRemove(); } }}
    onMouseEnter={event => previewBlocked.resume(event, showPreview)} onMouseMove={event => previewBlocked.resume(event, preview ? undefined : showPreview)} onMouseLeave={() => setPreview(null)} onFocus={showPreview} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPreview(null); }}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (preview && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setPreview(null); }
      else if (enabled && onClick && !event.ctrlKey && !event.metaKey && (event.key === 'Enter' || event.key === ' ') && event.target === event.currentTarget) { event.preventDefault(); event.stopPropagation(); setPreview(null); onClick(captureCardDetailOrigin(root.current, 'strip', source)); }
    }}>
    <span className="deck-card-marker">{card?.reserved && <ReservedBadge />}</span>
    <div className="deck-card-strip-body" draggable={draggable} onDragStart={event => { setPreview(null); onDragStart?.(event); }} onDragEnd={onDragEnd}>
      <span className="deck-card-cost" aria-label={card ? isUnit ? `部署花费 ${card.json.kredits ?? '?'}，行动花费 ${card.json.operationCost ?? '?'}` : `花费 ${card.json.kredits ?? '?'}` : '费用未知'}>
        <span className="deck-card-deployment" style={(card?.json.kredits ?? 0) >= 10 ? { fontSize: 21 } : undefined}>{card?.json.kredits ?? '?'}</span><small>K</small>{isUnit && <span className="deck-card-operation">{card.json.operationCost ?? '?'}</span>}
      </span>
      <span className="deck-card-name">{title}</span>
      <img className="deck-card-nation" src={appearance.icon} alt={factionLabel(card?.json.faction)} />
      <span className="deck-card-thumbnail" data-thumbnail="true" aria-label={`${title}卡图缩略图`}>
        {thumbnail ? <img src={thumbnail} alt="" onError={() => setThumbnail('')} /> : <ImageOff className="h-4 w-4 opacity-60" aria-hidden="true" />}
      </span>
    </div>
    <span className="deck-card-count" aria-label={`${count} 张`}><span className="deck-card-count-number">{count}</span></span>
    {controls && <div className="deck-card-controls">{controls}</div>}
    {card && enabled && preview && createPortal(<div role="tooltip" aria-label={`${title}卡牌大图`} className="deck-card-preview glass-panel" style={preview}>
      {source ? <img className="card-face" src={source} alt={title} /> : <div className="card-face card-face-placeholder">{title}<br />卡图暂不可用</div>}
    </div>, document.body)}
  </div>;
}
