import { createElement, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from 'react';
import { ArrowUpRight, ChevronLeft, X } from 'lucide-react';
import { openExternalLink } from '../lib/externalLinks';
import { fillNewsCover, loadNewsImage, newsImageVersions } from '../lib/newsImages';
import { NEWS_SOURCE, loadNewsArticle, type NewsArticle, type NewsContent, type NewsEntry } from '../lib/newsSource';
import CardImageLoading from './CardImageLoading';

const coverScrollSpeed = 0.1;

async function fillArticleImages(article: HTMLElement, signal: AbortSignal) {
  const bodyWidth = article.querySelector<HTMLElement>('.article-body')!.clientWidth;
  const pictures = [...article.querySelectorAll<HTMLElement>('.article-image')].map((element, index) => {
    element.setAttribute('aria-label', element.getAttribute('aria-label') || `图片 ${index + 1}`);
    const sourceWidth = Number.parseFloat(element.style.getPropertyValue('--image-width')) || bodyWidth;
    const width = Math.max(1, Math.min(1600, Math.ceil(Math.min(bodyWidth, sourceWidth) * devicePixelRatio)));
    const content = element.querySelector('.article-image-content')!;
    return { element, content, width, versions: newsImageVersions(element.dataset.imageSrc!, width) };
  });
  for (const pass of [0, 1]) {
    for (const { element, content, width, versions } of pictures) {
      if (signal.aborted) return;
      if (!versions[pass]) continue;
      const image = await loadNewsImage(versions[pass], signal);
      if (signal.aborted) return;
      if (image) {
        image.alt = '';
        if (element.dataset.imageSrc && !element.style.getPropertyValue('--image-width')) {
          element.style.setProperty('--image-ratio', `${image.naturalWidth} / ${image.naturalHeight}`);
          if (versions.length === 1 || (pass === 1 && image.naturalWidth < width)) {
            element.style.setProperty('--image-width', `${image.naturalWidth}px`);
          }
        }
        content.replaceChildren(image);
        delete element.dataset.failed;
      } else if (!content.firstChild && pass === versions.length - 1) {
        element.dataset.failed = '';
      }
    }
  }
}

function normalClick(event: MouseEvent) {
  return !event.defaultPrevented && event.button === 0 && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

function articleNodes(nodes: NewsContent[], openRelated: (id: string) => void, openImage?: (trigger: HTMLButtonElement) => void, insideLink = false) {
  return nodes.map((node, key): React.ReactNode => {
    if (typeof node === 'string') return node;
    if (node.type === 'image') {
      if (!openImage) return null;
      const { src, label, width, height } = node.image;
      const style = width && height ? { '--image-width': `${width}px`, '--image-ratio': `${width} / ${height}` } as CSSProperties : undefined;
      return <button key={key} className="article-image" type="button" aria-label={label || undefined} aria-haspopup="dialog"
        data-image-src={src} style={style} onClick={event => {
          event.preventDefault(); event.stopPropagation(); openImage(event.currentTarget);
        }}>
        <span className="article-image-content" />
        <CardImageLoading label="正在加载图片" />
      </button>;
    }
    const children = articleNodes(node.children, openRelated, openImage, insideLink || node.type === 'link');
    if (!openImage && node.children.length && !children.some(child => typeof child === 'string' ? child.trim() : child != null)) return null;
    if (node.type === 'tag') {
      if (node.tag === 'br' || node.tag === 'hr') return createElement(node.tag, { key });
      return createElement(node.tag, { key }, children);
    }
    if (insideLink) return children;
    return <a key={key} href={node.url} target="_blank" rel="noreferrer" onClick={event => {
      if (node.articleId && normalClick(event)) {
        event.preventDefault(); openRelated(node.articleId);
      } else openExternalLink(event);
    }}>{children.length ? children : (node.articleId ? '阅读相关新闻' : '查看原文中的链接')}</a>;
  });
}

function NewsImagePreview({ pictures, initial, onClose }: {
  pictures: HTMLButtonElement[];
  initial: number;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(initial);
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const previewArt = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const picture = pictures[index];
  const label = picture.getAttribute('aria-label') ?? '图片预览';

  useLayoutEffect(() => {
    const modal = dialog.current!;
    modal.showModal();
    close.current?.focus();
    let lastWheel = -Infinity;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      const now = performance.now(), elapsed = now - lastWheel;
      lastWheel = now;
      if (elapsed >= 180) setIndex(current => Math.max(0, Math.min(pictures.length - 1, current + Math.sign(event.deltaY))));
    };
    modal.addEventListener('wheel', wheel, { passive: false });
    return () => {
      modal.removeEventListener('wheel', wheel);
      modal.close();
      pictures[initial]?.focus({ preventScroll: true });
    };
  }, [initial, pictures]);

  useLayoutEffect(() => {
    const element = stage.current!;
    const art = previewArt.current!;
    const request = new AbortController();
    const inline = picture.querySelector('img');
    art.replaceChildren();
    element.toggleAttribute('data-loading', !inline?.naturalWidth);
    if (element.hasAttribute('data-loading')) element.setAttribute('aria-busy', 'true');
    if (inline?.naturalWidth) {
      const canvas = document.createElement('canvas');
      canvas.width = inline.naturalWidth;
      canvas.height = inline.naturalHeight;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.getContext('2d')?.drawImage(inline, 0, 0);
      art.append(canvas);
    }
    void loadNewsImage(picture.dataset.imageSrc!, request.signal).then(image => {
      if (request.signal.aborted) return;
      element.removeAttribute('data-loading');
      element.removeAttribute('aria-busy');
      if (image) {
        image.alt = label;
        art.replaceChildren(image);
      } else if (!art.firstChild) {
        const status = document.createElement('p');
        status.setAttribute('role', 'status');
        status.textContent = '图片加载失败';
        art.append(status);
      }
    });
    return () => { request.abort(); element.removeAttribute('aria-busy'); };
  }, [picture, label]);

  return <dialog ref={dialog} className="news-image-dialog" aria-label={label} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (!(event.target as Element).closest('img, canvas, button')) onClose(); }}
    onKeyDown={event => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();
      if (!event.repeat) setIndex(current => Math.max(0, Math.min(pictures.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1))));
    }}>
    <button ref={close} className="image-close" type="button" aria-label="关闭图片预览" onClick={onClose}><X size={20} /></button>
    <div className="image-stage" ref={stage}>
      <div className="image-stage-art" ref={previewArt} />
      <CardImageLoading label="正在加载原图" />
    </div>
  </dialog>;
}

