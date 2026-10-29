import type { KardsCardRecord } from '../types/card';
import { decodeDeckCode, encodeDeckCode } from './deckCode';
import { isGeneratedCard } from './cardFilters';
import { HEADQUARTERS } from './cardAssets';
import { inferDeckTitleFromText } from './deckImport';
import { readImageDeckCode, type ImageDeckCode } from './deckImageCode';

export interface WindowsOcrResult { passes: { language: string; lines: string[] }[]; }
export interface ImageDeckResult extends ImageDeckCode { source: 'qr' | 'ocr'; total: number; }
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** OCR is deliberately conservative: ambiguous names never select a different card. */
export function deckFromOcrLines(lines: string[], cards: KardsCardRecord[]): ImageDeckCode | null {
  const encoded = readImageDeckCode(lines.join('\n'));
  if (encoded) {
    const name = inferDeckTitleFromText(lines.join('\n'), encoded.code);
    return { ...encoded, ...(name ? { name } : {}) };
  }
  const names = new Map<string, KardsCardRecord[]>();
  for (const card of cards) {
    if (isGeneratedCard(card)) continue;
    for (const name of new Set(Object.values(card.json.title || {}).map(normalize).filter(Boolean))) {
      const entries = names.get(name) || [];
      entries.push(card); names.set(name, entries);
    }
  }
  const counts = new Map<string, number>();
  let firstCardLine = lines.length;
  for (const [lineIndex, rawLine] of lines.entries()) {
    // Game share lists and screenshots use either "3x (2K) Name" or "Name x3".
    let line = rawLine.normalize('NFKC').trim(), count = 1;
    const prefix = line.match(/^(\d{1,2})\s*[x×*]\s*/i);
    const suffix = line.match(/\s*[x×*]\s*(\d{1,2})\s*$/i);
    if (prefix) { count = Number(prefix[1]); line = line.slice(prefix[0].length); }
    else if (suffix) { count = Number(suffix[1]); line = line.slice(0, -suffix[0].length); }
    line = line.replace(/^\(?\s*\d+\s*K\s*\)?\s*/i, '');
    if (!count || count > 40) continue;
    const matches = names.get(normalize(line));
    if (matches?.length === 1) {
      firstCardLine = Math.min(firstCardLine, lineIndex);
      counts.set(matches[0].importId, (counts.get(matches[0].importId) || 0) + count);
    }
  }
  if (!counts.size) return null;
  const factions = new Map<string, number>();
  for (const card of cards) {
    const count = counts.get(card.importId);
    if (count && card.json.faction && card.json.faction !== 'Neutral') factions.set(card.json.faction, (factions.get(card.json.faction) || 0) + count);
  }
  const majorNations = ['Britain', 'Germany', 'Soviet', 'Japan', 'USA'];
  const ordered = [...factions].sort((a, b) => b[1] - a[1]);
  const main = ordered.find(([nation]) => majorNations.includes(nation))?.[0];
  if (!main || ordered.length > 2) return null;
  const ally = ordered.find(([nation]) => nation !== main)?.[0] || main;
  const code = encodeDeckCode(main, ally, counts);
  const headquartersId = HEADQUARTERS.find(item => item.nation === main && lines.some(line => [item.name, item.englishName].some(name => normalize(name) === normalize(line))))?.groupId;
  const name = lines.slice(0, firstCardLine).map(line => line.trim()).find(line =>
    line.length <= 100 && /\p{L}/u.test(line) && !/^\s*(?:kards(?:\s*(?:toolbox|工具箱|卡组))?|major power:.*|ally:.*|hq:.*|主国[:：].*|盟国[:：].*|总部[:：].*)\s*$/i.test(line)
    && !HEADQUARTERS.some(item => [item.name, item.englishName].some(title => normalize(title) === normalize(line))));
  return { code, headquartersId, ...(name ? { name } : {}) };
}

export function decodeImageQr(file: Blob, signal?: AbortSignal): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('已取消', 'AbortError')); return; }
    const worker = new Worker(new URL('./deckImageQr.worker.ts', import.meta.url), { type: 'module' });
    const finish = (result: string | null) => { cleanup(); resolve(result); };
    const abort = () => { cleanup(); reject(new DOMException('已取消', 'AbortError')); };
    const timeout = window.setTimeout(() => finish(null), 20000);
    const cleanup = () => { worker.terminate(); window.clearTimeout(timeout); signal?.removeEventListener('abort', abort); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = event => finish(typeof event.data === 'string' ? event.data : null);
    worker.onerror = () => finish(null);
    worker.postMessage(file);
  });
}

export async function importDeckImage(file: File, cards: KardsCardRecord[], onStage: (stage: string) => void, signal?: AbortSignal): Promise<ImageDeckResult> {
  if (file.size > 25 * 1024 * 1024) throw new Error('卡组图片不能超过 25 MB');
  onStage('识别二维码…');
  const qr = await decodeImageQr(file, signal);
  const decoded = qr ? readImageDeckCode(qr) : null;
  const total = (code: string) => 1 + [...decodeDeckCode(code).counts.values()].reduce((sum, count) => sum + count, 0);
  if (decoded) return { ...decoded, source: 'qr', total: total(decoded.code) };
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  if (!window.kardsDesktop?.recognizeDeckImage) throw new Error('无法识别卡组图片；Windows 文字识别需在桌面应用中使用');
  onStage('识别卡牌文字…');
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('无法读取卡组图片')); reader.readAsDataURL(file);
  });
  try {
    const result = await window.kardsDesktop.recognizeDeckImage(data);
    if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
    const candidates = result.passes.flatMap(pass => { const deck = deckFromOcrLines(pass.lines, cards); return deck ? [deck] : []; });
    const best = candidates.sort((a, b) => total(b.code) - total(a.code))[0];
    if (best) return { ...best, source: 'ocr', total: total(best.code) };
  } catch (error) { if (signal?.aborted) throw error; }
  throw new Error('无法识别卡组图片');
}
