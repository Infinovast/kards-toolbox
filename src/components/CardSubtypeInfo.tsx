import type { CardLanguage } from '../types/card';
import { cardSubtypes } from '../lib/cardSubtypes';
import { SUBCLASS_ICONS } from '../lib/assetCatalog';
import { FilterIcon } from './CardFilterSelects';

export default function CardSubtypeInfo({ cardId, language }: { cardId: string; language: CardLanguage }) {
  const subtypes = cardSubtypes(cardId);
  if (!subtypes.length) return null;
  return <><dt>子类</dt><dd className="flex flex-wrap items-center gap-2">{subtypes.map(subtype => <span key={subtype.id} className="inline-flex items-center gap-1">
    <span className="h-5 w-5"><FilterIcon src={SUBCLASS_ICONS[subtype.id]} /></span>{subtype.name[language] || subtype.name['en-EN']}
  </span>)}</dd></>;
}
