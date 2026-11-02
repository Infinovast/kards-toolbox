import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import type { ReadyDeck } from '../data/readyDecks';
import { CARD_BACKS, defaultHeadquartersForNation } from '../lib/cardAssets';
import { cacheCardImage } from '../lib/cardImages';
import { summarizeDeckCover } from '../lib/deckCover';
import { cardDisplayTitle, factionLabel, type KardsCardRecord } from '../types/card';
import { CARD_STRIP_NATIONS } from './DeckCardStrip';
import { FilterIcon } from './CardFilterSelects';
import { factionIcon } from '../lib/assetCatalog';
import DeckRaritySummary from './DeckRaritySummary';

export default function ReadyDeckCard({ deck, cardsById, selected, onSelect }: {
  deck: ReadyDeck;
  cardsById: Map<string, KardsCardRecord>;
  selected: boolean;
  onSelect: () => void;
}) {
  const summary = useMemo(() => summarizeDeckCover(deck.code, cardsById), [deck.code, cardsById]);
  const [art, setArt] = useState('');
  useEffect(() => {
    let active = true;
    setArt('');
    if (summary.featured) void cacheCardImage(summary.featured).then(source => {
      if (active) setArt(source);
    }).catch(() => { });
    return () => { active = false; };
  }, [summary.featured]);
  const headquarters = defaultHeadquartersForNation(summary.mainNation);
  const appearance = CARD_STRIP_NATIONS[summary.mainNation] || CARD_STRIP_NATIONS.Neutral;
  const tallest = Math.max(1, ...summary.curve);
  return <button type="button" aria-label={deck.name} aria-pressed={selected} onClick={onSelect}
    className="ready-deck-card" style={{ '--ready-deck-color': appearance.color } as CSSProperties}>
    <img className="ready-deck-watermark" src={factionIcon(summary.mainNation, 'white')} alt="" aria-hidden="true" />
    <span className="ready-deck-header">
      <span className="ready-deck-header-icon" role="img" aria-label={factionLabel(summary.mainNation)}>
        <img src={appearance.icon} alt="" />
      </span>
      <span className="ready-deck-title">{deck.name}</span>
      {selected && <Check className="ready-deck-check" aria-hidden="true" />}
    </span>
    <span className="ready-deck-content">
      <span className="ready-deck-nations">
        <span><strong>{factionLabel(summary.mainNation)}</strong><span className="ready-deck-nation-count">（{summary.mainCount}）</span></span>
        {summary.allyNation !== summary.mainNation && <span className="ready-deck-ally">
          <span className="ready-deck-ally-icon" aria-hidden="true"><FilterIcon src={factionIcon(summary.allyNation, 'white')} /></span>
          <span>{factionLabel(summary.allyNation)}</span><span className="ready-deck-nation-count">（{summary.allyCount}）</span>
        </span>}
      </span>
      <span className="ready-deck-curve" role="img" aria-label={`费用曲线：${summary.curve.map((count, cost) => `${cost === 7 ? '7+' : cost} 费 ${count} 张`).join('，')}`}>
        {summary.curve.map((count, cost) => <span key={cost} className="ready-deck-curve-column" title={`${cost === 7 ? '7+' : cost}K：${count} 张`}>
          <span className="ready-deck-curve-track"><span style={{ height: `${count / tallest * 100}%` }} /></span>
          <span>{cost === 7 ? '7+' : cost}</span>
        </span>)}
      </span>
      <span className="ready-deck-art" aria-hidden="true">
        <img className="ready-deck-art-back" src={CARD_BACKS.find(back => back.id === deck.cardBackId)?.file} alt="" />
        {(art || headquarters) && <img className="ready-deck-art-front" src={art || headquarters!.image}
          alt={art && summary.featured ? cardDisplayTitle(summary.featured, 'zh-Hans') : headquarters?.name || ''}
          onError={art ? () => setArt('') : undefined} />}
      </span>
    </span>
    <span className="ready-deck-footer">
      <DeckRaritySummary rarities={summary.rarities} />
    </span>
  </button>;
}
