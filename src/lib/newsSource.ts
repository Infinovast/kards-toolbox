export const NEWS_SOURCE = 'https://www.kardsplayer.com/zh/news';

const articlePath = /^\/zh\/news\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' });
const articleTags = [
  'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'del', 's', 'u', 'sup', 'sub',
  'b', 'i', 'blockquote', 'code', 'pre', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'br', 'hr',
] as const;
type ArticleTag = typeof articleTags[number];
export type NewsEntry = { id: string; title: string; summary: string; date: string };
export type NewsImage = { src: string; label: string; width?: number; height?: number };
export type NewsContent = string
  | { type: 'image'; image: NewsImage }
  | { type: 'link'; url: string; articleId?: string; children: NewsContent[] }
  | { type: 'tag'; tag: ArticleTag; children: NewsContent[] };
export type NewsArticle = { title: string; date: string; cover?: NewsImage; body: NewsContent[] };

function record(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
}

function* properties(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const child of node) yield* properties(child);
  } else {
    const props = record(node);
    if (!props) return;
    yield props;
    for (const child of Object.values(props)) yield* properties(child);
  }
}

function readRows(html: string) {
  // Read the embedded Next.js data as JSON and render only supported article elements.
  const stream = Array.from(html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)<\/script>/g),
    ([, payload]) => JSON.parse(payload) as string).join('');
  const rows = new Map<string, unknown>();
  for (const line of stream.split('\n')) {
    const match = /^([a-f\d]+):([\[{"].*)$/.exec(line);
    if (!match) continue;
    try { rows.set(match[1], JSON.parse(match[2])); } catch { /* Ignore incomplete or non-JSON stream rows. */ }
  }
  return rows;
}

function dateStamp(node: unknown) {
  const date = Array.isArray(node) ? record(node[3])?.date : undefined;
  return typeof date === 'string' ? Date.parse(date) : NaN;
}

export function parseNewsIndex(html: string): NewsEntry[] {
  const entries = new Map<string, { title: string; summary: string; stamp: number }>();
  for (const node of properties([...readRows(html).values()])) {
    if (typeof node.title !== 'string' || typeof node.summary !== 'string') continue;
    const href = record(node.link)?.href;
    const id = typeof href === 'string' ? articlePath.exec(href)?.[1] : undefined;
    const stamp = dateStamp(node.date);
    if (id && Number.isFinite(stamp) && !entries.has(id)) entries.set(id, { title: node.title, summary: node.summary.trim(), stamp });
  }
  if (!entries.size) throw new Error('官网新闻列表为空');
  return Array.from(entries, ([id, entry]) => ({ id, ...entry })).sort((a, b) => b.stamp - a.stamp)
    .map(({ stamp, ...entry }) => ({ ...entry, date: dateFormat.format(stamp) }));
}

function webUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return;
  try {
    const url = new URL(value, NEWS_SOURCE);
    if ((url.protocol === 'https:' || url.protocol === 'http:') && !url.username && !url.password) return url;
  } catch { /* Ignore invalid source links. */ }
}

function dimension(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function newsImage(source: unknown, alt: unknown, width?: unknown, height?: unknown): NewsImage | undefined {
  const url = webUrl(source);
  if (!url) return;
  return { src: url.href, label: typeof alt === 'string' ? alt.trim() : '', width: dimension(width), height: dimension(height) };
}

function readContent(node: unknown, rows: Map<string, unknown>, ancestors = new Set<string>()): NewsContent[] {
  const read = (child: unknown) => readContent(child, rows, ancestors);
  if (typeof node === 'string') {
    if (node.startsWith('$$')) return [node.slice(1)];
    const ref = /^\$L?([a-f\d]+)$/.exec(node)?.[1];
    if (ref) return rows.has(ref) && !ancestors.has(ref) ? readContent(rows.get(ref), rows, new Set([...ancestors, ref])) : [];
    return node === '$undefined' ? [] : [node];
  }
  if (!Array.isArray(node)) return [];
  if (node[0] !== '$') return node.flatMap(read);
  const tag: unknown = node[1];
  const props = record(node[3]);
  if (!props) return [];

  if (Array.isArray(props.images)) return props.images.flatMap((item: unknown) => {
    const data = record(item);
    const image = newsImage(data?.url, data?.alt, data?.width, data?.height);
    return image ? [{ type: 'image', image }] : [];
  });
  if (tag === 'img') {
    const image = newsImage(props.src, props.alt, props.width, props.height);
    return image ? [{ type: 'image', image }] : [];
  }
  const children = read(props.children);
  const url = webUrl(props.href ?? record(props.embed)?.url);
  if (url) {
    const articleId = url.origin === new URL(NEWS_SOURCE).origin ? articlePath.exec(url.pathname)?.[1] : undefined;
    return [{ type: 'link', url: url.href, articleId, children }];
  }
  if (articleTags.includes(tag as ArticleTag)) return [{ type: 'tag', tag: tag as ArticleTag, children }];
  return children;
}

export function parseNewsArticle(html: string): NewsArticle {
  const rows = readRows(html);
  const nodes = [...properties([...rows.values()])];
  const withClass = (name: string) => nodes.find(node => typeof node.className === 'string' && node.className.startsWith(name));
  const title = withClass('ArticleHero_hero__title__')?.children;
  const stamp = dateStamp(withClass('ArticleHero_hero__date__')?.children);
  const body = nodes.filter(node => typeof node.className === 'string' && node.className.includes('RenderCopy_copy__'))
    .flatMap(node => readContent(node.children, rows));
  if (typeof title !== 'string' || !Number.isFinite(stamp) || !body.length) throw new Error('官网文章正文不可用');

  const coverNode = withClass('ArticleHero_hero__image__')?.children;
  const cover = Array.isArray(coverNode) ? record(coverNode[3]) : undefined;
  const shareImage = nodes.find(node => node.property === 'og:image')?.content;
  return { title, date: dateFormat.format(stamp), body,
    cover: newsImage(cover?.src, '', cover?.width, cover?.height) ?? newsImage(shareImage, '') };
}

export async function fetchNewsPage(signal?: AbortSignal, id?: string) {
  const response = await fetch(id ? `/api/news/${encodeURIComponent(id)}` : '/api/news', { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('官网新闻不可用');
  return response.text();
}

let cachedNewsIndex: Promise<NewsEntry[]> | undefined;

export function loadNewsIndex() {
  return cachedNewsIndex ??= fetchNewsPage().then(parseNewsIndex).catch(error => {
    cachedNewsIndex = undefined;
    throw error;
  });
}
