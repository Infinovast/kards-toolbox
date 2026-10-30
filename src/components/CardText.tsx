import type { ReactNode } from 'react';
import { cardTextKeywordMatches } from '../lib/cardKeywords';

export function CardText({ text }: { text: string }) {
  const result: ReactNode[] = [];
  let cursor = 0;
  for (const match of cardTextKeywordMatches(text)) {
    const index = match.index;
    if (index > cursor) result.push(text.slice(cursor, index));
    result.push(<strong key={index} className={`font-bold ${match.highlighted ? 'text-kards-status' : 'text-kards-text'}`}>{match.text}</strong>);
    cursor = index + match.text.length;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return <>{result}</>;
}
