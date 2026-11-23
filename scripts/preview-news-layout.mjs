import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';

const origin = 'https://www.kardsplayer.com';
const newsPath = '/zh/news';
const articlePath = /^\/zh\/news\/([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const dateFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' });
const articleTags = new Set([
  'p', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'strong', 'em', 'del', 's', 'u', 'sup', 'sub',
  'b', 'i', 'blockquote', 'code', 'pre', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
]);

// The source delivers the article and index in its embedded Next.js data.
// Decode the JSON payload, without executing the site scripts or importing its HTML.
async function readNewsPage(path) {
  const response = await fetch(new URL(path, origin), {
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`KARDS news responded ${response.status}`);

  const html = await response.text();
  const stream = Array.from(
    html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)<\/script>/g),
    ([, payload]) => JSON.parse(payload),
  ).join('');
  const rows = new Map();
  for (const line of stream.split('\n')) {
    const match = /^([a-f\d]+):([\[{"].*)$/.exec(line);
    if (!match) continue;
    try { rows.set(match[1], JSON.parse(match[2])); } catch { /* Ignore incomplete or non-JSON stream rows. */ }
  }
  return rows;
}

function* properties(node) {
  if (Array.isArray(node)) {
    for (const child of node) yield* properties(child);
  } else if (node && typeof node === 'object') {
    yield node;
    for (const child of Object.values(node)) yield* properties(child);
  }
}

function readIndex(rows) {
  const entries = new Map();
  for (const node of properties([...rows.values()])) {
    if (typeof node.title !== 'string' || typeof node.summary !== 'string') continue;
    const match = articlePath.exec(node.link?.href ?? '');
    const stamp = Date.parse(node.date?.[3]?.date);
    if (!match || !Number.isFinite(stamp) || entries.has(match[1])) continue;
    entries.set(match[1], { id: match[1], title: node.title, summary: node.summary.trim(), stamp });
  }

  return Array.from(entries.values()).sort((left, right) => right.stamp - left.stamp)
    .map(({ stamp, ...entry }) => ({ ...entry, date: dateFormat.format(stamp) }));
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function webUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value, origin);
    if (url.protocol === 'https:' || url.protocol === 'http:') return url;
  } catch { /* Ignore invalid source links. */ }
  return null;
}

function articleImage(source, label, width, height) {
  const url = webUrl(source);
  if (!url) return '';
  const dimensions = [width, height].every(value => Number.isSafeInteger(value) && value > 0)
    ? ` style="--image-width: ${width}px; --image-ratio: ${width} / ${height}"` : '';
  return `<a class="article-image" href="${escapeHtml(url.href)}" aria-label="${escapeHtml(label)}" aria-haspopup="dialog"${dimensions}></a>`;
}

function renderContent(node, rows, images, ancestors = new Set()) {
  const render = child => renderContent(child, rows, images, ancestors);
  if (typeof node === 'string') {
    if (node.startsWith('$$')) return escapeHtml(node.slice(1));
    const reference = /^\$L?([a-f\d]+)$/.exec(node)?.[1];
    if (reference && rows.has(reference) && !ancestors.has(reference)) {
      return renderContent(rows.get(reference), rows, images, new Set([...ancestors, reference]));
    }
    return node === '$undefined' || reference ? '' : escapeHtml(node);
  }
  if (!Array.isArray(node)) return '';
  if (node[0] !== '$') return node.map(render).join('');

  const [, tag, , props] = node;
  if (!props) return '';
  if (Array.isArray(props.images)) {
    return props.images.map(image => images(image.url, image.alt, image.width, image.height)).join('');
  }
  if (tag === 'img') return images(props.src, props.alt, props.width, props.height);
  if (tag === 'br' || tag === 'hr') return `<${tag}>`;

  const children = render(props.children);
  const url = webUrl(props.href ?? props.embed?.url);
  if (url) {
    const article = url.origin === origin && articlePath.exec(url.pathname);
    if (article) return `<a href="#${article[1]}">${children || '阅读相关新闻'}</a>`;
    return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer">${children || '查看原文中的链接'}</a>`;
  }
  return articleTags.has(tag) ? `<${tag}>${children}</${tag}>` : children;
}

function readArticle(rows) {
  const nodes = [...properties([...rows.values()])];
  const title = nodes.find(node => node.className?.startsWith?.('ArticleHero_hero__title__'))?.children;
  const date = nodes.find(node => node.className?.startsWith?.('ArticleHero_hero__date__'))?.children?.[3]?.date;
  let imageNumber = 0;
  const renderImage = (source, alt, width, height) => articleImage(source, alt?.trim() || `图片 ${++imageNumber}`, width, height);
  const body = nodes.filter(node => node.className?.includes?.('RenderCopy_copy__'))
    .map(node => renderContent(node.children, rows, renderImage)).join('');
  if (typeof title !== 'string' || !date || !body.trim()) throw new Error('KARDS article content is unavailable');

  const cover = nodes.find(node => node.className?.startsWith?.('ArticleHero_hero__image__'))?.children?.[3];
  const shareImage = nodes.find(node => node.property === 'og:image')?.content;
  const coverUrl = webUrl(cover?.src) ?? webUrl(shareImage);
  return {
    title,
    date: dateFormat.format(new Date(date)),
    cover: coverUrl ? { src: coverUrl.href, width: cover?.width, height: cover?.height } : null,
    html: body,
  };
}

const files = new Map([
  ['/docs/news-layout.html', { file: '../docs/news-layout.html', type: 'text/html; charset=utf-8' }],
  ['/docs/assets/kards-toolbox-brand.png', { file: '../docs/assets/kards-toolbox-brand.png', type: 'image/png' }],
]);

function json(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(data));
}

createServer(async (request, response) => {
  const path = request.url.split('?')[0];
  if (request.method !== 'GET') return json(response, 405, { error: 'Method not allowed' });

  try {
    if (path === '/') {
      response.writeHead(302, { Location: '/docs/news-layout.html' });
      return response.end();
    }
    const file = files.get(path);
    if (file) {
      const data = await readFile(new URL(file.file, import.meta.url));
      response.writeHead(200, { 'Content-Type': file.type, 'Cache-Control': 'no-store' });
      return response.end(data);
    }
    if (path === '/api/news') {
      const entries = readIndex(await readNewsPage(newsPath));
      if (!entries.length) throw new Error('KARDS news index is empty');
      return json(response, 200, entries);
    }
    const match = /^\/api\/news\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(path);
    if (match) return json(response, 200, readArticle(await readNewsPage(`${newsPath}/${match[1]}`)));
    return json(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error(`${path}: ${error.message}`);
    return json(response, 502, { error: 'KARDS news is unavailable' });
  }
}).listen(4176, '127.0.0.1', () => {
  console.log('新闻布局原型 http://127.0.0.1:4176/docs/news-layout.html');
});
