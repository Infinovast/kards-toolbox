import QRCode from 'qrcode';
import { decodeDeckCode } from './deckCode';
import { extractDeckCodeFromText } from './deckImport';
import { headquartersForDeck, headquartersOptions } from './cardAssets';

export interface ImageDeckCode { code: string; headquartersId?: string; name?: string; }

/** Only catalogue headquarters IDs and a validated game code cross the image boundary. */
export function readImageDeckCode(text: string): ImageDeckCode | null {
  try {
    let code = text, headquartersId: string | undefined, name: string | undefined;
    if (text.trim().startsWith('{')) {
      const payload = JSON.parse(text);
      if (payload.version !== 1 || typeof payload.code !== 'string' || typeof payload.headquartersId !== 'string') return null;
      code = payload.code;
      headquartersId = payload.headquartersId;
      if (typeof payload.name === 'string' && payload.name.trim()) name = payload.name.trim().slice(0, 100);
    }
    code = extractDeckCodeFromText(code);
    const deck = decodeDeckCode(code);
    if (!deck.counts.size) return null;
    if (headquartersId && !headquartersOptions(deck.mainNation).some(item => item.groupId === headquartersId)) return null;
    return { code, headquartersId, ...(name ? { name } : {}) };
  } catch { return null; }
}

export function deckQrSvg(code: string, headquartersId?: string, name?: string) {
  const deck = decodeDeckCode(code);
  const headquarters = headquartersForDeck(headquartersId, deck.mainNation);
  const payload = JSON.stringify({ version: 1, headquartersId: headquarters?.groupId || '', code, ...(name?.trim() ? { name: name.trim().slice(0, 100) } : {}) });
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const side = modules.size;
  const pixels = Math.round(side * Math.max(1, Math.floor(176 / side)) * 0.9);
  let path = '';
  for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
    if (modules.get(y, x)) path += `M${x} ${y}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><path d="${path}" fill="#fff"/></svg>`;
}
