import { fillNewsCover } from '../lib/newsImages';
import { loadNewsArticle } from '../lib/newsSource';

const scrollIdleDelay = 160;
const preloadDistance = 100;

export function watchNewsListCovers(viewport: HTMLElement) {
  const list = viewport.querySelector('.news-list')!;
  let timer: number | undefined;
  let active: AbortController | undefined;
  let stopped = false;

  async function load() {
    const bounds = viewport.getBoundingClientRect();
    const visible: HTMLElement[] = [];
    const nearby: HTMLElement[] = [];
    const above: HTMLElement[] = [];
    for (const element of list.querySelectorAll<HTMLElement>('[data-news-cover]:not([data-cover-settled])')) {
      const { top, bottom } = element.getBoundingClientRect();
      if (top > bounds.bottom + preloadDistance) break;
      if (bottom <= bounds.top) above.push(element);
      else if (top < bounds.bottom) visible.push(element);
      else nearby.push(element);
    }
    const queue = [...visible, ...nearby, ...above.reverse()];
    if (!queue.length) return;

    const request = new AbortController();
    active = request;
    try {
      for (const element of queue) {
        if (request.signal.aborted) return;
        try {
          const article = await loadNewsArticle(element.dataset.newsCover!, request.signal);
          if (article.cover) await fillNewsCover(element, article.cover, 640, request.signal);
        } catch { /* Keep the text-only item if its cover is unavailable. */ }
        if (!request.signal.aborted) element.setAttribute('data-cover-settled', '');
      }
    } finally {
      if (active === request) {
        active = undefined;
        schedule();
      }
    }
  }

  function schedule(delay = 0) {
    if (stopped || active || timer !== undefined) return;
    timer = window.setTimeout(() => {
      timer = undefined;
      void load();
    }, delay);
  }

  function pause() {
    window.clearTimeout(timer);
    timer = undefined;
    active?.abort();
    active = undefined;
    schedule(scrollIdleDelay);
  }

  const observer = new MutationObserver(() => schedule());
  observer.observe(list, { childList: true, subtree: true });
  viewport.addEventListener('scroll', pause, { passive: true });
  window.addEventListener('resize', pause);
  schedule();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
    active?.abort();
    observer.disconnect();
    viewport.removeEventListener('scroll', pause);
    window.removeEventListener('resize', pause);
  };
}
