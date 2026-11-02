import { useEffect, useMemo, useReducer, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, Redo2, Save, Search, Undo2, X } from 'lucide-react';
import localforage from 'localforage';
import { queueUserDataTask, saveUserData } from '../lib/userDataStorage';
import { cardDisplayTitle, cardTitle, factionLabel, type KardsCardRecord } from '../types/card';
import { handleDialogKeys } from '../lib/dialogKeyboard';
import DeckCardStrip, { DeckHeadquartersStrip } from './DeckCardStrip';
import CustomSelect from './CustomSelect';
import PageIndicator from './PageIndicator';
import useCardPoolLayout from '../lib/useCardPoolLayout';
import { captureCardDetailOrigin, type CardDetailOrigin } from '../lib/cardDetailOrigin';
import CardDetailModal from './CardDetailModal';
import { revealDetailItem, type CardDetailItem } from '../lib/cardDetailPaging';
import { nationOptions } from './CardFilterSelects';
import BuilderFilters from './BuilderFilters';
import { decodeDeckCode, encodeDeckCode, findCardsByImportId } from '../lib/deckCode';
import { DEFAULT_DECK_RULES, deckModeLabel, deckRuleSet, validateDeck, type DeckRuleSet } from '../lib/deckRules';
import { defaultHeadquartersForNation, headquartersForDeck, type HeadquartersAsset } from '../lib/cardAssets';
import { CardFace, RaritySlots } from './CardFace';
import ReservedBadge from './ReservedBadge';
import SearchClearButton from './SearchClearButton';
import DeckCountIndicator from './DeckCountIndicator';
import DeckCardMotion, { useDeckCardMotion } from './DeckCardMotion';
import { CARD_SEARCH_HINT, EMPTY_CARD_FILTERS, isGeneratedCard, isInBuilderPool, matchesCardFilters, type CardFilters } from '../lib/cardFilters';
import { deckBuilderReducer, type DeckBuilderState } from '../lib/deckBuilderHistory';

export interface BuilderDeck {
  id?: string;
  name: string;
  code: string;
  ruleSet?: DeckRuleSet;
  headquartersId?: string;
}
interface Draft {
  mainNation: string;
  allyNation: string;
  entries: [string, number][];
  deckName: string;
  deckId?: string;
  headquartersId?: string;
}
const inputClass = 'rounded border border-kards-border bg-kards-input-bg px-3 py-2 text-sm text-kards-text';
const POOL_CARD_DRAG_TYPE = 'application/x-kards-pool-card';
const DECK_CARD_DRAG_TYPE = 'application/x-kards-deck-card';

