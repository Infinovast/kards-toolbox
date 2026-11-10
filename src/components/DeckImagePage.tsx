import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Download, History, Image as ImageIcon, LoaderCircle, RotateCcw, X } from 'lucide-react';
import { factionLabel, type KardsCardRecord } from '../types/card';
import { decodeDeckCode } from '../lib/deckCode';
import { extractDeckCodeFromText, inferDeckTitleFromText } from '../lib/deckImport';
import { CARD_BACKS, cardBackForDeck, headquartersForDeck, tableclothForHeadquarters } from '../lib/cardAssets';
import { renderDeckImage, renderDeckMiniImage, downloadDeckImage } from '../lib/deckRenderer';
import { listDeckImageCodes, readDeckImage, saveDeckImage, type DeckImageKind } from '../lib/deckImageCache';
import { useCardImageCacheRevision } from '../lib/cardImages';
import { handleDialogKeys, useDismissiblePanel } from '../lib/dialogKeyboard';
import DeckImageHistoryItem from './DeckImageHistoryItem';

interface ImageDeck { code: string; name: string; headquartersId?: string; cardBackUrl?: string }
interface Props {
  cards: KardsCardRecord[];
  decks: ImageDeck[];
  tablecloth: string;
  customCategories: { backs: { id: string; url: string }[] }[];
}
interface Preview { image: string | null; loading: boolean; error: string }
const emptyPreview = (): Preview => ({ image: null, loading: false, error: '' });
const deckTitle = (code: string) => {
  const { mainNation, allyNation } = decodeDeckCode(code);
  return `${factionLabel(mainNation)}${mainNation === allyNation ? '' : factionLabel(allyNation)}卡组`;
};

function imageOptions(deck: ImageDeck, tablecloth: string, customCategories: Props['customCategories']) {
  const decoded = decodeDeckCode(deck.code);
  const background = tableclothForHeadquarters(headquartersForDeck(deck.headquartersId, decoded.mainNation)?.groupId) || tablecloth;
  const cardBackUrl = cardBackForDeck({ ...deck, ...decoded });
  const customBack = customCategories.flatMap(category => category.backs).find(back => back.url === cardBackUrl);
  const cardBackId = CARD_BACKS.find(back => back.file === cardBackUrl)?.id || (customBack ? `custom:${customBack.id}` : undefined);
  return { background, cardBackUrl, cardBackId };
}

