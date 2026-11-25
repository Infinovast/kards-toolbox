import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChartColumn, Library, Upload, X } from 'lucide-react';
import { decodeDeckCode, findCardsByImportId, findDuplicateDeck } from '../lib/deckCode';
import { extractDeckCodeFromText, inferDeckTitleFromText } from '../lib/deckImport';
import { DECK_COST_CATEGORIES, summarizeDeckCosts } from '../lib/deckCostCurve';
import { analyzeDeckAbilities, type DeckAbilityResult } from '../lib/deckAnalysis';
import { factionIcon, WILDCARDS } from '../lib/assetCatalog';
import { defaultDeckName, normalizeDeckName } from '../lib/deckName';
import { handleDialogKeys } from '../lib/dialogKeyboard';
import { cardDisplayTitle, factionLabel, type KardsCardRecord } from '../types/card';
import { DeckCostColumns } from './DeckCostChart';
import DeckCompareImage from './DeckCompareImage';
import CardDetailModal from './CardDetailModal';
import { CardFace } from './CardFace';
import { captureCardDetailOrigin } from '../lib/cardDetailOrigin';
import { revealDetailItem, type CardDetailItem } from '../lib/cardDetailPaging';
import ReservedBadge from './ReservedBadge';
import DeckNationCounts from './DeckNationCounts';
import KreditLabel from './KreditLabel';
import './deckCompare.css';

export interface ComparedDeck {
  code: string;
  name: string;
  mainNation: string;
  allyNation: string;
  headquartersId?: string;
  cardBackId?: string;
  mainCardCount: number;
  allyCardCount: number;
  curve: ReturnType<typeof summarizeDeckCosts>;
  abilities: DeckAbilityResult;
}

export interface ExistingCompareDeck {
  id: string;
  code: string;
  name: string;
  mainNation: string;
  allyNation?: string;
  hasReserved: boolean;
  headquartersId?: string;
  cardBackId?: string;
}

type ImportComparedDeck = (deck: ComparedDeck) => Promise<{ imported: boolean; name: string }>;
export interface DeckCompareSelectionRequest { deck: ExistingCompareDeck; revision: number }

