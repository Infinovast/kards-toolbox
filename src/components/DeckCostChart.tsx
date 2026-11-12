import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { X } from 'lucide-react';
import KreditLabel from './KreditLabel';
import DeckRaritySummary from './DeckRaritySummary';
import { handleDialogKeys } from '../lib/dialogKeyboard';
import { DECK_COST_CATEGORIES, summarizeDeckCosts } from '../lib/deckCostCurve';
import { analyzeDeckAbilities } from '../lib/deckAnalysis';
import type { KardsCardRecord } from '../types/card';

const ABILITY_HUES = [6, 30, 54, 114]; // Red → orange → yellow → green.
const abilityColor = (hue: number) => `hsl(${hue} 55% 62%)`;
function abilityPointColor(score: number, low: number, high: number) {
  const width = Math.max(1, high - low);
  // Lower edge: orange; band midpoint: yellow; upper edge and beyond: green.
  const position = score < low ? Math.max(0, 1 + (score - low) / Math.max(10, width))
    : Math.min(3, 1 + 2 * (score - low) / width);
  const index = Math.min(2, Math.floor(position));
  return abilityColor(ABILITY_HUES[index] + (ABILITY_HUES[index + 1] - ABILITY_HUES[index]) * (position - index));
}

export default function DeckCostChart({ entries, cardsById, active, hoverOnly = false, className = 'builder-cost-chart-button' }: {
  entries: Map<string, number>; cardsById: Map<string, KardsCardRecord>; active: boolean; hoverOnly?: boolean; className?: string;
}) {
  const [mode, setMode] = useState<'hover' | 'pinned' | null>(null);
  const reducedMotion = useReducedMotion();
  const hoverTimer = useRef<number | undefined>(undefined);
  const hoverBlockedUntil = useRef(0);
  const id = useId();
  const curve = useMemo(() => summarizeDeckCosts(entries, cardsById), [entries, cardsById]);
  const abilities = useMemo(() => active && mode ? analyzeDeckAbilities(entries, cardsById) : null, [entries, cardsById, active, mode]);
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
        <div className="deck-ability-chart" aria-label="五项能力评分">
          {abilities?.status === 'ready' ? <>
            <div className="deck-ability-legend" aria-hidden="true">
              <span><span className="deck-ability-colors">{ABILITY_HUES.map(hue => <i key={hue} className="deck-ability-point" style={{ backgroundColor: abilityColor(hue) }} />)}</span>本卡组</span>
              <span><i className="deck-ability-band" />典型区间</span>
            </div>
            {abilities.axes.map(axis => <div key={axis.id} className="deck-ability-row" role="img"
              aria-label={`${axis.name} ${axis.score.toFixed(1)}分；样本中间50%区间 ${axis.low.toFixed(1)}至${axis.high.toFixed(1)}分`}>
              <span aria-hidden="true">{axis.name}</span>
              <span className="deck-ability-track" aria-hidden="true">
                <i className="deck-ability-band" style={{ left: `${axis.low}%`, width: `${axis.high - axis.low}%` }} />
                <i className="deck-ability-point" style={{ left: `${axis.score}%`, backgroundColor: abilityPointColor(axis.score, axis.low, axis.high) }} />
              </span>
              <span className="deck-ability-score" aria-hidden="true">{axis.score.toFixed(1)}</span>
            </div>)}
            <div className="deck-ability-row deck-ability-scale" aria-hidden="true"><span /><span>
              {[0, 50, 100].map(tick => <span key={tick} style={{ left: `${tick}%` }}>{tick}</span>)}
            </span><span /></div>
          </> : <p className="deck-ability-unavailable" role="status">{abilities?.status === 'incomplete'
            ? '构筑满39张后显示能力评分' : '部分卡牌资料缺失或数值无效，无法计算评分'}</p>}
        </div>
      </section>
    </motion.div>}
    </AnimatePresence>, document.body)}
  </>;
}