export default function DeckImagePage({ cards, decks, tablecloth, customCategories }: Props) {
  const reducedMotion = useReducedMotion();
  const cacheRevision = useCardImageCacheRevision();
  const [input, setInput] = useState<{ text: string; title?: string; history?: { tablecloth: string; revision: number; cards: KardsCardRecord[] } }>({ text: '' });
  const [previews, setPreviews] = useState({ full: emptyPreview(), mini: emptyPreview() });
  const [saveError, setSaveError] = useState('');
  const [retry, setRetry] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [historyRevision, setHistoryRevision] = useState(0);
  const [enlarged, setEnlarged] = useState<{ image: string; title: string } | null>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  const inputRevision = useRef(0);
  const lastClipboardCode = useRef('');
  const closeHistory = () => { setHistoryOpen(false); historyButton.current?.focus(); };
  const historyPanel = useDismissiblePanel<HTMLElement>(historyOpen, closeHistory, event => {
    if (event.target instanceof Node && historyButton.current?.contains(event.target)) return;
    setHistoryOpen(false);
  });

  const parsed = useMemo(() => {
    if (!input.text.trim()) return { code: '', error: '', deck: null };
    try {
      const code = extractDeckCodeFromText(input.text);
      const decoded = decodeDeckCode(code);
      const count = [...decoded.counts.values()].reduce((sum, value) => sum + value, 0);
      if (!count || count > 999) throw new Error('生图支持 1—999 张可用牌，请检查卡组码');
      const saved = decks.find(deck => deck.code === code);
      return { code, error: '', deck: { ...saved, code, name: input.title || saved?.name || deckTitle(code), ...decoded } };
    } catch (error) { return { code: '', error: error instanceof Error ? error.message : '请检查卡组码', deck: null }; }
  }, [input.text, input.title, decks]);

  useEffect(() => {
    let cancelled = false, detecting = false;
    const detect = async () => {
      if (detecting) return;
      detecting = true;
      const revision = inputRevision.current;
      try {
        const text = window.kardsDesktop?.readClipboardText
          ? await window.kardsDesktop.readClipboardText() : await navigator.clipboard?.readText();
        if (cancelled || revision !== inputRevision.current || !text) return;
        const code = extractDeckCodeFromText(text);
        const decoded = decodeDeckCode(code);
        if (!decoded.counts.size || code === lastClipboardCode.current) return;
        lastClipboardCode.current = code;
        inputRevision.current++;
        setInput({ text: code, title: inferDeckTitleFromText(text, code) });
      } catch { /* Clipboard access is optional in browser previews. */ }
      finally { detecting = false; }
    };
    void detect();
    window.addEventListener('focus', detect);
    return () => { cancelled = true; window.removeEventListener('focus', detect); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSaveError('');
    const deck = parsed.deck;
    if (!deck) { setPreviews({ full: emptyPreview(), mini: emptyPreview() }); return; }
    setPreviews({ full: { ...emptyPreview(), loading: true }, mini: { ...emptyPreview(), loading: true } });
    const update = (kind: DeckImageKind, preview: Preview) => {
      if (!cancelled) setPreviews(current => ({ ...current, [kind]: preview }));
    };
    const timer = window.setTimeout(() => {
      const { background, cardBackUrl, cardBackId } = imageOptions(deck, tablecloth, customCategories);
      const restore = input.history?.tablecloth === tablecloth && input.history.revision === cacheRevision && input.history.cards === cards && retry === 0;
      const generate = async (kind: DeckImageKind, fullSaved?: Promise<boolean>): Promise<boolean> => {
        try {
          if (restore) {
            if (fullSaved) await fullSaved;
            const cached = await readDeckImage(deck.code, kind);
            if (cancelled) return false;
            if (cached) { update(kind, { image: cached, loading: false, error: '' }); return true; }
          }
          const image = kind === 'full'
            ? await renderDeckImage(deck.code, cards, deck.name, background, deck.headquartersId, 40, cardBackId)
            : await renderDeckMiniImage(deck.code, cards, deck.name, background, deck.headquartersId, cardBackUrl, cardBackId);
          if (cancelled) return false;
          update(kind, { image, loading: false, error: '' });
          if ((fullSaved && !await fullSaved) || cancelled) return false;
          try {
            await saveDeckImage(deck.code, image, kind);
            if (!cancelled && kind === 'full') setHistoryRevision(value => value + 1);
            return true;
          }
          catch { if (!cancelled) setSaveError('图片已生成，但历史记录未能保存。请重试生成。'); }
        } catch (error) {
          update(kind, { image: null, loading: false, error: error instanceof Error ? error.message : '图片生成失败' });
        }
        return false;
      };
      const fullSaved = generate('full');
      void generate('mini', fullSaved);
    }, input.history ? 0 : 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [parsed, input.history, cards, tablecloth, customCategories, cacheRevision, retry]);

  useEffect(() => {
    if (!historyOpen) return;
    let cancelled = false;
    setHistoryLoading(true); setHistoryError('');
    listDeckImageCodes().then(codes => { if (!cancelled) setHistory(codes); })
      .catch(() => { if (!cancelled) setHistoryError('历史记录读取失败，请关闭后重试。'); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [historyOpen, historyRevision]);

  const changeInput = (text: string) => {
    inputRevision.current++;
    const code = extractDeckCodeFromText(text);
    setRetry(0);
    setInput({ text: code, title: inferDeckTitleFromText(text, code) });
  };

  return <section aria-label="卡组生图" className="relative flex h-full w-full min-h-0 flex-col overflow-hidden">
    <div className="glass-panel shrink-0 border-b border-kards-border px-5 py-4">
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="deck-image-code" className="mb-2 block text-sm font-bold">卡组码</label>
          <input id="deck-image-code" value={input.text} onChange={event => changeInput(event.target.value)} spellCheck={false} autoComplete="off"
            placeholder="输入卡组码，自动生成完整图和迷你图"
            aria-invalid={!!parsed.error} aria-describedby="deck-image-input-status"
            className="w-full rounded border border-kards-input-border bg-kards-input-bg px-3 py-2 text-sm text-kards-text placeholder:text-kards-text-muted focus:border-kards-text-muted focus:outline-none focus:ring-1 focus:ring-kards-text-muted" />
        </div>
        <button ref={historyButton} type="button" aria-expanded={historyOpen} aria-controls="deck-image-history" onClick={() => setHistoryOpen(open => !open)}
          className={`flex shrink-0 items-center gap-2 rounded border px-3 py-2 text-sm hover:border-kards-gold ${historyOpen ? 'border-kards-gold text-kards-status' : 'border-kards-border text-kards-text'}`}>
          <History className="h-4 w-4" />历史记录
        </button>
      </div>
      <p id="deck-image-input-status" role="status" className={`mt-2 text-xs ${parsed.error ? 'text-kards-text' : 'text-kards-text-muted'}`}>
        {parsed.error || (parsed.deck ? `${parsed.deck.name} · ${1 + [...parsed.deck.counts.values()].reduce((sum, count) => sum + count, 0)} 张` : '检测到剪贴板中的卡组码时会自动填入，也可粘贴游戏内的完整卡组文本。')}
      </p>
    </div>
    <div className="relative min-h-0 flex-1">
      <div className="h-full overflow-y-auto p-5">
        {saveError && <p role="alert" className="mb-4 text-sm text-kards-text">{saveError}<button type="button" onClick={() => setRetry(value => value + 1)} className="ml-2 underline underline-offset-4">重试生成</button></p>}
        <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_minmax(260px,342px)]">
          {(['full', 'mini'] as const).map(kind => {
            const preview = previews[kind], title = kind === 'full' ? '完整卡组图' : '迷你分享图';
            return <section key={kind} aria-label={title} className="min-w-0">
              <div className="glass-panel mb-3 flex min-h-10 items-center justify-between gap-2 rounded px-3 py-2">
                <h2 className="text-sm font-bold">{title}</h2>
                <button type="button" disabled={!preview.image || preview.loading || !parsed.deck} onClick={() => downloadDeckImage(preview.image!, parsed.deck!.name + (kind === 'mini' ? '-mini' : ''))}
                  aria-label={`下载${title}`} className="flex items-center gap-1.5 text-xs text-kards-text-muted hover:text-kards-text disabled:opacity-40"><Download className="h-4 w-4" />下载 PNG</button>
              </div>
              <div aria-busy={preview.loading} className="glass-panel flex min-h-[242px] items-center justify-center overflow-hidden rounded">
                {preview.loading ? <p role="status" className="flex items-center gap-2 p-6 text-sm text-kards-text-muted"><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />正在生成{title}…</p>
                  : preview.error ? <div role="alert" className="p-6 text-center"><p className="text-sm text-kards-text">{preview.error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="mx-auto mt-3 flex items-center gap-2 rounded border border-kards-border px-3 py-2 text-sm hover:border-kards-gold"><RotateCcw className="h-4 w-4" />重试生成</button></div>
                    : preview.image && parsed.deck ? <button type="button" aria-label={`放大${title}`} aria-haspopup="dialog" onClick={() => setEnlarged({ image: preview.image!, title })} className="flex w-full cursor-zoom-in justify-center">
                      <img src={preview.image} alt={title} className="block h-auto w-full object-contain" draggable={false} />
                    </button>
                      : <div className="flex flex-col items-center gap-3 p-6 text-center text-kards-text-muted"><ImageIcon className="h-7 w-7" /><p className="text-sm">输入有效卡组码后显示{title}</p></div>}
              </div>
            </section>;
          })}
        </div>
      </div>
    </div>
      {historyOpen && <aside ref={historyPanel} id="deck-image-history" role="dialog" aria-modal="false" aria-label="生图历史记录" tabIndex={-1}
        className="glass-panel absolute bottom-5 right-5 top-5 z-30 flex w-[320px] max-w-[calc(100%-40px)] flex-col overflow-hidden rounded-lg border border-kards-border shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-kards-border px-4 py-2">
          <h2 className="text-sm font-bold">历史记录</h2>
          <button type="button" aria-label="关闭生图历史记录" onClick={closeHistory} className="rounded p-1 text-kards-text-muted hover:text-kards-text"><X className="h-4 w-4" /></button>
        </div>
        <div className="no-scrollbar min-h-0 w-full flex-1 overflow-y-auto p-4">
          {historyLoading ? <p role="status" className="p-4 text-sm text-kards-text-muted">正在读取历史记录…</p>
            : historyError ? <p role="alert" className="p-4 text-sm text-kards-text-muted">{historyError}</p>
              : !history.length ? <p className="p-4 text-sm text-kards-text-muted">暂无生图记录，生成卡组图后会自动保存到这里。</p>
                : <ul className="space-y-2">{history.map(code => <li key={code}>
                  <DeckImageHistoryItem code={code} name={decks.find(deck => deck.code === code)?.name || deckTitle(code)} selected={parsed.code === code} revision={historyRevision}
                    renderMini={async () => {
                      const deck = decks.find(deck => deck.code === code) || { code, name: deckTitle(code) };
                      const { background, cardBackUrl, cardBackId } = imageOptions(deck, tablecloth, customCategories);
                      return renderDeckMiniImage(code, cards, deck.name, background, deck.headquartersId, cardBackUrl, cardBackId);
                    }} onSelect={() => {
                    inputRevision.current++; setRetry(0);
                    setInput({ text: code, history: { tablecloth, revision: cacheRevision, cards } }); closeHistory();
                  }} />
                </li>)}</ul>}
        </div>
      </aside>}
    {createPortal(<AnimatePresence>{enlarged && <motion.div className="card-detail-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.14 }}>
      <div className="card-detail-backdrop" onClick={() => setEnlarged(null)} />
      <section role="dialog" aria-modal="true" aria-label={`${enlarged.title}放大预览`} tabIndex={-1} onKeyDown={handleDialogKeys} className="relative flex max-w-full flex-col items-center pt-9">
        <button type="button" data-dialog-cancel aria-label="关闭图片放大预览" onClick={() => setEnlarged(null)} className="card-detail-close"><X className="h-5 w-5" /></button>
        <img src={enlarged.image} alt={`放大的${enlarged.title}`} draggable={false} className="block h-auto max-h-[calc(100dvh-128px)] w-auto max-w-[calc(100vw-96px)] object-contain" />
      </section>
    </motion.div>}</AnimatePresence>, document.body)}
  </section>;
}
