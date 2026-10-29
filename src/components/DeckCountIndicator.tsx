import { FilterIcon } from './CardFilterSelects';

function nationIcon(nation: string) {
  return <FilterIcon name={`${nation.toLowerCase()}.svg`} fullColor={nation.toLowerCase() === 'neutral'} />;
}

export default function DeckCountIndicator({ mainNation, allyNation, mainCount, allyCount, total, limit, compact = false }: {
  mainNation: string;
  allyNation?: string;
  mainCount: number;
  allyCount: number;
  total: number;
  limit: number;
  compact?: boolean;
}) {
  const overLimit = total > limit;
  return <div className={`deck-count-indicator${compact ? ' deck-count-compact' : ''}`} aria-label={`主国 ${mainCount} 张，盟国 ${allyCount} 张，总牌数 ${total} / ${limit}`}>
    <div className="deck-count-nation" title="主国牌数">
      <span className="deck-count-icon">{nationIcon(mainNation)}</span>
      <strong>{mainCount}</strong>
    </div>
    <div className="deck-count-nation" title="盟国牌数">
      <span className="deck-count-icon">{allyNation && allyNation !== mainNation ? nationIcon(allyNation) : <span className="deck-count-empty-icon" aria-hidden="true" />}</span>
      <strong>{allyCount}</strong>
    </div>
    <div className={`deck-count-total ${overLimit ? 'is-over' : ''}`} title="总牌数 / 上限">
      <span className="deck-count-icon" aria-hidden="true">
        <img src="./assets/kards_logos/KardsLogoBlack_cards.png" alt="" className="deck-count-logo-light" />
        <img src="./assets/kards_logos/KardsLogoWhite_cards.png" alt="" className="deck-count-logo-dark" />
      </span>
      <span className="deck-count-value"><strong>{total}</strong><span>/{limit}</span></span>
    </div>
  </div>;
}
