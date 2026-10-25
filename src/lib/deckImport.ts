const DECK_CODE_CHAR_PATTERN = /[A-Za-z0-9|;%]/;

const NON_TITLE_PREFIXES = [
  'major power:',
  'ally:',
  'hq:',
];

const NON_TITLE_SECTION_PATTERN = /^[a-z]+:\s*$/i;
const CARD_LINE_PATTERN = /^\d+x\s+\(\d+K\)\s+/i;

export function extractDeckCodeFromText(input: string) {
  const start = input.indexOf('%%');
  if (start === -1) return input.trim();

  let end = start;
  while (end < input.length && DECK_CODE_CHAR_PATTERN.test(input[end])) {
    end += 1;
  }

  return input.slice(start, end).trim();
}

function looksLikeDeckTitle(line: string) {
  const normalized = line.trim();
  const lower = normalized.toLowerCase();

  if (!normalized || normalized.length > 40) return false;
  if (normalized.startsWith('%%')) return false;
  if (NON_TITLE_PREFIXES.some(prefix => lower.startsWith(prefix))) return false;
  if (NON_TITLE_SECTION_PATTERN.test(normalized)) return false;
  if (CARD_LINE_PATTERN.test(normalized)) return false;

  return true;
}

export function inferDeckTitleFromText(input: string, extractedCode: string) {
  const codeIndex = input.indexOf(extractedCode);
  const titleScope = codeIndex === -1 ? input : input.slice(0, codeIndex);
  const firstNonEmptyLine = titleScope
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(Boolean);

  return firstNonEmptyLine && looksLikeDeckTitle(firstNonEmptyLine) ? firstNonEmptyLine : '';
}
