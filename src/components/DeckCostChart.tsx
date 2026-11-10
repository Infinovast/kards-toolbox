import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import KreditLabel from './KreditLabel';
import DeckRaritySummary from './DeckRaritySummary';
import { handleDialogKeys } from '../lib/dialogKeyboard';
import { DECK_COST_CATEGORIES, summarizeDeckCosts } from '../lib/deckCostCurve';
import type { KardsCardRecord } from '../types/card';

export default function DeckCostChart({ entries, cardsById, active, hoverOnly = false, className = 'builder-cost-chart-button' }: {
  entries: Map<string, number>; cardsById: Map<string, KardsCardRecord>; active: boolean; hoverOnly?: boolean; className?: string;
}) {
  const [mode, setMode] = useState<'hover' | 'pinned' | null>(null);
  const reducedMotion = useReducedMotion();
  const hoverTimer = useRef<number | undefined>(undefined);
  const hoverBlockedUntil = useRef(0);
  const id = useId();
  const curve = useMemo(() => summarizeDeckCosts(entries, cardsById), [entries, cardsById]);
  const clearHover = () => { window.clearTimeout(hoverTimer.current); hoverTimer.current = undefined; };
  const close = () => {
    clearHover();
    // Closing the overlay exposes the trigger beneath the pointer again.
    hoverBlockedUntil.current = performance.now() + 500;
    setMode(null);
  };
  useEffect(() => { if (!active) { clearHover(); setMode(null); } }, [active]);
  useEffect(() => clearHover, []);
  useEffect(() => {
    if (mode !== 'hover') return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.isComposing) return;
      event.preventDefault(); event.stopPropagation();
      hoverBlockedUntil.current = performance.now() + 500;
      setMode(null);
    };
    window.addEventListener('keydown', keydown, true);
    return () => window.removeEventListener('keydown', keydown, true);
  }, [mode]);
  const pinned = mode === 'pinned';

  return <>
    <button type="button" className={className} aria-label="卡组分析" title="卡组分析"
      aria-haspopup={hoverOnly ? undefined : 'dialog'} aria-expanded={Boolean(mode) && active} aria-controls={mode && active ? id : undefined} disabled={!active}
      aria-describedby={mode === 'hover' && active ? id : undefined}
      onPointerEnter={event => {
        if (event.pointerType !== 'mouse' || pinned || performance.now() < hoverBlockedUntil.current) return;
        clearHover(); hoverTimer.current = window.setTimeout(() => setMode('hover'), 180);
      }} onPointerLeave={() => { clearHover(); setMode(current => current === 'hover' ? null : current); }}
      onClick={hoverOnly ? undefined : () => { clearHover(); setMode('pinned'); }}>
      <svg viewBox="0 0 32 32" aria-hidden="true" fill="currentColor"><path d="M4 17h5v11H4zM13 10h5v18h-5zM22 4h5v24h-5z" /></svg>
    </button>
    {createPortal(<AnimatePresence>
    {active && mode && <motion.div className="card-detail-overlay deck-cost-overlay" data-mode={mode}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: reducedMotion ? 0 : 0.14, ease: 'easeOut' }}>
      {pinned && <div className="card-detail-backdrop" onClick={close} />}
      <section id={id} role={pinned ? 'dialog' : 'tooltip'} aria-modal={pinned ? true : undefined} aria-label="卡组分析"
        tabIndex={pinned ? -1 : undefined} onKeyDown={pinned ? handleDialogKeys : undefined} className="deck-cost-dialog">
        {pinned && <button type="button" data-dialog-cancel onClick={close} aria-label="关闭卡组分析" className="deck-cost-close"><X className="h-5 w-5" /></button>}
        <h2>卡组分析</h2>
        <div className="deck-cost-columns">
          {curve.buckets.map((bucket, cost) => {
            const operation = curve.operationBuckets[cost];
            const split = operation.total > 0;
            const distributions = [{ label: '部署', bucket }, ...(split ? [{ label: '行动', bucket: operation }] : [])];
            const costLabel = `${cost}K${cost === 7 ? '+' : ''}`;
            return <div key={cost} role="img" className="deck-cost-column"
            aria-label={`${costLabel}：${distributions.map(item => `${item.label}（${DECK_COST_CATEGORIES.filter(({ key }) => item.label === '部署' || key === 'army' || key === 'air').map(({ key, label }) => `${label} ${item.bucket[key]} 张`).join('，')}，共 ${item.bucket.total} 张）`).join('；')}`}>
            <div className={`deck-cost-quantity${split ? ' is-split' : ''}`} aria-hidden="true">
              {distributions.map(item => <span key={item.label}>×{item.bucket.total}</span>)}
            </div>
            <div className="deck-cost-frame" aria-hidden="true">
              <div className="deck-cost-bars">
                {distributions.map(item => <div key={item.label} className="deck-cost-stack" data-distribution={item.label === '部署' ? 'deployment' : 'operation'} title={`${costLabel} ${item.label}：${item.bucket.total} 张`}>
                  {DECK_COST_CATEGORIES.map(({ key, color }) => <span key={key} className={`deck-cost-segment is-${key}`} style={{ backgroundColor: color, height: `${item.bucket[key] / curve.max * 100}%` }} />)}
                </div>)}
              </div>
              <div className="deck-cost-kredit"><KreditLabel cost={cost} /></div>
            </div>
          </div>; })}
        </div>
        <div className="deck-cost-legend">
          {DECK_COST_CATEGORIES.map(({ key, label, color }) => <div key={key}><span aria-hidden="true" className={`deck-cost-swatch is-${key}`} style={{ backgroundColor: color }} /><span>{label}：<strong>{curve.totals[key]}</strong></span></div>)}
        </div>
        <div className="deck-cost-averages">
          {[
            { label: '平均花费', value: curve.averages.cost },
            { label: '平均单位部署', value: curve.averages.unitDeployment },
            { label: '平均单位行动', value: curve.averages.unitOperation },
          ].map(({ label, value }) => <span key={label}>{label}：<small>{value.toFixed(2)}</small><b> K</b></span>)}
          <span>单位/指令比：<small>{curve.totals.army + curve.totals.air} : {curve.totals.order + curve.totals.countermeasure}</small></span>
        </div>
        <DeckRaritySummary rarities={curve.rarities} className="deck-cost-rarities" />
      </section>
    </motion.div>}
    </AnimatePresence>, document.body)}
  </>;
}
