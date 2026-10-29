import QRCode from 'qrcode';
import { decodeDeckCode } from './deckCode';
import { extractDeckCodeFromText } from './deckImport';
import { CARD_BACKS, cardBackIsAvailable, defaultCardBackForNation, headquartersForDeck, headquartersOptions } from './cardAssets';

export interface ImageDeckCode { code: string; headquartersId?: string; cardBackId?: string; name?: string; }

function imageCardBackId(value: unknown, mainNation: string, allyNation: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  // Custom artwork stays local; only its bounded local identifier enters the QR.
  if (/^custom:[\w.-]{1,100}$/.test(value)) return value;
  return CARD_BACKS.find(back => back.id === value && cardBackIsAvailable(back, mainNation, allyNation))?.id;
}

/** Image metadata resolves against bundled assets or existing local custom backs. */
export function readImageDeckCode(text: string): ImageDeckCode | null {
  try {
    let code = text, headquartersId: string | undefined, name: string | undefined;
    let requestedCardBack: unknown;
    if (text.trim().startsWith('{')) {
      const payload = JSON.parse(text);
      if (payload.version !== 1 || typeof payload.code !== 'string' || typeof payload.headquartersId !== 'string') return null;
      code = payload.code;
      headquartersId = payload.headquartersId;
      requestedCardBack = payload.cardBackId;
      if (typeof payload.name === 'string' && payload.name.trim()) name = payload.name.trim().slice(0, 100);
    }
    code = extractDeckCodeFromText(code);
    const deck = decodeDeckCode(code);
    if (!deck.counts.size) return null;
    if (headquartersId && !headquartersOptions(deck.mainNation).some(item => item.groupId === headquartersId)) return null;
    const cardBackId = imageCardBackId(requestedCardBack, deck.mainNation, deck.allyNation);
    return { code, headquartersId, ...(cardBackId ? { cardBackId } : {}), ...(name ? { name } : {}) };
  } catch { return null; }
}

export function deckQrSvg(code: string, headquartersId?: string, name?: string, cardBackId?: string) {
  const deck = decodeDeckCode(code);
  const headquarters = headquartersForDeck(headquartersId, deck.mainNation);
  const backId = imageCardBackId(cardBackId, deck.mainNation, deck.allyNation)
    || CARD_BACKS.find(back => back.file === defaultCardBackForNation(deck.mainNation))?.id;
  const payload = JSON.stringify({ version: 1, headquartersId: headquarters?.groupId || '', cardBackId: backId, code, ...(name?.trim() ? { name: name.trim().slice(0, 100) } : {}) });
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const side = modules.size;
  const pixels = Math.round(side * Math.max(1, Math.floor(176 / side)) * 0.9);
  let path = '';
  for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
    if (modules.get(y, x)) path += `M${x} ${y}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges"><path d="${path}" fill="#fff"/></svg>`;
}
