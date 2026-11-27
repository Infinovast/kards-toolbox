import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { loadNewsIndex, type NewsEntry } from '../lib/newsSource';
import NewsMonthRail, { NEWS_JUMP_OFFSET, type NewsMonth } from './NewsMonthRail';
import NewsArticleView, { NewsLoading, NewsStatus } from './NewsArticleView';
import { watchNewsListCovers } from './newsListCovers';
import './newsPage.css';

const batchSize = 10;

export default function NewsPage({ articleId, onSelectArticle, dataSaver }: {
  articleId?: string;
  onSelectArticle: (id: string | undefined) => void;
  dataSaver: boolean;
}) {
  const [news, setNews] = useState<NewsEntry[]>([]);
  const [limit, setLimit] = useState(batchSize);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const viewport = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const padding = useRef<HTMLDivElement>(null);
  const pendingJump = useRef<string | null>(null);
  const returnTo = useRef<{ top: number; id: string; monthLabel: string | null }>(null);

  useEffect(() => {
    let active = true;
    void loadNewsIndex().then(entries => {
      if (active) setNews(entries);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [attempt]);

  const months = useMemo(() => {
    const groups: NewsMonth[] = [];
    news.forEach((entry, firstIndex) => {
      const key = entry.date.slice(0, 7);
      const last = groups.at(-1);
      if (last?.key === key) last.entries.push(entry);
      else groups.push({ key, firstIndex, entries: [entry] });
    });
    return groups;
  }, [news]);
  const days = useMemo(() => {
    const groups: { date: string; entries: NewsEntry[]; year?: string }[] = [];
    for (const [index, entry] of news.entries()) {
      const last = groups.at(-1);
      if (last?.date === entry.date) last.entries.push(entry);
      else {
        if (index >= limit) break;
        const year = entry.date.slice(0, 4);
        groups.push({ date: entry.date, entries: [entry], year: last?.date.slice(0, 4) !== year ? year : undefined });
      }
    }
    return groups;
  }, [limit, news]);

  useEffect(() => {
    if (articleId || !sentinel.current) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setLimit(count => count + batchSize);
    }, { root: viewport.current, rootMargin: '0px 0px 140px 0px' });
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [articleId, limit, news.length]);

  function scrollToDay(date: string) {
    const list = viewport.current!;
    const day = list.querySelector(`[data-news-day="${date}"]`);
    if (!day) return false;
    const spacer = padding.current!;
    spacer.style.height = '0px';
    const top = list.scrollTop + day.getBoundingClientRect().top - list.getBoundingClientRect().top - NEWS_JUMP_OFFSET;
    const extra = Math.max(0, Math.ceil(top - (list.scrollHeight - list.clientHeight)));
    spacer.style.height = `${extra}px`;
    list.scrollTop = top;
    return true;
  }

  useLayoutEffect(() => {
    if (articleId) return;
    if (pendingJump.current && scrollToDay(pendingJump.current)) pendingJump.current = null;
    const target = returnTo.current;
    if (!target) return;
    const list = viewport.current!;
    list.scrollTop = target.top;
    const trigger = target.monthLabel
      ? [...(list.parentElement?.querySelectorAll<HTMLButtonElement>('.month-tick') ?? [])].find(button => button.getAttribute('aria-label') === target.monthLabel)
      : list.querySelector<HTMLButtonElement>(`[data-news-id="${target.id}"]`);
    (trigger ?? list).focus({ preventScroll: true });
    returnTo.current = null;
  }, [articleId, days]);

  useLayoutEffect(() => {
    if (!articleId && !dataSaver && viewport.current) return watchNewsListCovers(viewport.current);
  }, [articleId, dataSaver]);

  function jump(month: NewsMonth) {
    const date = month.entries[0].date;
    if (scrollToDay(date)) return;
    pendingJump.current = date;
    setLimit(month.firstIndex + batchSize);
  }

  function open(entry: NewsEntry, monthLabel: string | null = null) {
    returnTo.current = { top: viewport.current?.scrollTop ?? 0, id: entry.id, monthLabel };
    onSelectArticle(entry.id);
  }

  return <section className="news-page" aria-label="新闻">
    {!articleId && months.length > 0 && <NewsMonthRail months={months} viewport={viewport} onJump={jump}
      onOpen={(entry, trigger) => open(entry, trigger.getAttribute('aria-label'))} />}
    <div ref={viewport} className="news-viewport no-scrollbar" role="region" aria-label="新闻列表" tabIndex={-1} hidden={!!articleId}>
      <div className="news-list-content">
        <ol className="news-list">
          {days.map(({ date, entries, year }) => <li key={date} className={`news-day${year ? ' year-start' : ''}`} data-news-day={date}>
            {year && <span className="news-year">{year}</span>}
            <time className="news-date" dateTime={date}>{date.slice(5).replace('-', '.')}</time>
            <ul className="day-stories">
              {entries.map(entry => <li key={entry.id}>
                <button type="button" className="news-item" data-news-id={entry.id} onClick={() => open(entry)}>
                  {!dataSaver && <span className="news-item-art" data-news-cover={entry.id} aria-hidden="true" />}
                  <span><span className="news-title">{entry.title}</span>{entry.summary && <span className="news-summary">{entry.summary}</span>}</span>
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </li>)}
            </ul>
          </li>)}
        </ol>
        {failed ? <NewsStatus onRetry={() => { setFailed(false); setAttempt(count => count + 1); }}>暂时无法读取官网新闻。</NewsStatus>
          : !news.length && <NewsLoading label="正在加载新闻" />}
        {limit < news.length && <div ref={sentinel} className="news-sentinel" aria-hidden="true" />}
        <div ref={padding} aria-hidden="true" />
      </div>
    </div>
    {articleId && <NewsArticleView key={articleId} id={articleId} entry={news.find(entry => entry.id === articleId)}
      dataSaver={dataSaver} onBack={() => onSelectArticle(undefined)} onOpen={onSelectArticle} />}
  </section>;
}
