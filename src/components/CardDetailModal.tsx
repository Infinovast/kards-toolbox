import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Shield, X } from 'lucide-react';
import { CardFace } from './CardFace';
import { expansionOptions, FilterIcon } from './CardFilterSelects';
import { cardKeywords, cardRelations } from '../lib/cardDetails';
import { handleDialogKeys } from '../lib/dialogKeyboard';
import { isGeneratedCard } from '../lib/cardFilters';
import { cardDisplayTitle, cardText, factionLabel, isVeteranCard, typeLabel, type CardLanguage, type KardsCardRecord } from '../types/card';
import ReservedBadge from './ReservedBadge';
import { CardText } from './CardText';
import type { HeadquartersAsset } from '../lib/cardAssets';

export default function CardDetailModal({ card: initialCard, headquarters, cards, language = 'zh-Hans', onClose }: {
  card?: KardsCardRecord;
  headquarters?: HeadquartersAsset;
  cards: KardsCardRecord[];
  language?: CardLanguage;
  onClose: () => void;
}) {
  const [card, setCard] = useState<KardsCardRecord | null>(initialCard || null);
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => { setCard(initialCard || null); }, [initialCard, headquarters]);
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus();
    window.dispatchEvent(new CustomEvent('kards-deck-card-preview', { detail: null }));
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation();
      close.current();
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  const cardsById = useMemo(() => new Map(cards.map(item => [item.cardId, item])), [cards]);
  const keywords = card ? cardKeywords(card, language) : [];
  const relatedCards = (card ? cardRelations(card) : []).flatMap(relation => {
    const related = cardsById.get(relation.cardId);
    return related ? [{ ...relation, card: related }] : [];
  });
  if (!card && !headquarters) return null;
  const title = card ? cardDisplayTitle(card, language) : headquarters!.name;
  const type = (card?.json.type || '').toLowerCase();
  const isUnit = !['order', 'countermeasure'].includes(type);
  const rarity = ({ Standard: '普通', Limited: '稀有', Special: '罕见', Elite: '精英' })[card?.json.rarity || ''] || card?.json.rarity || headquarters?.rarity || '—';
  const setName = card ? expansionOptions([card.json.set || ''], language).find(option => option.value === card.json.set)?.label || card.json.set || '—' : '';
  const faction = card?.json.faction || (headquarters?.nation === 'Blank' ? 'Neutral' : headquarters?.nation) || 'Neutral';
  return createPortal(<div className="card-detail-overlay">
    <div className="card-detail-backdrop" onClick={onClose} />
    <section ref={panel} role="dialog" aria-modal="true" aria-label={'卡牌详情：' + title}
      tabIndex={-1} onKeyDown={handleDialogKeys} onClick={event => {
        if (!(event.target as HTMLElement).closest('.card-detail-panel, .card-detail-art, .card-detail-close')) onClose();
      }} className="card-detail-dialog custom-scrollbar">
      <button data-dialog-cancel aria-label="关闭卡牌详情" onClick={onClose} className="card-detail-close"><X className="h-5 w-5" /></button>
      <div className="card-detail-layout">
        <aside className="card-detail-panel custom-scrollbar">
          <h2 className="flex items-center gap-3 text-lg font-bold"><span className="h-7 w-7">{card ? <FilterIcon name={type + '.svg'} /> : <Shield className="h-7 w-7" />}</span>{card ? typeLabel(type) : '总部'}</h2>
          <div className="mt-4 flex items-center gap-3 text-sm"><span className="h-6 w-6"><FilterIcon name={faction.toLowerCase() + '.svg'} fullColor={faction === 'Neutral'} /></span>{factionLabel(faction)}</div>
          {keywords.length > 0 && <section className="card-detail-section">
            <h3 className="mb-3 font-bold">关键词</h3>
            <ul className="space-y-3 text-sm text-kards-text">{keywords.map(keyword => <li key={keyword}>{keyword}</li>)}</ul>
          </section>}
          {card ? <section className="card-detail-section space-y-3 text-sm">
            <div className="flex items-center gap-2">{card.reserved && <ReservedBadge />}{card.reserved ? '预备卡' : '现役'}</div>
            <p>{isVeteranCard(card) ? '老兵形态' : isGeneratedCard(card) ? '衍生卡' : '可构筑'}</p>
            <p>{card.json.permanent_pool ? '常备卡池' : '轮换卡池'}</p>
          </section> : <section className="card-detail-section text-sm"><p>{rarity}</p></section>}
        </aside>
        <div className="card-detail-art">{card ? <CardFace card={card} /> : <img src={headquarters!.image} alt={title} className="card-face" />}</div>
        <div className="card-detail-panel custom-scrollbar">
          <h1 className="text-2xl font-bold">{title}</h1>
          {card && cardText(card, language) && <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-kards-text"><CardText text={cardText(card, language)} /></p>}
          {card && <dl className="card-detail-section grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-3 text-sm">
            <dt>部署费用</dt><dd>{card.json.kredits ?? '—'} K</dd>
            {isUnit && <><dt>行动费用</dt><dd>{card.json.operationCost ?? '—'} K</dd><dt>攻击 / 生命</dt><dd>{card.json.attack ?? '—'} / {card.json.defense ?? '—'}</dd></>}
            <dt>稀有度</dt><dd>{rarity}</dd>
            <dt>扩展包</dt><dd>{setName}</dd>
            <dt>卡组码编号</dt><dd>{card.importId}</dd>
            <dt>卡牌 ID</dt><dd className="break-all">{card.cardId}</dd>
          </dl>}
          {!card && headquarters?.brief && <p className="mt-4 text-sm leading-7">{headquarters.brief}</p>}
          {!card && headquarters?.history && <section className="card-detail-section"><h3 className="mb-3 font-bold">历史背景</h3><p className="whitespace-pre-wrap text-sm leading-7">{headquarters.history}</p></section>}
          {relatedCards.length > 0 && <section className="card-detail-section">
            <h3 className="mb-3 font-bold">关联卡牌</h3>
            <div className="flex flex-wrap gap-3">{relatedCards.map(related => <button key={related.label + related.cardId} type="button"
              title={related.label + '：' + cardDisplayTitle(related.card, language)} aria-label={related.label + '：' + cardDisplayTitle(related.card, language)}
              onClick={() => setCard(related.card)} className="card-action w-[86px]"><CardFace card={related.card} /></button>)}</div>
          </section>}
        </div>
      </div>
    </section>
  </div>, document.body);
}
