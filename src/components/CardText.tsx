import type { ReactNode } from 'react';
import { CARD_TEXT_KEYWORDS } from '../lib/cardKeywords';

export function CardText({ text }: { text: string }) {
  const result: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(CARD_TEXT_KEYWORDS)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push(text.slice(cursor, index));
    result.push(<strong key={index} className="font-bold text-kards-text">{match[0]}</strong>);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return <>{result}</>;
}