export function NewsStatus({ children, onRetry }: { children: string; onRetry?: () => void }) {
  return <div className="news-status" role="status">{children}{onRetry && <button className="news-retry" type="button" onClick={onRetry}>重试</button>}</div>;
}

export function NewsLoading({ label }: { label: string }) {
  return <div className="news-loading" role="status" aria-label={label}><span aria-hidden="true" /></div>;
}

export default function NewsArticleView({ id, entry, dataSaver, onBack, onOpen }: {
  id: string;
  entry?: NewsEntry;
  dataSaver: boolean;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const [article, setArticle] = useState<NewsArticle>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<{ pictures: HTMLButtonElement[]; index: number }>();
  const detail = useRef<HTMLElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    const request = new AbortController();
    void loadNewsArticle(id, request.signal).then(data => {
      if (!request.signal.aborted) setArticle(data);
    }).catch(() => { if (!request.signal.aborted) setFailed(true); });
    return () => request.abort();
  }, [id, attempt]);

  const cover = dataSaver ? undefined : article?.cover;
  useLayoutEffect(() => {
    if (!article || dataSaver) return;
    const request = new AbortController();
    void fillArticleImages(detail.current!, request.signal);
    return () => request.abort();
  }, [article, dataSaver]);

  useLayoutEffect(() => {
    if (!cover) return;
    const element = coverRef.current!;
    const request = new AbortController();
    const filledWidth = cover.width && cover.height ? element.clientHeight * cover.width / cover.height : 0;
    const width = Math.max(1, Math.min(cover.width ?? 1920, 1920, Math.ceil(Math.max(element.clientWidth, filledWidth) * devicePixelRatio)));
    void fillNewsCover(element, cover, width, request.signal);
    return () => request.abort();
  }, [cover]);

  function openImage(trigger: HTMLButtonElement) {
    const pictures = [...detail.current!.querySelectorAll<HTMLButtonElement>('.article-image')];
    setPreview({ pictures, index: pictures.indexOf(trigger) });
  }

  const date = article?.date ?? entry?.date;
  return <div className="news-detail-pane">
    <nav className="detail-tools" aria-label="新闻详情">
      <button className="detail-link" type="button" aria-keyshortcuts="Escape" title="返回（Esc）" onClick={onBack}><ChevronLeft size={15} aria-hidden="true" />返回</button>
      <a className="detail-link" href={`${NEWS_SOURCE}/${id}`} target="_blank" rel="noreferrer" onClick={openExternalLink}>查看原文<ArrowUpRight size={15} aria-hidden="true" /></a>
    </nav>
    <div className="news-viewport no-scrollbar" onScroll={cover ? event => {
      const distance = Math.min(event.currentTarget.scrollTop, (coverRef.current?.offsetHeight ?? 0) / coverScrollSpeed);
      detail.current?.style.setProperty('--article-cover-offset', `${distance * (1 - coverScrollSpeed)}px`);
    } : undefined}>
      <article className={`news-detail${cover ? ' has-cover' : ''}`} ref={detail}>
        {cover && <div ref={coverRef} className="article-art" aria-hidden="true" />}
        <header className="article-header">
          <h1 ref={heading} tabIndex={-1}>{article?.title ?? entry?.title ?? '新闻详情'}</h1>
          {date && <div className="article-meta"><time dateTime={date}>{date.replaceAll('-', '.')}</time><span>KARDS 官网</span></div>}
        </header>
        {failed ? <NewsStatus onRetry={() => { setFailed(false); setAttempt(count => count + 1); }}>暂时无法读取官网正文。</NewsStatus>
          : article ? <div className="article-body">{articleNodes(article.body, onOpen, dataSaver ? undefined : openImage)}</div>
            : <NewsLoading label="正在从官网读取正文" />}
      </article>
    </div>
    {!dataSaver && preview && <NewsImagePreview pictures={preview.pictures} initial={preview.index} onClose={() => setPreview(undefined)} />}
  </div>;
}
