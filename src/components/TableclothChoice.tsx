import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { HEADQUARTERS, type TableclothAsset } from '../lib/cardAssets';

export default function TableclothChoice({ item, selected, onChoose }: {
  item: TableclothAsset;
  selected: boolean;
  onChoose: (file: string) => void;
}) {
  const description = item.type === 'headquarters'
    ? HEADQUARTERS.find(headquarters => headquarters.groupId === item.headquartersId)?.brief
    : item.description;
  const id = useId();
  const anchor = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ style: CSSProperties; side: 'top' | 'bottom' }>();
  const cancelTimer = () => clearTimeout(timer.current);
  const hide = () => { cancelTimer(); setOpen(false); setPosition(undefined); };
  const show = () => {
    cancelTimer();
    if (description) timer.current = setTimeout(() => setOpen(true), 220);
  };
  const leave = () => {
    cancelTimer();
    timer.current = setTimeout(hide, 140);
  };
  useEffect(() => cancelTimer, []);
  useLayoutEffect(() => {
    if (!open || !anchor.current || !tooltip.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 24);
    const height = tooltip.current.getBoundingClientRect().height;
    const above = Math.max(0, rect.top - 22);
    const below = Math.max(0, window.innerHeight - rect.bottom - 22);
    const side = height <= below || below >= above ? 'bottom' : 'top';
    setPosition({ side, style: {
      left: Math.max(12, Math.min(window.innerWidth - width - 12, rect.left + rect.width / 2 - width / 2)),
      top: side === 'bottom' ? rect.bottom + 10 : rect.top - 10 - height,
      width,
    } });
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: Event) => {
      if (event.target instanceof Node && tooltip.current?.contains(event.target)) return;
      hide();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault(); event.stopPropagation();
      hide();
    };
    const events = ['pointerdown', 'scroll', 'resize', 'blur'];
    events.forEach(event => window.addEventListener(event, dismiss, true));
    window.addEventListener('keydown', keydown, true);
    return () => {
      events.forEach(event => window.removeEventListener(event, dismiss, true));
      window.removeEventListener('keydown', keydown, true);
    };
  }, [open]);

  return <>
    <button ref={anchor} type="button" aria-label={'选择桌布 ' + item.name} aria-pressed={selected}
      aria-describedby={open ? id : undefined} onClick={() => { hide(); onChoose(item.file); }}
      onMouseEnter={show} onMouseLeave={leave} onFocus={show} onBlur={hide}
      className={`aspect-video military-border overflow-hidden cursor-pointer group relative ${selected ? 'ring-2 ring-kards-gold' : 'hover:brightness-110 opacity-80 hover:opacity-100'}`}>
      <img src={item.file} className="w-full h-full object-cover" alt="" />
      <span className="absolute bottom-0 left-0 right-0 truncate bg-black/65 px-2 py-1 text-[10px] text-white">{item.name}</span>
      <span className="absolute inset-0 bg-kards-gold/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
        <Check className={`w-6 h-6 text-kards-text ${selected ? 'opacity-100' : 'opacity-0'}`} />
      </span>
    </button>
    {open && description && createPortal(<div ref={tooltip} id={id} role="tooltip" className="tablecloth-description"
      data-side={position?.side} style={position?.style || { width: Math.min(420, window.innerWidth - 24), visibility: 'hidden' }}
      onMouseEnter={cancelTimer} onMouseLeave={leave}>
      <p className="tablecloth-description-content">{description}</p>
    </div>, document.body)}
  </>;
}