function CompareDeckInput({ slot, cards, cardsById, existingDecks, deck, text, setText, occupiedDeckIds, costMax, tablecloth, onAnalyze, onInvalidate, onImportDeck, selectionRequest }: {
  slot: 'A' | 'B';
  cards: KardsCardRecord[];
  cardsById: Map<string, KardsCardRecord>;
  existingDecks: ExistingCompareDeck[];
  deck: ComparedDeck | null;
  text: string;
  setText: (text: string) => void;
  occupiedDeckIds: Set<string>;
  costMax: number;
  tablecloth?: string;
  onAnalyze: (deck: ComparedDeck) => void;
  onInvalidate: () => void;
  onImportDeck: ImportComparedDeck;
  selectionRequest?: DeckCompareSelectionRequest;
}) {
  const [name, setName] = useState('');
  const [metadata, setMetadata] = useState<{ headquartersId?: string; cardBackId?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(null);
  const [duplicateDeck, setDuplicateDeck] = useState<ExistingCompareDeck | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [detailCard, setDetailCard] = useState<KardsCardRecord | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<ReturnType<typeof captureCardDetailOrigin>>();
  const codeInput = useRef<HTMLTextAreaElement>(null);
  const cardStrip = useRef<HTMLDivElement>(null);
  const savingRef = useRef(false);
  const id = `compare-deck-${slot.toLowerCase()}`;

  const uniqueDeckCards = useMemo(() => {
    if (!deck) return [];
    return [...decodeDeckCode(deck.code).counts]
      .flatMap(([importId, count]) => {
        const card = cardsById.get(importId);
        return card ? [{ card, importId, count }] : [];
      })
      .sort((a, b) => (a.card.json.kredits ?? 99) - (b.card.json.kredits ?? 99));
  }, [deck?.code, cardsById]);
  const stripCards = useMemo(() => uniqueDeckCards.flatMap(entry => Array.from({ length: entry.count }, (_, copy) => ({
    card: entry.card, importId: entry.importId, key: `${entry.importId}-${copy}`,
  }))), [uniqueDeckCards]);
  const detailSequence = useMemo<CardDetailItem[]>(() => uniqueDeckCards.map(({ card }) => ({ card })), [uniqueDeckCards]);

  useEffect(() => {
    if (!deck) { setDetailCard(null); setDetailOrigin(undefined); return; }
    const element = cardStrip.current;
    if (!element) return;
    const scrollHorizontally = (event: WheelEvent) => {
      if (event.ctrlKey || element.scrollWidth <= element.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      const next = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, element.scrollLeft + delta));
      if (next === element.scrollLeft) return;
      event.preventDefault();
      event.stopPropagation();
      element.scrollLeft = next;
    };
    element.addEventListener('wheel', scrollHorizontally, { passive: false });
    return () => element.removeEventListener('wheel', scrollHorizontally);
  }, [deck?.code, uniqueDeckCards.length]);

  useEffect(() => {
    if (selectedExistingId || !text.trim()) {
      setDuplicateDeck(null);
      setCheckingDuplicate(false);
      return;
    }
    setDuplicateDeck(null);
    setCheckingDuplicate(true);
    const timer = window.setTimeout(() => {
      try {
        const code = extractDeckCodeFromText(text);
        setDuplicateDeck(code ? findDuplicateDeck(code, existingDecks) || null : null);
      } catch {
        setDuplicateDeck(null);
      }
      setCheckingDuplicate(false);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [text, existingDecks, selectedExistingId]);

  useLayoutEffect(() => {
    const element = codeInput.current;
    if (!element) return;
    const resize = () => {
      element.style.height = 'auto';
      element.style.height = `${text ? Math.max(38, element.scrollHeight + 2) : 38}px`;
    };
    resize();
    const observer = new ResizeObserver(() => {
      if (element.dataset.width !== String(element.clientWidth)) {
        element.dataset.width = String(element.clientWidth); resize();
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [text]);

  const analyze = async (persist: boolean, source?: ExistingCompareDeck) => {
    if (savingRef.current || (!source && selectedExistingId)) return;
    setError(null); setStatus(null);
    let parsed: ComparedDeck;
    try {
      const inputText = source?.code ?? text;
      const inputName = source?.name ?? name;
      const code = extractDeckCodeFromText(inputText);
      const decoded = decodeDeckCode(code);
      const total = [...decoded.counts.values()].reduce((sum, count) => sum + count, 0);
      if (!total) { setError('卡组中还没有卡牌，请导入包含卡牌的卡组。'); return; }
      const missing = [...decoded.counts.keys()].filter(cardId => !cardsById.has(cardId));
      if (missing.length) { setError(`本地资料库中找不到 ${missing.length} 种卡牌，请检查卡组码或更新卡牌数据。`); return; }
      const countForNation = (nation: string) => [...decoded.counts].reduce((sum, [cardId, count]) =>
        sum + (cardsById.get(cardId)?.json.faction?.toLowerCase() === nation.toLowerCase() ? count : 0), 0);
      const fallbackName = normalizeDeckName(inferDeckTitleFromText(inputText, code), defaultDeckName(decoded.mainNation, decoded.allyNation));
      parsed = {
        code, name: normalizeDeckName(inputName, fallbackName),
        mainNation: decoded.mainNation, allyNation: decoded.allyNation,
        ...(source ? { headquartersId: source.headquartersId, cardBackId: source.cardBackId } : metadata),
        mainCardCount: countForNation(decoded.mainNation) + 1,
        allyCardCount: decoded.mainNation.toLowerCase() === decoded.allyNation.toLowerCase() ? 0 : countForNation(decoded.allyNation),
        curve: summarizeDeckCosts(decoded.counts, cardsById),
        abilities: analyzeDeckAbilities(decoded.counts, cardsById),
      };
    } catch {
      setError('卡组码格式无效。请粘贴以 %% 开头的完整卡组码或游戏内分享文本。');
      return;
    }
    if (persist) {
      const duplicate = findDuplicateDeck(parsed.code, existingDecks);
      if (duplicate) {
        setDuplicateDeck(duplicate);
        setStatus(`卡组已存在：“${duplicate.name}”，仍可仅分析。`);
        return;
      }
      savingRef.current = true; setSaving(true);
      try {
        const result = await onImportDeck(parsed);
        setStatus(result.imported ? '已导入卡组并完成分析。' : `卡组已存在：“${result.name}”，已完成分析。`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '保存卡组失败，请重试。');
        return;
      } finally { savingRef.current = false; setSaving(false); }
    }
    onAnalyze(parsed);
  };

  const selectExistingDeck = (item: ExistingCompareDeck) => {
    setText(item.code); setName(item.name); setMetadata({ headquartersId: item.headquartersId, cardBackId: item.cardBackId });
    setSelectedExistingId(item.id); setDuplicateDeck(null); setCheckingDuplicate(false); onInvalidate(); setPickerOpen(false); void analyze(false, item);
  };
  useEffect(() => {
    if (!selectionRequest) return;
    if (slot === 'A') selectExistingDeck(selectionRequest.deck);
    else setPickerOpen(true);
  }, [selectionRequest]);

  return <section className={`deck-compare-column is-${slot === 'A' ? 'left' : 'right'} glass-panel`} aria-label={`${slot === 'A' ? '左' : '右'}侧卡组`}>
    <form onSubmit={event => { event.preventDefault(); void analyze(false); }}>
      <label htmlFor={`${id}-name`}>卡组名称<span>（选填）</span></label>
      <input id={`${id}-name`} value={name} onChange={event => { setName(event.target.value); setSelectedExistingId(null); setStatus(null); onInvalidate(); }}
        disabled={saving} placeholder="留空时自动识别名称" autoComplete="off" />
      <label htmlFor={`${id}-code`}>卡组码或分享文本</label>
      <textarea ref={codeInput} id={`${id}-code`} value={text} disabled={saving} spellCheck={false} rows={1}
        autoFocus={slot === 'A'} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => { setText(event.target.value); setSelectedExistingId(null); setDuplicateDeck(null); setCheckingDuplicate(!!event.target.value.trim()); setMetadata({}); setError(null); setStatus(null); onInvalidate(); }}
        placeholder="粘贴卡组码或完整分享文本" />
      <div className="deck-compare-import-actions">
        <button type="button" className="deck-compare-analyze is-secondary" disabled={saving || !existingDecks.length} aria-haspopup="dialog" onClick={() => setPickerOpen(true)}>
          <Library className="h-4 w-4" aria-hidden="true" />选择现有卡组
        </button>
        <button type="submit" className="deck-compare-analyze is-secondary" disabled={saving || !!selectedExistingId || !text.trim()}>
          <ChartColumn className="h-4 w-4" aria-hidden="true" />仅分析
        </button>
        <button type="button" className="deck-compare-analyze" disabled={saving || !!selectedExistingId || !text.trim() || checkingDuplicate || !!duplicateDeck} onClick={() => void analyze(true)}>
          <Upload className="h-4 w-4" aria-hidden="true" />{saving ? '正在导入…' : '导入并分析'}
        </button>
      </div>
      {error && <p id={`${id}-error`} role="alert" className="deck-compare-error">{error}</p>}
      {duplicateDeck && !selectedExistingId && <p role="status" className="deck-compare-status">卡组已存在：“{duplicateDeck.name}”，仍可仅分析。</p>}
      {status && <p role="status" className="deck-compare-status">{status}</p>}
    </form>
    {pickerOpen && createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setPickerOpen(false)} />
      <section role="dialog" aria-modal="true" aria-label="选择现有卡组" tabIndex={-1} onKeyDown={handleDialogKeys} className="deck-compare-picker glass-panel">
        <header><h2>选择卡组</h2><button type="button" data-dialog-cancel aria-label="关闭现有卡组选择" onClick={() => setPickerOpen(false)}><X className="h-5 w-5" /></button></header>
        <ul className="no-scrollbar">{existingDecks.map(item => <li key={item.id}><button type="button" disabled={occupiedDeckIds.has(item.id)} onClick={() => selectExistingDeck(item)}><span className="deck-compare-picker-name"><span>{item.name}</span>{item.hasReserved && <ReservedBadge label="卡组含预备卡" />}</span>
          <span className="deck-compare-picker-nations">{[item.mainNation, ...(item.allyNation && item.allyNation !== item.mainNation ? [item.allyNation] : [])].map((nation, index) => <img key={nation} src={factionIcon(nation)} alt={`${index === 0 ? '主国' : '盟国'}：${factionLabel(nation)}`} title={`${index === 0 ? '主国' : '盟国'}：${factionLabel(nation)}`} />)}</span>
        </button></li>)}</ul>
      </section>
    </div>, document.body)}
    {deck ? <section className="deck-compare-analysis" aria-label={`卡组 ${slot} 分析`}>
      <div className="deck-compare-result-heading">
        <div className="deck-compare-heading-title"><h3>{deck.name}</h3><DeckCompareImage deck={deck} cards={cards} tablecloth={tablecloth} /></div>
        <DeckNationCounts mainNation={deck.mainNation} allyNation={deck.allyNation} mainCount={deck.mainCardCount} allyCount={deck.allyCardCount} />
      </div>
      <div ref={cardStrip} className="deck-compare-card-strip custom-scrollbar" aria-label={`${deck.name}卡牌列表`}>
        {stripCards.map(({ card, importId, key }) => <button key={key} type="button" className="deck-compare-card-tile" data-deck-card-id={importId}
          title={cardDisplayTitle(card, 'zh-Hans')} aria-label={`查看${cardDisplayTitle(card, 'zh-Hans')}`}
          onClick={event => { setDetailCard(card); setDetailOrigin(captureCardDetailOrigin(event.currentTarget, 'pool', undefined, event.nativeEvent)); }}>
          <CardFace card={card} />
        </button>)}
      </div>
      {detailCard && <CardDetailModal card={detailCard} origin={detailOrigin} cards={cards} sequence={detailSequence}
        onNavigate={item => revealDetailItem(item, 'strip', cardStrip.current)} onClose={() => { setDetailCard(null); setDetailOrigin(undefined); }} />}
      <DeckCostColumns curve={deck.curve} costMax={costMax} />
    </section> : <p className="deck-compare-empty">导入后查看费用曲线、稀有度和五项能力评分。</p>}
  </section>;
}

const rarityRows = [{ id: 'Elite', label: '精英' }, { id: 'Special', label: '特殊' }, { id: 'Limited', label: '稀有' }, { id: 'Standard', label: '普通' }];
function RarityIcon({ id }: { id: string }) {
  return <span className="ready-deck-rarity-icon"><img src={WILDCARDS.Common[id]} alt="" /></span>;
}
function difference(a: number, b: number, decimals = 0) {
  const value = Number(Math.abs(b - a).toFixed(decimals));
  return value ? value.toFixed(decimals) : null;
}

const averageCostRows = [
  { key: 'cost', label: '平均花费' },
  { key: 'unitDeployment', label: '平均单位部署' },
  { key: 'unitOperation', label: '平均单位行动' },
] as const;

function ComparisonTable({ left, right }: { left: ComparedDeck | null; right: ComparedDeck | null }) {
  const decks = [left, right];
  const rows: { key: string; label: ReactNode; value: (deck: ComparedDeck) => ReactNode; amount?: (deck: ComparedDeck) => number; emphasize?: 'larger' | 'smaller'; delta?: (a: ComparedDeck, b: ComparedDeck) => ReactNode }[] = [
    ...DECK_COST_CATEGORIES.map(({ key, label, color }) => ({ key, label: <span className="deck-compare-parameter"><i className="deck-cost-swatch" style={{ backgroundColor: color }} />{label}</span>, value: (deck: ComparedDeck) => deck.curve.totals[key], amount: (deck: ComparedDeck) => deck.curve.totals[key], emphasize: 'larger' as const, delta: (a: ComparedDeck, b: ComparedDeck) => difference(a.curve.totals[key], b.curve.totals[key]) })),
    ...averageCostRows.map(({ key, label }) => ({
      key, label,
      value: (deck: ComparedDeck) => <KreditLabel cost={deck.curve.averages[key].toFixed(2)} compact />,
      amount: (deck: ComparedDeck) => Number(deck.curve.averages[key].toFixed(2)),
      emphasize: 'smaller' as const,
      delta: (a: ComparedDeck, b: ComparedDeck) => {
        const cost = difference(a.curve.averages[key], b.curve.averages[key], 2);
        return cost === null ? null : <KreditLabel cost={cost} compact />;
      },
    })),
    { key: 'ratio', label: '单位 / 指令比', value: deck => `${deck.curve.totals.army + deck.curve.totals.air} : ${deck.curve.totals.order + deck.curve.totals.countermeasure}` },
    ...rarityRows.map(({ id, label }) => ({ key: id, label: <span className="deck-compare-parameter"><RarityIcon id={id} />{label}</span>, value: (deck: ComparedDeck) => deck.curve.rarities[id] || 0, amount: (deck: ComparedDeck) => deck.curve.rarities[id] || 0, emphasize: 'larger' as const, delta: (a: ComparedDeck, b: ComparedDeck) => difference(a.curve.rarities[id] || 0, b.curve.rarities[id] || 0) })),
  ];
  return <section className="deck-compare-summary glass-panel" aria-labelledby="compare-summary-heading">
    <h2 id="compare-summary-heading">数据对比</h2>
    <table className="deck-compare-table"><thead><tr><th scope="col">参数</th>{decks.map((deck, i) => <th scope="col" className={`is-${i === 0 ? 'left' : 'right'}`} key={i}>{deck?.name || '待分析'}</th>)}<th scope="col" title="两侧卡组数值的绝对差距">差距</th></tr></thead>
      <tbody>{rows.map(row => {
        const delta = left && right ? row.delta?.(left, right) : null;
        const advantage = left && right && row.amount ? (row.amount(left) - row.amount(right)) * (row.emphasize === 'smaller' ? -1 : 1) : 0;
        const emphasizedSide = advantage > 0 ? 'left' : advantage < 0 ? 'right' : undefined;
        return <tr key={row.key} data-parameter={row.key}><th scope="row">{row.label}</th>{decks.map((deck, i) => {
          const side = i === 0 ? 'left' : 'right';
          return <td key={i} className={emphasizedSide === side ? `is-emphasized is-${side}` : undefined}>{deck ? row.value(deck) : '—'}</td>;
        })}<td className="deck-compare-difference">{delta == null ? '—' : <span className={`deck-compare-difference-pill${emphasizedSide ? ` is-${emphasizedSide}` : ''}`}>{delta}</span>}</td></tr>;
      })}</tbody>
    </table>
  </section>;
}

function CombinedAbilityChart({ left, right }: { left: ComparedDeck | null; right: ComparedDeck | null }) {
  const decks = [left, right];
  const ready = decks.find(deck => deck?.abilities.status === 'ready');
  const message = (deck: ComparedDeck) => `${deck.name}：${deck.abilities.status === 'incomplete' ? '构筑满39张后显示能力评分' : '部分卡牌资料缺失或数值无效，无法计算评分'}`;
  return <section className="deck-compare-ability-summary glass-panel" aria-labelledby="compare-ability-heading">
    <h2 id="compare-ability-heading">卡组评分</h2>
    <div className="deck-compare-ability-legend">{decks.map((deck, i) => deck && <span key={i} className={`is-${i === 0 ? 'left' : 'right'}`}><i className={`deck-compare-marker is-${i === 0 ? 'left' : 'right'}`} />{deck.name}</span>)}{ready && <span><i className="deck-ability-band" />典型区间</span>}</div>
    {ready && <div className="deck-compare-ability-chart">
      {ready.abilities.axes.map(axis => {
        const scores = decks.map(deck => deck?.abilities.status === 'ready' ? deck.abilities.axes.find(item => item.id === axis.id) : undefined);
        const delta = scores[0] && scores[1] ? Number((scores[0].score - scores[1].score).toFixed(1)) : undefined;
        const leadingSide = delta && delta > 0 ? 'left' : delta && delta < 0 ? 'right' : undefined;
        return <div key={axis.id} className="deck-compare-ability-row" role="img" aria-label={`${axis.name}：${decks.map((deck, i) => deck ? `${deck.name} ${scores[i] ? scores[i]!.score.toFixed(1) + '分' : '暂无评分'}` : '').filter(Boolean).join('，')}`}>
          <span className={`deck-compare-ability-label${leadingSide ? ` is-${leadingSide}` : ''}`}>{axis.name}</span><span className="deck-compare-ability-track"><i className="deck-ability-band" style={{ left: `${axis.low}%`, width: `${axis.high - axis.low}%` }} />{scores.map((score, i) => score && <span key={i} className={`deck-compare-ability-point is-${i === 0 ? 'left' : 'right'}`} style={{ left: `${score.score}%` }}><i className={`deck-compare-marker is-${i === 0 ? 'left' : 'right'}`} /><span>{score.score.toFixed(1)}</span></span>)}</span>
          <span className="deck-compare-ability-difference">{delta === undefined ? '—' : <span className={`deck-compare-difference-pill${leadingSide ? ` is-${leadingSide}` : ''}`} title="两侧评分差距">+{Math.abs(delta).toFixed(1)}</span>}</span>
        </div>;
      })}
      <div className="deck-compare-ability-scale" aria-hidden="true"><span /><span>{[0, 50, 100].map(tick => <i key={tick} style={{ left: `${tick}%` }}>{tick}</i>)}</span><span /></div>
    </div>}
    {decks.map((deck, i) => deck && deck.abilities.status !== 'ready' && <p key={i} role="status" className="deck-compare-ability-unavailable">{message(deck)}</p>)}
  </section>;
}

export default function DeckComparePage({ active, cards, existingDecks, onBack, tablecloth, onImportDeck, selectionRequest }: {
  active: boolean;
  cards: KardsCardRecord[];
  existingDecks: ExistingCompareDeck[];
  onBack: () => void;
  tablecloth?: string;
  onImportDeck: ImportComparedDeck;
  selectionRequest?: DeckCompareSelectionRequest;
}) {
  const cardsById = useMemo(() => findCardsByImportId(cards), [cards]);
  const [left, setLeft] = useState<ComparedDeck | null>(null);
  const [right, setRight] = useState<ComparedDeck | null>(null);
  const [leftText, setLeftText] = useState('');
  const [rightText, setRightText] = useState('');
  const occupiedDeckIds = useMemo(() => {
    const ids = new Set<string>();
    for (const text of [leftText, rightText]) {
      try {
        const code = extractDeckCodeFromText(text);
        const deck = existingDecks.find(item => item.code === code) || findDuplicateDeck(code, existingDecks);
        if (deck) ids.add(deck.id);
      } catch { /* An empty or invalid input does not occupy a saved deck. */ }
    }
    return ids;
  }, [leftText, rightText, existingDecks]);
  const costMax = Math.max(left?.curve.max || 1, right?.curve.max || 1);
  useEffect(() => {
    if (!active) return;
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault(); onBack();
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [active, onBack]);
  return <section className="deck-compare-page" aria-label="卡组对比">
    <div className="deck-compare-scroll custom-scrollbar">
      <div className="deck-compare-grid">
        <CompareDeckInput slot="A" cards={cards} cardsById={cardsById} existingDecks={existingDecks} deck={left} text={leftText} setText={setLeftText} occupiedDeckIds={occupiedDeckIds} costMax={costMax} tablecloth={tablecloth} onAnalyze={setLeft} onInvalidate={() => setLeft(null)} onImportDeck={onImportDeck} selectionRequest={selectionRequest} />
        <CompareDeckInput slot="B" cards={cards} cardsById={cardsById} existingDecks={existingDecks} deck={right} text={rightText} setText={setRightText} occupiedDeckIds={occupiedDeckIds} costMax={costMax} tablecloth={tablecloth} onAnalyze={setRight} onInvalidate={() => setRight(null)} onImportDeck={onImportDeck} selectionRequest={selectionRequest} />
      </div>
      {(left || right) && <div className="deck-compare-metrics-layout"><ComparisonTable left={left} right={right} /><CombinedAbilityChart left={left} right={right} /></div>}
    </div>
  </section>;
}
