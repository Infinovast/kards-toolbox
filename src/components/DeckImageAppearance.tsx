import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Images, Palette } from 'lucide-react';
import { alternateCardArt } from '../lib/assetCatalog';
import { decodeDeckCode, findCardsByImportId } from '../lib/deckCode';
import { cardDisplayTitle, type KardsCardRecord } from '../types/card';

export default function DeckImageAppearance({ code, cards, selection, disabled, onTablecloth, onAlternateArt }: {
  code?: string;
  cards: KardsCardRecord[];
  selection?: ReadonlyMap<string, string>;
  disabled?: boolean;
  onTablecloth: () => void;
  onAlternateArt: (selection: ReadonlyMap<string, string>) => void;
}) {
  const [menu, setMenu] = useState<'appearance' | 'alternate' | null>(null);
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const options = useMemo(() => {
    if (!code) return [];
    const cardsById = findCardsByImportId(cards);
    return [...decodeDeckCode(code).counts.keys()].flatMap(importId => {
      const card = cardsById.get(importId);
      if (!card) return [];
      const sources = alternateCardArt(card.cardId);
      const title = cardDisplayTitle(card, 'zh-Hans');
      return sources.map((source, index) => ({
        cardId: card.cardId,
        source,
        label: sources.length > 1 ? `${title}（异画 ${index + 1}）` : title,
      }));
    });
  }, [code, cards]);

  const close = () => { setMenu(null); trigger.current?.focus(); };
  useEffect(() => {
    if (!menu) return;
    panel.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setMenu(null);
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [menu]);
  useEffect(() => { if (disabled) setMenu(null); }, [disabled]);

  return <div ref={container} className="relative shrink-0" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setMenu(null);
  }} onKeyDown={event => {
    if (!menu || event.key !== 'Escape' || event.nativeEvent.isComposing) return;
    event.preventDefault(); event.stopPropagation(); close();
  }}>
    <button ref={trigger} type="button" disabled={disabled} aria-expanded={!!menu} aria-controls={menu ? id : undefined}
      onClick={() => setMenu(current => current ? null : 'appearance')}
      className="flex items-center gap-2 rounded border border-kards-border px-4 py-2 text-sm font-bold hover:border-kards-gold disabled:opacity-40">
      <Palette aria-hidden="true" className="h-4 w-4" />外观<ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
    {menu && !disabled && <div ref={panel} id={id} role="group" aria-label={menu === 'appearance' ? '生图外观' : '卡牌异画选项'}
      className="deck-image-appearance-menu custom-scrollbar">
      {menu === 'appearance' ? <>
        <button type="button" onClick={() => { close(); onTablecloth(); }}><Palette aria-hidden="true" className="h-4 w-4" />桌布</button>
        <button type="button" disabled={!options.length} onClick={() => setMenu('alternate')}><Images aria-hidden="true" className="h-4 w-4" />卡牌异画<ChevronRight aria-hidden="true" className="ml-auto h-3.5 w-3.5" /></button>
      </> : <>
        <button type="button" onClick={() => setMenu('appearance')} className="deck-image-appearance-back"><ArrowLeft aria-hidden="true" className="h-4 w-4" />卡牌异画</button>
        {options.map(({ cardId, source, label }) => {
          const selected = selection?.get(cardId) === source;
          return <button key={source} type="button" aria-pressed={selected} onClick={() => {
            const next = new Map(selection);
            next.delete(cardId);
            if (!selected) next.set(cardId, source);
            close();
            onAlternateArt(next);
          }}><img src={source} alt="" loading="lazy" />{label}{selected && <Check aria-hidden="true" className="ml-auto h-4 w-4 shrink-0" />}</button>;
        })}
      </>}
    </div>}
  </div>;
}
