import type { KardsCardRecord } from '../types/card';
import { extractDeckCodeFromText } from './deckImport';

const FACTION_CODE_ORDER = ['Germany', 'Britain', 'Japan', 'Soviet', 'USA', 'France', 'Italy', 'Poland', 'Finland', 'Anzac'];

export interface DecodedDeckCode {
  mainNation: string;
  allyNation: string;
  counts: Map<string, number>;
}

export function decodeDeckCode(rawCode: string): DecodedDeckCode {
  const code = extractDeckCodeFromText(rawCode);
  if (!code.startsWith('%%')) throw new Error('卡组码需要以 %% 开头');
  const separator = code.indexOf('|');
  if (separator !== 4) throw new Error('国家代码格式无效');

  const decodeNation = (character: string) => {
    const value = character.toLowerCase() === 'a' ? 10 : Number(character);
    if (!Number.isInteger(value) || value < 1 || value > FACTION_CODE_ORDER.length) throw new Error('卡组码中的国家编号无效');
    return FACTION_CODE_ORDER[value - 1];
  };

  const sections = code.slice(separator + 1).split(';');
  if (sections.length !== 4) throw new Error('卡组码需要包含四组卡牌数量（1、2、3、4 张）');
  const counts = new Map<string, number>();
  sections.forEach((section, index) => {
    if (section.length % 2 !== 0 || /[^a-zA-Z0-9]/.test(section)) throw new Error('卡组码中的卡牌编号格式无效');
    for (let cursor = 0; cursor < section.length; cursor += 2) {
      const importId = section.slice(cursor, cursor + 2);
      counts.set(importId, (counts.get(importId) || 0) + index + 1);
    }
  });

  return {
    mainNation: decodeNation(code[2]),
    allyNation: decodeNation(code[3]),
    counts,
  };
}

export function encodeDeckCode(mainNation: string, allyNation: string, counts: Map<string, number>): string {
  const codeForFaction = (faction: string) => {
    const index = FACTION_CODE_ORDER.findIndex((item) => item.toLowerCase() === faction.toLowerCase());
    if (index < 0) throw new Error(`无法导出阵营：${faction}`);
    return index === 9 ? 'a' : String(index + 1);
  };

  const sections = ['', '', '', ''];
  for (const [importId, count] of counts) {
    if (!/^[a-zA-Z0-9]{2}$/.test(importId)) throw new Error(`卡牌编号无法写入卡组码：${importId}`);
    if (!Number.isInteger(count) || count < 1 || count > 999) throw new Error(`${importId} 的数量必须是 1 到 999 的整数`);
    // 与原构筑器一致：超过四张时重复写入四张区段，再编码余数。
    sections[3] += importId.repeat(Math.floor(count / 4));
    if (count % 4) sections[count % 4 - 1] += importId;
  }

  return `%%${codeForFaction(mainNation)}${codeForFaction(allyNation)}|${sections.join(';')}`;
}

export function findCardsByImportId(cards: KardsCardRecord[]): Map<string, KardsCardRecord> {
  return new Map(cards.map((card) => [card.importId, card]));
}
