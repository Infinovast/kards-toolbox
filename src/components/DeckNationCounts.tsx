import { factionIcon } from '../lib/assetCatalog';
import { factionLabel } from '../types/card';

export default function DeckNationCounts({ mainNation, allyNation, mainCount, allyCount }: {
  mainNation: string;
  allyNation?: string;
  mainCount: number;
  allyCount: number;
}) {
  const showAlly = Boolean(allyNation && allyCount > 0);
  return <span className="deck-nation-counts" aria-label={`主国 ${factionLabel(mainNation)} ${mainCount} 张${showAlly ? `，盟国 ${factionLabel(allyNation)} ${allyCount} 张` : ''}`}>
    <span><img src={factionIcon(mainNation)} alt="" />{mainCount}</span>
    {showAlly && <span><img src={factionIcon(allyNation)} alt="" />{allyCount}</span>}
  </span>;
}