export default function DeckBuilder({ cards, initialDeck, onSave, onBack, active = true, exitRequestRef }: {
  active?: boolean;
  cards: KardsCardRecord[];
  initialDeck: BuilderDeck | null;
  onSave: (deck: BuilderDeck, warnings: string[]) => void | Promise<void>;
  onBack: () => void;
  exitRequestRef?: { current: ((afterLeave?: () => void) => void) | null };
}) {
  const [history, dispatch] = useReducer(deckBuilderReducer, null, () => ({
    past: [], future: [], present: {
      mainNation: 'Germany', allyNation: 'Soviet',
      headquartersId: defaultHeadquartersForNation('Germany')?.groupId || '',
      entries: new Map<string, number>(), deckName: '新卡组', deckId: undefined,
    },
  }));
  const initialState = useRef<DeckBuilderState | null>(null);
  const afterLeave = useRef<(() => void) | undefined>(undefined);
  const { mainNation, allyNation, headquartersId, entries, deckName, deckId } = history.present;
  const [filters, setFilters] = useState<CardFilters>({ ...EMPTY_CARD_FILTERS, status: ['active'] });
  const setFilter = <K extends keyof CardFilters,>(key: K, value: CardFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filters, mainNation, allyNation, cards]);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) rootRef.current?.focus(); }, [active]);
  const [message, setMessage] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [confirmToast, setConfirmToast] = useState<{ kind: 'exit' | 'short'; message: string } | null>(null);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftLoadAttempt, setDraftLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const savingLock = useRef(false);
  const draftTimer = useRef<number | undefined>(undefined);
  const [selectedCard, setSelectedCard] = useState<KardsCardRecord | null>(null);
  const [selectedHeadquarters, setSelectedHeadquarters] = useState<HeadquartersAsset | null>(null);
  const [detailOrigin, setDetailOrigin] = useState<CardDetailOrigin | undefined>();
  useEffect(() => { if (!active) { setSelectedCard(null); setSelectedHeadquarters(null); } }, [active]);
  const [pendingNation, setPendingNation] = useState<{ field: 'main' | 'ally'; value: string } | null>(null);
  const [dragOverZone, setDragOverZone] = useState<'pool' | 'deck' | null>(null);
  const setDeckName = (deckName: string) => dispatch({ type: 'edit', update: { deckName } });
  const requestNationChange = (field: 'main' | 'ally', value: string) => {
    if (value !== (field === 'main' ? mainNation : allyNation)) setPendingNation({ field, value });
  };

  const rememberInitial = (value: DeckBuilderState) => { initialState.current = value; };
  const sameState = (left: DeckBuilderState, right: DeckBuilderState) =>
    left.mainNation === right.mainNation && left.allyNation === right.allyNation && left.headquartersId === right.headquartersId
      && left.deckName === right.deckName && left.deckId === right.deckId
      && left.entries.size === right.entries.size && [...left.entries].every(([id, count]) => right.entries.get(id) === count);
  const isDirty = !!initialState.current && !sameState(history.present, initialState.current);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);
  const showToast = (value: string) => setToast(value);

  useEffect(() => {
    let disposed = false;
    queueUserDataTask(() => localforage.getItem<Draft>('kards_builder_draft')).then((draft) => {
      if (disposed) return;
      if (!draft) { rememberInitial(history.present); setDraftLoaded(true); return; }
      const value = {
        mainNation: draft.mainNation, allyNation: draft.allyNation, deckName: draft.deckName, deckId: draft.deckId,
        entries: new Map(draft.entries),
        headquartersId: draft.headquartersId && draft.headquartersId !== 'default' ? draft.headquartersId : defaultHeadquartersForNation(draft.mainNation)?.groupId || '',
      };
      rememberInitial(value); dispatch({ type: 'reset', value });
      setDraftLoaded(true); setMessage('');
    }).catch(() => { if (!disposed) setMessage('构筑草稿读取失败，已停止自动保存'); });
    return () => { disposed = true; };
  }, [draftLoadAttempt]);

  useEffect(() => {
    if (!initialDeck || !draftLoaded) return;
    try {
      const decoded = decodeDeckCode(initialDeck.code);
      const value = {
        mainNation: decoded.mainNation, allyNation: decoded.allyNation, entries: decoded.counts,
        headquartersId: initialDeck.headquartersId && initialDeck.headquartersId !== 'default' ? initialDeck.headquartersId : defaultHeadquartersForNation(decoded.mainNation)?.groupId || '',
        deckName: initialDeck.name, deckId: initialDeck.id,
      };
      rememberInitial(value); dispatch({ type: 'reset', value });
      setMessage('');
    } catch (error) { setMessage(String(error)); }
  }, [initialDeck, draftLoaded]);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      void saveUserData('kards_builder_draft', { mainNation, allyNation, headquartersId, entries: [...entries], deckName, deckId })
        .catch(() => setMessage('草稿保存失败，请检查本地存储空间'));
    }, 250);
    draftTimer.current = timer;
    return () => window.clearTimeout(timer);
  }, [mainNation, allyNation, headquartersId, entries, deckName, deckId, draftLoaded]);

  useEffect(() => {
    setFilters(current => {
      const factions = current.factions.filter(nation => nation === mainNation || nation === allyNation);
      return factions.length === current.factions.length ? current : { ...current, factions };
    });
  }, [mainNation, allyNation]);

  const cardsById = useMemo(() => findCardsByImportId(cards), [cards]);
  const cardMotion = useDeckCardMotion(rootRef, entries, cardsById, active);
  const ruleSet = deckRuleSet(entries, cardsById);
  const rules = DEFAULT_DECK_RULES[ruleSet];
  const totalCards = [...entries.values()].reduce((sum, count) => sum + count, 0);
  const warnings = validateDeck(entries, cardsById, mainNation, allyNation, rules);
  const matchingCards = useMemo(() => cards.filter(card => isInBuilderPool(card, mainNation, allyNation) && matchesCardFilters(card, filters)), [cards, mainNation, allyNation, filters]);
  const pool = useCardPoolLayout('builder', matchingCards.length, page, setPage);
  const expansions = useMemo(() => [...new Set(cards.filter(card => !isGeneratedCard(card)).map(card => card.json.set).filter(Boolean))].sort(), [cards]);
  const sortedEntries = useMemo(() => [...entries].sort(([leftId], [rightId]) => {
    const left = cardsById.get(leftId), right = cardsById.get(rightId);
    return (left?.json.kredits ?? 99) - (right?.json.kredits ?? 99)
      || (left ? cardTitle(left, 'zh-Hans') : leftId).localeCompare(right ? cardTitle(right, 'zh-Hans') : rightId, 'zh-Hans')
      || leftId.localeCompare(rightId);
  }), [entries, cardsById]);
  const detailSequence: CardDetailItem[] = detailOrigin?.kind === 'strip'
    ? [
      ...(headquartersForDeck(headquartersId, mainNation) ? [{ headquarters: headquartersForDeck(headquartersId, mainNation)! }] : []),
      ...sortedEntries.flatMap(([id]) => { const card = cardsById.get(id); return card ? [{ card }] : []; }),
    ] : matchingCards.map(card => ({ card }));
  const revealSource = async (item: CardDetailItem) => {
    const kind = detailOrigin?.kind || 'pool';
    if (kind === 'pool' && item.card) {
      const index = matchingCards.findIndex(card => card.cardId === item.card.cardId);
      if (index >= 0) setPage(Math.floor(index / pool.capacity) + 1);
    }
    return revealDetailItem(item, kind, kind === 'pool' ? pool.ref.current : rootRef.current);
  };

  const deckLimit = rules.deckSize + 1;
  const totalWithHeadquarters = totalCards + 1;
  const allyCount = mainNation === allyNation ? 0 : [...entries].reduce((sum, [id, count]) => sum + (cardsById.get(id)?.json.faction?.toLowerCase() === allyNation.toLowerCase() ? count : 0), 0);
  const mainCount = 1 + [...entries].reduce((sum, [id, count]) => sum + (cardsById.get(id)?.json.faction?.toLowerCase() === mainNation.toLowerCase() ? count : 0), 0);

  const adjustCard = (importId: string, change: number, source?: HTMLElement) => {
    if (savingLock.current || !draftLoaded) return;
    const currentCount = entries.get(importId) || 0;
    if ((change < 0 && !currentCount) || (change > 0 && currentCount >= 999)) return;
    if (change > 0 && totalWithHeadquarters >= deckLimit) {
      showToast(`卡组的卡牌不能超过 ${deckLimit} 张`);
    } else if (change > 0 && mainNation !== allyNation
      && cardsById.get(importId)?.json.faction?.toLowerCase() === allyNation.toLowerCase()
      && allyCount + change > rules.maxAllyCards) {
      showToast(`卡组中的盟国卡牌不能超过${rules.maxAllyCards}张`);
    }
    cardMotion.prepare(importId, source);
    dispatch({ type: 'edit', update: current => {
    const count = Math.max(0, Math.min(999, (current.entries.get(importId) || 0) + change));
    if (count === (current.entries.get(importId) || 0)) return {};
    const next = new Map<string, number>(current.entries);
    if (count <= 0) next.delete(importId);
    else next.set(importId, count);
    return { entries: next };
    } });
  };
  const changeHistory = (type: 'undo' | 'redo') => {
    const target = type === 'undo' ? history.past.at(-1) : history.future[0];
    const changedId = target && [...new Set([...entries.keys(), ...target.entries.keys()])]
      .find(id => entries.get(id) !== target.entries.get(id));
    if (changedId) cardMotion.prepare(changedId);
    dispatch({ type });
  };
  const hasDragType = (event: DragEvent, type: string) => Array.from(event.dataTransfer.types).includes(type);
  const handleDropToDeck = (event: DragEvent) => {
    if (!hasDragType(event, POOL_CARD_DRAG_TYPE)) return;
    event.preventDefault(); event.stopPropagation();
    adjustCard(event.dataTransfer.getData(POOL_CARD_DRAG_TYPE), 1);
    setDragOverZone(null);
  };
  const handleDropToPool = (event: DragEvent) => {
    if (!hasDragType(event, DECK_CARD_DRAG_TYPE)) return;
    event.preventDefault(); event.stopPropagation();
    adjustCard(event.dataTransfer.getData(DECK_CARD_DRAG_TYPE), -1);
    setDragOverZone(null);
  };

  const saveDeck = async (allowShort = false) => {
    if (savingLock.current || !draftLoaded) return;
    if (!allowShort && totalWithHeadquarters < deckLimit) {
      setConfirmToast({ kind: 'short', message: `保存更改？\n一套有效的卡组应该有 ${deckLimit} 张牌` });
      return;
    }
    const saveWarnings = validateDeck(entries, cardsById, mainNation, allyNation, rules);
    savingLock.current = true; setSaving(true);
    try {
      await onSave({ id: deckId, code: encodeDeckCode(mainNation, allyNation, entries), name: deckName.trim() || '新卡组', ruleSet, headquartersId: headquartersId || defaultHeadquartersForNation(mainNation)?.groupId }, saveWarnings);
      afterLeave.current?.(); afterLeave.current = undefined;
    } catch (error) {
      setMessage(`卡组保存失败：${error instanceof Error ? error.message : '请检查本地存储空间'}。请重试保存。`);
      afterLeave.current = undefined;
    } finally { savingLock.current = false; setSaving(false); }
  };
  const leaveBuilder = () => {
    onBack(); afterLeave.current?.(); afterLeave.current = undefined;
  };
  const requestExit = (next?: () => void) => {
    if (savingLock.current) return;
    afterLeave.current = next;
    if (isDirty) setConfirmToast({ kind: 'exit', message: '保存修改？' });
    else leaveBuilder();
  };
  useEffect(() => {
    if (!exitRequestRef) return;
    exitRequestRef.current = requestExit;
    return () => { exitRequestRef.current = null; };
  });
  const discardOrConfirmSave = () => {
    if (!confirmToast) return;
    const kind = confirmToast.kind;
    setConfirmToast(null);
    if (kind === 'exit') saveDeck();
    else saveDeck(true);
  };
  const cancelConfirmation = () => { setConfirmToast(null); afterLeave.current = undefined; };
  const discardOrCancel = () => {
    const kind = confirmToast?.kind;
    setConfirmToast(null);
    if (kind === 'exit') {
      window.clearTimeout(draftTimer.current);
      void saveUserData('kards_builder_draft', null, { rememberFailure: false }).then(leaveBuilder)
        .catch(() => setMessage('草稿删除失败，尚未退出构筑，请重试'));
    } else afterLeave.current = undefined;
  };

  return <div ref={rootRef} tabIndex={-1} aria-label="卡组构筑" aria-busy={saving} inert={saving} onKeyDown={event => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || !active || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    if (event.key === 'Escape' && (event.target as HTMLElement).tagName !== 'SELECT') { event.preventDefault(); event.stopPropagation(); requestExit(); }
    else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && draftLoaded) { event.preventDefault(); if (isDirty || !deckId) saveDeck(); else leaveBuilder(); }
    else if ((event.ctrlKey || event.metaKey) && !(event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) {
      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        event.preventDefault();
        changeHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo');
      }
    }
  }} className="flex h-full min-h-0 flex-col gap-3 p-4 outline-none">
    <BuilderFilters filters={filters} onChange={setFilters} expansions={expansions} mainNation={mainNation} allyNation={allyNation} />
    <div className="flex min-h-0 flex-1 gap-4">
    <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="builder-pool-toolbar">
        <div className="builder-search relative"><Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-kards-text-muted" /><input title={CARD_SEARCH_HINT} aria-label="构筑搜索卡牌" value={filters.query} onChange={(e) => setFilter('query', e.target.value)} onKeyDown={event => { if (event.key === 'Escape' && filters.query && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); setFilter('query', ''); } }} placeholder="搜索" className={`${inputClass} w-full !pl-7 !pr-9`} /><SearchClearButton label="清除构筑搜索" value={filters.query} onClear={() => setFilter('query', '')} /></div>
        <button type="button" aria-pressed={!filters.status.includes('active')} className="builder-reserved-toggle" onClick={() => setFilter('status', filters.status.includes('active') ? [] : ['active'])}>含预备</button>
        <p className="builder-result-count">找到 <strong>{matchingCards.length}</strong> 张</p>
      </div>
      <div ref={pool.ref} style={pool.style} data-testid="builder-grid" data-capacity={pool.capacity} onDragOver={event => { if (hasDragType(event, DECK_CARD_DRAG_TYPE)) { event.preventDefault(); setDragOverZone('pool'); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverZone(null); }} onDrop={handleDropToPool} className={`card-gallery card-gallery-builder min-h-0 flex-1 rounded ${dragOverZone === 'pool' ? 'ring-2 ring-kards-gold/70' : ''}`}>
        {matchingCards.slice(pool.start, pool.end).map((card) => <div key={card.importId} data-pool-card-id={card.importId} className="card-tile">
          <button disabled={!active || !draftLoaded} draggable={active} onDragStart={event => { event.dataTransfer.setData(POOL_CARD_DRAG_TYPE, card.importId); event.dataTransfer.effectAllowed = 'copy'; }}
            onClick={event => {
              if (event.detail > 1) { adjustCard(card.importId, 1, event.currentTarget); return; }
              setDetailOrigin(captureCardDetailOrigin(event.currentTarget, 'pool', undefined, event.nativeEvent));
              setSelectedHeadquarters(null);
              setSelectedCard(card);
            }}
            onContextMenu={event => { event.preventDefault(); adjustCard(card.importId, -1, event.currentTarget); }}
            data-detail-source={card.cardId} aria-label={'查看' + cardDisplayTitle(card, 'zh-Hans')} title={cardDisplayTitle(card, 'zh-Hans')} className="card-action group block w-full text-left">
            <span className="library-card-art"><CardFace card={card} enabled={active} />{card.reserved && <ReservedBadge className="library-reserved-badge" />}</span>
          </button>
          <RaritySlots rarity={card.json.rarity} count={entries.get(card.importId) || 0} />
        </div>)}
        {!matchingCards.length && <p className="col-span-full self-center text-center text-sm text-kards-text-muted">没有匹配的卡牌，请调整筛选条件或右侧主盟国</p>}
      </div>
      <PageIndicator page={pool.page} pageCount={pool.pageCount} onChange={setPage} />
    </section>
    <aside onDragOver={event => { if (hasDragType(event, POOL_CARD_DRAG_TYPE)) { event.preventDefault(); setDragOverZone('deck'); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverZone(null); }} onDrop={handleDropToDeck} className={`builder-sidebar w-[300px] shrink-0 overflow-hidden rounded-lg border border-kards-border glass-panel xl:w-[340px] ${dragOverZone === 'deck' ? 'ring-2 ring-kards-gold/70' : ''}`}>
      <div className="builder-sidebar-header builder-sidebar-bar"><h2 className="font-bold text-kards-text">{deckId ? '编辑卡组' : '当前卡组'}</h2><DeckCountIndicator compact fullColorNations mainNation={mainNation} allyNation={allyNation} mainCount={mainCount} allyCount={allyCount} allyLimit={rules.maxAllyCards} total={totalWithHeadquarters} limit={deckLimit} /></div>
      <div className="builder-sidebar-scroll custom-scrollbar space-y-3">
      <input value={deckName} onChange={(e) => setDeckName(e.target.value)} className="deck-name-input" aria-label="卡组名称" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.currentTarget.blur(); } }} />
      <p className="builder-mode" aria-label="构筑方式">{deckModeLabel(ruleSet)}</p>
      {totalCards <= 5 && <div className="grid grid-cols-2 gap-2" aria-label="构筑国家选择">
        <CustomSelect label="主国" value={mainNation} onChange={value => requestNationChange('main', value)} className="min-w-0 w-full" options={nationOptions().filter(item => item.value !== 'Neutral').map(item => ({ ...item, label: `${item.label}主国` }))} />
        <CustomSelect label="盟国" value={allyNation} onChange={value => requestNationChange('ally', value)} className="min-w-0 w-full" options={nationOptions().filter(item => item.value !== 'Neutral').map(item => ({ ...item, label: `${item.label}盟国` }))} />
      </div>}
      <div aria-label="构筑卡牌列表" className="min-h-16 space-y-1">
        <DeckHeadquartersStrip nation={mainNation} headquartersId={headquartersId} onClick={(headquarters, origin) => { setDetailOrigin(origin); setSelectedCard(null); setSelectedHeadquarters(headquarters); }} />
        {sortedEntries.map(([id, count]) => {
          const card = cardsById.get(id);
          return <div key={id} className="deck-builder-card-row"><DeckCardStrip card={card} importId={id} count={count} enabled={active && draftLoaded} draggable={active}
            onClick={origin => { if (card) { setDetailOrigin(origin); setSelectedHeadquarters(null); setSelectedCard(card); } }} onDoubleClick={() => adjustCard(id, 1)} onRemove={() => adjustCard(id, -1)}
            onDragStart={event => { event.dataTransfer.setData(DECK_CARD_DRAG_TYPE, id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragOverZone(null)} /></div>;
        })}
        {!entries.size && <p className="py-10 text-center text-sm text-kards-text-muted">从左侧选择卡牌开始构筑</p>}
      </div>
      {warnings.length > 0 && <div className="custom-scrollbar max-h-28 shrink-0 overflow-y-auto rounded bg-kards-input-bg p-2 text-xs text-kards-text-muted"><div className="mb-1 font-bold text-kards-status">冲突</div>{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
      {message && <p role="status" className="custom-scrollbar max-h-16 shrink-0 overflow-y-auto text-xs text-kards-text-muted">{message}</p>}
      {!draftLoaded && message && <button type="button" onClick={() => setDraftLoadAttempt(value => value + 1)} className="rounded border border-kards-border px-3 py-2 text-xs hover:border-kards-gold">重试读取草稿</button>}
      </div>
      <div className="builder-sidebar-footer builder-sidebar-bar"><div aria-label="构筑操作" className="builder-actions">
        <button type="button" onClick={() => changeHistory('undo')} disabled={!history.past.length} aria-label="撤回" title="撤回 · Ctrl+Z"><Undo2 className="h-5 w-5" /></button>
        <button type="button" onClick={() => changeHistory('redo')} disabled={!history.future.length} aria-label="重做" title="重做 · Ctrl+Y / Ctrl+Shift+Z"><Redo2 className="h-5 w-5" /></button>
        <button type="button" onClick={() => isDirty || !deckId ? void saveDeck() : leaveBuilder()} disabled={!draftLoaded || saving} aria-label="保存并退出" title="保存并退出 · Ctrl+Enter" className="builder-save">{isDirty ? <Save className="h-6 w-6" /> : <Check className="h-6 w-6" />}</button>
      </div></div>
    </aside>
    </div>
    {active && <DeckCardMotion flights={cardMotion.flights} onFinish={cardMotion.finish} />}
    {active && (selectedCard || selectedHeadquarters) && <CardDetailModal card={selectedCard || undefined} headquarters={selectedHeadquarters || undefined} origin={detailOrigin} cards={cards} sequence={detailSequence} onNavigate={revealSource}
      onSourceDoubleClick={selectedCard ? () => adjustCard(selectedCard.importId, 1, detailOrigin?.element) : undefined}
      onClose={() => { setSelectedCard(null); setSelectedHeadquarters(null); }} />}
    {active && pendingNation && createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={() => setPendingNation(null)} className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm" />
      <section role="dialog" aria-modal="true" aria-label="确认更换国家" tabIndex={-1} onKeyDown={handleDialogKeys} className="builder-confirm-dialog glass-panel relative w-full max-w-md rounded-lg border border-kards-border p-6 shadow-2xl">
        <h2 className="builder-confirm-title">更换{pendingNation.field === 'main' ? '主国' : '盟国'}？</h2>
        <p className="builder-confirm-description">{factionLabel(pendingNation.field === 'main' ? mainNation : allyNation)} → {factionLabel(pendingNation.value)}</p>
        <p className="mt-3 text-xs leading-6 text-kards-text-muted">现有卡牌将保留，不符合新国家的卡牌会显示规则提示。确认后更新构筑卡池。</p>
        <div className="mt-5 flex justify-center gap-3">
          <button data-dialog-cancel onClick={() => setPendingNation(null)} className="rounded border border-kards-border px-4 py-2 text-sm text-kards-text">取消</button>
          <button data-dialog-confirm onClick={() => {
            dispatch({ type: 'edit', update: pendingNation.field === 'main'
              ? { mainNation: pendingNation.value, headquartersId: defaultHeadquartersForNation(pendingNation.value)?.groupId || '' }
              : { allyNation: pendingNation.value } });
            setPendingNation(null);
          }} className="rounded bg-kards-accent px-4 py-2 text-sm font-bold text-white">确认更换</button>
        </div>
      </section>
    </div>, document.body)}
    {active && toast && createPortal(<div role="status" className="builder-toast">{toast}</div>, document.body)}
    {active && confirmToast && createPortal(<div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm" onClick={cancelConfirmation} />
      <section role="dialog" aria-modal="true" aria-label="确认保存修改" tabIndex={-1} onKeyDown={handleDialogKeys} className="builder-confirm-dialog glass-panel relative w-full max-w-md rounded-lg border border-kards-border p-6 shadow-2xl">
        <button data-dialog-cancel onClick={cancelConfirmation} aria-label="关闭保存确认" className="absolute right-3 top-3 rounded p-1 text-kards-text-muted hover:text-kards-text"><X className="h-4 w-4" /></button>
        <h2 className="builder-confirm-title">{confirmToast.message.split('\n')[0]}</h2>
        {confirmToast.message.includes('\n') && <p className="builder-confirm-description whitespace-pre-line">{confirmToast.message.split('\n').slice(1).join('\n')}</p>}
        <div className="mt-5 flex justify-center gap-3">
          <button onClick={discardOrCancel} className="rounded border border-kards-border px-4 py-2 text-sm text-kards-text">放弃</button>
          <button data-dialog-confirm onClick={discardOrConfirmSave} className="rounded bg-kards-accent px-4 py-2 text-sm font-bold text-white">保存</button>
        </div>
      </section>
    </div>, document.body)}
  </div>;
}
