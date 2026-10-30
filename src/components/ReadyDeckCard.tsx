import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import type { ReadyDeck } from '../data/readyDecks';
import { CARD_BACKS, defaultHeadquartersForNation } from '../lib/cardAssets';
import { cacheCardImage } from '../lib/cardImages';
import { decodeDeckCode } from '../lib/deckCode';
import { cardDisplayTitle, factionLabel, type KardsCardRecord } from '../types/card';
import { CARD_STRIP_NATIONS } from './DeckCardStrip';
import { RARITY_SLOTS } from './CardFace';
import { FilterIcon } from './CardFilterSelects';
import { factionIcon, WILDCARDS } from '../lib/assetCatalog';

const RARITIES = [
  { id: 'Elite', label: '精英' }, { id: 'Special', label: '罕见' },
  { id: 'Limited', label: '稀有' }, { id: 'Standard', label: '普通' },
];

export default function ReadyDeckCard({ deck, cardsById, selected, onSelect }: {
  deck: ReadyDeck;
  cardsById: Map<string, KardsCardRecord>;
  selected: boolean;
  onSelect: () => void;
}) {
  const summary = useMemo(() => {
    const decoded = decodeDeckCode(deck.code);
    const curve = Array<number>(8).fill(0);
    const rarities: Record<string, number> = {};
    let mainCount = 1, allyCount = 0;
    let featured: KardsCardRecord | undefined;
    for (const [id, count] of decoded.counts) {
      const card = cardsById.get(id);
      if (!card) continue;
      const faction = card.json.faction?.toLowerCase();
      if (faction === decoded.mainNation.toLowerCase()) mainCount += count;
      else if (faction === decoded.allyNation.toLowerCase()) allyCount += count;
      curve[Math.min(7, Math.max(0, card.json.kredits || 0))] += count;
      const rarity = card.json.rarity || 'Standard';
      rarities[rarity] = (rarities[rarity] || 0) + count;
      if (faction === decoded.mainNation.toLowerCase() && (!featured
        || (RARITY_SLOTS[rarity]?.max || 4) < (RARITY_SLOTS[featured.json.rarity || 'Standard']?.max || 4))) featured = card;
    }
    return { ...decoded, curve, rarities, mainCount, allyCount, featured };
  }, [deck.code, cardsById]);
  const [art, setArt] = useState('');
  useEffect(() => {
    let active = true;
    setArt('');
    if (summary.featured) void cacheCardImage(summary.featured).then(source => {
      if (active) setArt(source);
    }).catch(() => {});
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
      <span className="ready-deck-rarities">
        {RARITIES.map(rarity => {
          const wildcard = WILDCARDS.Common[rarity.id], crop = wildcard.crop;
          return <span key={rarity.id} title={`${rarity.label} ${summary.rarities[rarity.id] || 0} 张`}>
            <span className="ready-deck-rarity-icon"><img src={wildcard.file} alt={rarity.label}
              style={{ width: `${100 / crop.width}%`, height: `${100 / crop.height}%`, left: `${-100 * crop.x / crop.width}%`, top: `${-100 * crop.y / crop.height}%` }} /></span>
            <span>{summary.rarities[rarity.id] || 0}</span>
          </span>;
        })}
      </span>
    </span>
  </button>;
}
