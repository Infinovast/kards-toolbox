import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { LoaderCircle, RotateCcw, X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { KardsCardRecord } from '../types/card';
import { renderDeckImage } from '../lib/deckRenderer';
import { handleDialogKeys } from '../lib/dialogKeyboard';
import './deckCompareImage.css';

export interface DeckCompareImageDeck {
  code: string;
  name: string;
  headquartersId?: string;
  cardBackId?: string;
}

export default function DeckCompareImage({ deck, cards, tablecloth }: {
  deck: DeckCompareImageDeck;
  cards: KardsCardRecord[];
  tablecloth?: string;
}) {
  const reducedMotion = useReducedMotion();
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [enlarged, setEnlarged] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setImage(null);
    renderDeckImage(deck.code, cards, deck.name, tablecloth, deck.headquartersId, 40, deck.cardBackId)
      .then(result => { if (!cancelled) { setImage(result); setLoading(false); } })
      .catch(reason => { if (!cancelled) { setError(reason instanceof Error ? reason.message : '卡组大图生成失败'); setLoading(false); } });
    return () => { cancelled = true; };
  }, [cards, deck.code, deck.name, deck.headquartersId, deck.cardBackId, retry, tablecloth]);

  return <div className="deck-compare-image">
    <div className="deck-compare-image-frame" aria-busy={loading}>
      {loading ? <p role="status" className="deck-compare-image-state"><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />正在生成卡组大图…</p>
        : error ? <div role="alert" className="deck-compare-image-state"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}><RotateCcw className="h-4 w-4" />重试生成</button></div>
          : image ? <button type="button" className="deck-compare-image-button" aria-label={`放大${deck.name}卡组大图`} onClick={() => setEnlarged(true)}><img src={image} alt={`${deck.name}卡组大图`} draggable={false} /></button>
            : null}
    </div>
    {createPortal(<AnimatePresence>{enlarged && image && <motion.div className="card-detail-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reducedMotion ? 0 : 0.14 }}>
      <div className="card-detail-backdrop" onClick={() => setEnlarged(false)} />
      <section role="dialog" aria-modal="true" aria-label={`${deck.name}卡组大图放大预览`} tabIndex={-1} onKeyDown={handleDialogKeys} className="deck-compare-image-dialog">
        <button type="button" data-dialog-cancel aria-label="关闭卡组大图放大预览" onClick={() => setEnlarged(false)}><X className="h-5 w-5" /></button>
        <img src={image} alt={`${deck.name}卡组大图放大预览`} draggable={false} />
      </section>
    </motion.div>}</AnimatePresence>, document.body)}
  </div>;
}
