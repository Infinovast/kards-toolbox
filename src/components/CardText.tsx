import type { ReactNode } from 'react';

const KEYWORDS = /情报(?:X|\d+)|重甲(?:X|\d+)|被收缴|部署|亡计|伏击|免疫|动员|压制|奋战|守护|山地|情报|控制|流亡|烟幕|重甲|钳击|闪击|收缴|撤退|抑制|转换|抉择|冲击|协力|开发|战斗(?!机)|抽取|老兵|隐蔽|预报/gu;

export function CardText({ text }: { text: string }) {
  const result: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(KEYWORDS)) {
    const index = match.index ?? 0;
    if (index > cursor) result.push(text.slice(cursor, index));
    result.push(<strong key={index} className="font-bold text-kards-text">{match[0]}</strong>);
    cursor = index + match[0].length;
  }
  if (cursor < text.length) result.push(text.slice(cursor));
  return <>{result}</>;
}
