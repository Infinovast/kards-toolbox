import type { CardLanguage, KardsCardRecord } from '../types/card';
import { cardKeywordItems } from '../lib/cardKeywords';
import { CardText } from './CardText';

export default function CardKeywordList({ card, language, className = '' }: { card: KardsCardRecord; language: CardLanguage; className?: string }) {
  const items = cardKeywordItems(card, language);
  if (!items.length) return null;
  return <p aria-label="卡牌词条" className={className}>{items.map((item, index) => <span key={item.label}>
    {index > 0 && '，'}<span className="card-keyword">{item.icon && <img src={item.icon} alt="" className="keyword-symbol" />}<CardText text={item.label} highlightCombat /></span>
  </span>)}</p>;
}
