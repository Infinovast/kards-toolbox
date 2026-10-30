import type { DeckRenderRequest } from './deckRenderTypes';

// Both renderers share the same counter geometry and count the headquarters once.
export function deckRenderCounterSvg(request: DeckRenderRequest, icons: { main: string; ally: string; total: string }) {
  const main = request.mainNation.toLowerCase(), ally = request.allyNation.toLowerCase();
  const mainCount = 1 + request.cards.reduce((sum, card) => sum + (card.faction?.toLowerCase() === main ? card.count : 0), 0);
  const allyCount = main === ally ? 0 : request.cards.reduce((sum, card) => sum + (card.faction?.toLowerCase() === ally ? card.count : 0), 0);
  const total = 1 + request.cards.reduce((sum, card) => sum + card.count, 0), limit = request.limit ?? 40;
  const allyX = 60 + String(mainCount).length * 30 + 36;
  const totalX = allyX + 60 + String(allyCount).length * 30 + 36;
  const width = totalX + 60 + `${total}/${limit}`.length * 30;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="56">
    <g fill="#f2ead6" font-family="Microsoft YaHei,Arial,sans-serif" font-size="48" font-weight="700">
      <image x="0" y="4" width="48" height="48" xlink:href="${icons.main}"/>
      <text x="60" y="45">${mainCount}</text>
      <g transform="translate(${allyX} 0)">
        ${main === ally ? '<rect x="2" y="11" width="44" height="34" fill="none" stroke="#f2ead6"/>' : `<image x="0" y="4" width="48" height="48" xlink:href="${icons.ally}"/>`}
        <text x="60" y="45">${allyCount}</text>
      </g>
      <g transform="translate(${totalX} 0)">
        <image x="0" y="4" width="48" height="48" xlink:href="${icons.total}"/>
        <text x="60" y="45"><tspan fill="${total > limit ? '#dc4545' : '#f2ead6'}">${total}</tspan><tspan>/${limit}</tspan></text>
      </g>
    </g>
  </svg>`;
}
