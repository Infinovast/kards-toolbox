import { useEffect, useMemo, useReducer, useRef, useState, type DragEvent } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Check, Redo2, Search, Undo2, Upload } from 'lucide-react';
import localforage from 'localforage';
import { cardDisplayTitle, cardTitle, factionLabel, type KardsCardRecord } from '../types/card';
import { handleDialogKeys } from '../lib/dialogKeyboard';
import DeckCardStrip, { DeckHeadquartersStrip } from './DeckCardStrip';
import CustomSelect from './CustomSelect';
import PageIndicator from './PageIndicator';
import CardDetailModal from './CardDetailModal';
import CardFilterSelects, { nationOptions } from './CardFilterSelects';
import { decodeDeckCode, encodeDeckCode, findCardsByImportId } from '../lib/deckCode';
import { inferDeckTitleFromText, extractDeckCodeFromText } from '../lib/deckImport';
import { DEFAULT_DECK_RULES, validateDeck, type DeckRuleSet, type DeckRules } from '../lib/deckRules';
import { defaultHeadquartersForNation, type HeadquartersAsset } from '../lib/cardAssets';
import { CardFace, RaritySlots } from './CardFace';
import { EMPTY_CARD_FILTERS, isGeneratedCard, isInBuilderPool, matchesCardFilters, type CardFilters } from '../lib/cardFilters';
import { deckBuilderReducer } from '../lib/deckBuilderHistory';

export interface BuilderDeck {
  id?: string;
  name: string;
  code: string;
  ruleSet?: DeckRuleSet;
  customRules?: DeckRules;
  headquartersId?: string;
}
interface Draft {
  mainNation: string;
  allyNation: string;
  ruleSet: DeckRuleSet;
  customRules: DeckRules;
  entries: [string, number][];
  deckName: string;
  deckId?: string;
  headquartersId?: string;
}
const inputClass = 'rounded border border-kards-border bg-kards-input-bg px-3 py-2 text-sm text-kards-text';
const POOL_CARD_DRAG_TYPE = 'application/x-kards-pool-card';
const DECK_CARD_DRAG_TYPE = 'application/x-kards-deck-card';
const numericRules = [
  ['deckSize', '卡组总张数（含总部）'], ['maxAllyCards', '盟国上限'], ['maxStandard', '普通上限'],
  ['maxLimited', '限定上限'], ['maxSpecial', '特殊上限'], ['maxElite', '精英上限'],
] as const;

export default function DeckBuilder({ cards, initialDeck, onSave, onBack, active = true }: {
  active?: boolean;
  cards: KardsCardRecord[];
  initialDeck: BuilderDeck | null;
  onSave: (deck: BuilderDeck, warnings: string[]) => void;
  onBack: () => void;
}) {
  const [history, dispatch] = useReducer(deckBuilderReducer, null, () => ({
    past: [], future: [], present: {
      mainNation: 'Germany', allyNation: 'Soviet',
      headquartersId: defaultHeadquartersForNation('Germany')?.groupId || '',
      ruleSet: 'standard' as DeckRuleSet, customRules: { ...DEFAULT_DECK_RULES.standard },
      entries: new Map<string, number>(), deckName: '新卡组', deckId: undefined,
    },
  }));
  const { mainNation, allyNation, headquartersId, ruleSet, customRules, entries, deckName, deckId } = history.present;
  const [filters, setFilters] = useState<CardFilters>({ ...EMPTY_CARD_FILTERS, status: 'active' });
  const setFilter = <K extends keyof CardFilters,>(key: K, value: CardFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filters, mainNation, allyNation, cards]);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) rootRef.current?.focus(); }, [active]);
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [selectedCard, setSelectedCard] = useState<KardsCardRecord | null>(null);
  const [selectedHeadquarters, setSelectedHeadquarters] = useState<HeadquartersAsset | null>(null);
  const cardClickTimer = useRef<number | undefined>(undefined);
  const cancelCardClick = () => { window.clearTimeout(cardClickTimer.current); cardClickTimer.current = undefined; };
  useEffect(() => { if (!active) { setSelectedCard(null); setSelectedHeadquarters(null); } return cancelCardClick; }, [active, filters, page]);
  const [pendingNation, setPendingNation] = useState<{ field: 'main' | 'ally'; value: string } | null>(null);
  const [dragOverZone, setDragOverZone] = useState<'pool' | 'deck' | null>(null);
  const setDeckName = (deckName: string) => dispatch({ type: 'edit', update: { deckName } });
  const setRuleSet = (ruleSet: DeckRuleSet) => dispatch({ type: 'edit', update: { ruleSet } });
  const setCustomRules = (customRules: DeckRules) => dispatch({ type: 'edit', update: { customRules } });
  const requestNationChange = (field: 'main' | 'ally', value: string) => {
    if (value !== (field === 'main' ? mainNation : allyNation)) setPendingNation({ field, value });
  };

  useEffect(() => {
    localforage.getItem<Draft>('kards_builder_draft').then((draft) => {
      if (!draft) return;
      dispatch({ type: 'reset', value: {
        ...draft, entries: new Map(draft.entries),
        headquartersId: draft.headquartersId && draft.headquartersId !== 'default' ? draft.headquartersId : defaultHeadquartersForNation(draft.mainNation)?.groupId || '',
        customRules: { ...DEFAULT_DECK_RULES.standard, ...draft.customRules },
      } });
    }).catch(() => setMessage('构筑草稿读取失败，可以重新开始构筑')).finally(() => setDraftLoaded(true));
  }, []);

  useEffect(() => {
    if (!initialDeck || !draftLoaded) return;
    try {
      const decoded = decodeDeckCode(initialDeck.code);
      dispatch({ type: 'reset', value: {
        mainNation: decoded.mainNation, allyNation: decoded.allyNation, entries: decoded.counts,
        headquartersId: initialDeck.headquartersId && initialDeck.headquartersId !== 'default' ? initialDeck.headquartersId : defaultHeadquartersForNation(decoded.mainNation)?.groupId || '',
        deckName: initialDeck.name, deckId: initialDeck.id,
        ruleSet: initialDeck.ruleSet || (decoded.mainNation === decoded.allyNation ? 'arena' : 'standard'),
        customRules: { ...DEFAULT_DECK_RULES.standard, ...initialDeck.customRules },
      } });
      setMessage('');
    } catch (error) { setMessage(String(error)); }
  }, [initialDeck, draftLoaded]);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      localforage.setItem('kards_builder_draft', { mainNation, allyNation, headquartersId, ruleSet, customRules, entries: [...entries], deckName, deckId })
        .catch(() => setMessage('草稿保存失败，请检查本地存储空间'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mainNation, allyNation, headquartersId, ruleSet, customRules, entries, deckName, deckId, draftLoaded]);

  const cardsById = useMemo(() => findCardsByImportId(cards), [cards]);
  const rules = ruleSet === 'custom' ? customRules : DEFAULT_DECK_RULES[ruleSet];
  const totalCards = [...entries.values()].reduce((sum, count) => sum + count, 0);
  const warnings = validateDeck(entries, cardsById, mainNation, allyNation, rules);
  const matchingCards = useMemo(() => cards.filter(card => isInBuilderPool(card, mainNation, allyNation) && matchesCardFilters(card, filters)), [cards, mainNation, allyNation, filters]);
  const expansions = useMemo(() => [...new Set(cards.filter(card => !isGeneratedCard(card)).map(card => card.json.set).filter(Boolean))].sort(), [cards]);
  const sortedEntries = useMemo(() => [...entries].sort(([leftId], [rightId]) => {
    const left = cardsById.get(leftId), right = cardsById.get(rightId);
    return (left?.json.kredits ?? 99) - (right?.json.kredits ?? 99)
      || (left ? cardTitle(left, 'zh-Hans') : leftId).localeCompare(right ? cardTitle(right, 'zh-Hans') : rightId, 'zh-Hans')
      || leftId.localeCompare(rightId);
  }), [entries, cardsById]);

  const adjustCard = (importId: string, change: number) => dispatch({ type: 'edit', update: current => {
    const count = Math.max(0, Math.min(999, (current.entries.get(importId) || 0) + change));
    if (count === (current.entries.get(importId) || 0)) return {};
    const next = new Map<string, number>(current.entries);
    if (count <= 0) next.delete(importId);
    else next.set(importId, count);
    return { entries: next };
  } });
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

  const importCode = () => {
    try {
      const decoded = decodeDeckCode(importText);
      const title = inferDeckTitleFromText(importText, extractDeckCodeFromText(importText));
      dispatch({ type: 'edit', update: {
        mainNation: decoded.mainNation, allyNation: decoded.allyNation, entries: decoded.counts,
        headquartersId: defaultHeadquartersForNation(decoded.mainNation)?.groupId || '', deckName: title || '导入的卡组',
      } });
      const unknown = [...decoded.counts.keys()].filter((id) => !cardsById.has(id));
      setMessage(unknown.length ? `导入成功，保留 ${unknown.length} 种未知卡；请手动更新牌库补全资料` : '导入成功');
    } catch (error) { setMessage(error instanceof Error ? error.message : '卡组码无法导入'); }
  };
  const saveDeck = () => {
    onSave({ id: deckId, code: encodeDeckCode(mainNation, allyNation, entries), name: deckName.trim() || '新卡组', ruleSet, customRules, headquartersId: headquartersId || defaultHeadquartersForNation(mainNation)?.groupId }, warnings);
  };

  return <div ref={rootRef} tabIndex={-1} aria-label="卡组构筑" onKeyDown={event => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || !active || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
    if (event.key === 'Escape' && (event.target as HTMLElement).tagName !== 'SELECT') { event.preventDefault(); event.stopPropagation(); onBack(); }
    else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && draftLoaded) { event.preventDefault(); saveDeck(); }
    else if ((event.ctrlKey || event.metaKey) && !(event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]')) {
      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        event.preventDefault();
        dispatch({ type: key === 'y' || event.shiftKey ? 'redo' : 'undo' });
      }
    }
  }} className="flex h-full min-h-0 flex-col gap-3 p-4 outline-none">
      <div aria-label="构筑卡牌筛选" className="builder-filter-bar glass-panel custom-scrollbar">
        <div className="builder-search relative"><Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-kards-text-muted" /><input aria-label="构筑搜索卡牌" value={filters.query} onChange={(e) => setFilter('query', e.target.value)} onKeyDown={event => { if (event.key === 'Escape' && filters.query && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); setFilter('query', ''); } }} placeholder="搜索" className={`${inputClass} w-full !pl-7`} /></div>
        <label className="builder-reserved-toggle"><input type="checkbox" checked={filters.status === 'All'} onChange={event => setFilter('status', event.target.checked ? 'All' : 'active')} />显示预备卡</label>
        <div role="group" aria-label="构筑费用筛选" className="builder-costs">
          {Array.from({ length: 8 }, (_, index) => <button key={index} type="button" aria-label={'费用 ' + index + 'K' + (index === 7 ? '+' : '')}
            aria-pressed={filters.cost.includes(String(index))} className="builder-cost-button" onClick={() => setFilters(current => ({ ...current,
              cost: current.cost.includes(String(index)) ? current.cost.filter(cost => cost !== String(index)) : [...current.cost, String(index)],
            }))}>{index}<small>K{index === 7 ? '+' : ''}</small></button>)}
        </div>
        <CardFilterSelects builder filters={filters} onChange={setFilters} expansions={expansions} />
        <CustomSelect className="builder-filter-select" label="构筑规则" value={ruleSet} onChange={value => setRuleSet(value as DeckRuleSet)} options={[{ value: 'standard', label: '标准构筑' }, { value: 'arena', label: '竞技场' }, { value: 'custom', label: '自定义规则' }]} />
      </div>
    <div className="flex min-h-0 flex-1 gap-4">
    <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      <p className="text-xs text-kards-text-muted">找到 {matchingCards.length} 张</p>
      <div data-testid="builder-grid" onDragOver={event => { if (hasDragType(event, DECK_CARD_DRAG_TYPE)) { event.preventDefault(); setDragOverZone('pool'); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverZone(null); }} onDrop={handleDropToPool} className={`card-gallery card-gallery-builder custom-scrollbar min-h-0 flex-1 overflow-y-auto rounded pb-2 ${dragOverZone === 'pool' ? 'ring-2 ring-kards-gold/70' : ''}`}>
        {matchingCards.slice((page - 1) * 60, page * 60).map((card) => <div key={card.importId} className="card-tile">
          <button disabled={!active || !draftLoaded} draggable={active} onDragStart={event => { cancelCardClick(); event.dataTransfer.setData(POOL_CARD_DRAG_TYPE, card.importId); event.dataTransfer.effectAllowed = 'copy'; }}
            onClick={event => {
              cancelCardClick();
              if (event.detail === 0) setSelectedCard(card);
              else if (event.detail === 1) cardClickTimer.current = window.setTimeout(() => setSelectedCard(card), 500);
            }}
            onDoubleClick={event => { event.preventDefault(); cancelCardClick(); adjustCard(card.importId, 1); }}
            onContextMenu={event => { event.preventDefault(); cancelCardClick(); adjustCard(card.importId, -1); }}
            aria-label={'查看' + cardDisplayTitle(card, 'zh-Hans')} title={cardDisplayTitle(card, 'zh-Hans')} className="card-action group block w-full text-left">
            <CardFace card={card} enabled={active} />
          </button>
          <RaritySlots rarity={card.json.rarity} count={entries.get(card.importId) || 0} />
        </div>)}
        {!matchingCards.length && <p className="col-span-full py-10 text-center text-sm text-kards-text-muted">没有匹配的卡牌，请调整筛选条件或右侧主盟国</p>}
      </div>
      <div className="flex shrink-0 items-center justify-center gap-3 text-xs text-kards-text"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-kards-border px-3 py-1 disabled:opacity-40">上一页</button><PageIndicator page={page} pageCount={Math.max(1, Math.ceil(matchingCards.length / 60))} onChange={setPage} /><button disabled={page * 60 >= matchingCards.length} onClick={() => setPage(page + 1)} className="rounded border border-kards-border px-3 py-1 disabled:opacity-40">下一页</button></div>
    </section>
    <aside onDragOver={event => { if (hasDragType(event, POOL_CARD_DRAG_TYPE)) { event.preventDefault(); setDragOverZone('deck'); } }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOverZone(null); }} onDrop={handleDropToDeck} className={`flex w-[300px] shrink-0 flex-col gap-3 overflow-hidden rounded-lg border border-kards-border glass-panel p-4 xl:w-[340px] ${dragOverZone === 'deck' ? 'ring-2 ring-kards-gold/70' : ''}`}>
      <button onClick={onBack} title="Esc 返回卡组列表" className="flex shrink-0 items-center gap-1 self-start rounded px-2 py-1 text-xs text-kards-text-muted"><ArrowLeft className="h-4 w-4" />返回卡组</button>
      <div className="flex items-center justify-between"><h2 className="font-bold text-kards-text">{deckId ? '编辑卡组' : '当前卡组'}</h2><span aria-label="卡组总张数（含总部）" className="text-lg font-bold tabular-nums"><span className={totalCards > rules.deckSize ? 'text-red-500 dark:text-red-400' : 'text-kards-status'}>{totalCards + 1}</span><span className="text-kards-text-muted"> / {rules.deckSize + 1}</span></span></div>
      <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto">
      <input value={deckName} onChange={(e) => setDeckName(e.target.value)} className="deck-name-input" aria-label="卡组名称" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.currentTarget.blur(); } }} />
      <div className="grid grid-cols-2 gap-2">
        <CustomSelect label="主国" value={mainNation} onChange={value => requestNationChange('main', value)} className="min-w-0 w-full" options={nationOptions().filter(item => item.value !== 'Neutral').map(item => ({ ...item, label: `${item.label}主国` }))} />
        <CustomSelect label="盟国" value={allyNation} onChange={value => requestNationChange('ally', value)} className="min-w-0 w-full" options={nationOptions().filter(item => item.value !== 'Neutral').map(item => ({ ...item, label: `${item.label}盟国` }))} />
      </div>
      {ruleSet === 'custom' && <div className="flex flex-wrap gap-3 rounded border border-kards-border p-2">
        {numericRules.map(([key, label]) => <label key={key} className="flex items-center gap-1 text-xs text-kards-text-muted">{label}<input type="number" min={key === 'deckSize' ? 2 : 1} max={key === 'deckSize' ? 1000 : 999} value={customRules[key] + (key === 'deckSize' ? 1 : 0)} onChange={event => setCustomRules({ ...customRules, [key]: Math.max(1, Math.min(999, (Number(event.target.value) || 1) - (key === 'deckSize' ? 1 : 0))) })} className={`${inputClass} w-16 !px-2 !py-1`} /></label>)}
        <label className="text-xs text-kards-text"><input type="checkbox" checked={customRules.allowReserved} onChange={event => setCustomRules({ ...customRules, allowReserved: event.target.checked })} /> 允许预备卡</label>
        <label className="text-xs text-kards-text"><input type="checkbox" checked={customRules.allowGenerated} onChange={event => setCustomRules({ ...customRules, allowGenerated: event.target.checked })} /> 允许导入的衍生卡</label>
      </div>}
      <div className="flex items-start gap-2"><textarea rows={1} aria-label="导入卡组码" onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.stopPropagation(); importCode(); }
        else if (event.key === 'Escape' && importText) { event.preventDefault(); event.stopPropagation(); setImportText(''); }
      }} title="Enter 导入；Shift+Enter 换行；Esc 清空" value={importText} onChange={event => setImportText(event.target.value)} placeholder="粘贴卡组码或分享文本" className={`${inputClass} max-h-32 min-w-0 flex-1 resize-y`} /><button disabled={!importText.trim()} onClick={importCode} className="flex items-center gap-1 rounded border border-kards-border px-2 py-2 text-sm text-kards-text disabled:opacity-40"><Upload className="h-4 w-4" />导入</button></div>
      <div aria-label="构筑卡牌列表" className="min-h-16 space-y-1">
        <DeckHeadquartersStrip nation={mainNation} headquartersId={headquartersId} onClick={setSelectedHeadquarters} />
        {sortedEntries.map(([id, count]) => {
          const card = cardsById.get(id);
          return <div key={id} className="deck-builder-card-row"><DeckCardStrip card={card} importId={id} count={count} enabled={active && draftLoaded} draggable={active}
            onClick={() => { if (card) setSelectedCard(card); }} onDoubleClick={() => adjustCard(id, 1)} onRemove={() => adjustCard(id, -1)}
            onDragStart={event => { cancelCardClick(); event.dataTransfer.setData(DECK_CARD_DRAG_TYPE, id); event.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => setDragOverZone(null)} /></div>;
        })}
        {!entries.size && <p className="py-10 text-center text-sm text-kards-text-muted">从左侧选择卡牌开始构筑</p>}
      </div>
      {warnings.length > 0 && <div className="custom-scrollbar max-h-28 shrink-0 overflow-y-auto rounded bg-kards-input-bg p-2 text-xs text-kards-text-muted"><div className="mb-1 font-bold text-kards-status">规则提示 · 允许保存与导出</div>{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
      {message && <p role="status" className="custom-scrollbar max-h-16 shrink-0 overflow-y-auto text-xs text-kards-text-muted">{message}</p>}
      </div>
      <div aria-label="构筑操作" className="builder-actions">
        <button type="button" onClick={() => dispatch({ type: 'undo' })} disabled={!history.past.length} aria-label="撤回" title="撤回 · Ctrl+Z"><Undo2 className="h-5 w-5" /></button>
        <button type="button" onClick={() => dispatch({ type: 'redo' })} disabled={!history.future.length} aria-label="重做" title="重做 · Ctrl+Y / Ctrl+Shift+Z"><Redo2 className="h-5 w-5" /></button>
        <button type="button" onClick={saveDeck} disabled={!draftLoaded} aria-label="保存并退出" title="保存并退出 · Ctrl+Enter" className="builder-save"><Check className="h-6 w-6" /></button>
      </div>
    </aside>
    </div>
    {active && (selectedCard || selectedHeadquarters) && <CardDetailModal card={selectedCard || undefined} headquarters={selectedHeadquarters || undefined} cards={cards} onClose={() => { setSelectedCard(null); setSelectedHeadquarters(null); }} />}
    {active && pendingNation && createPortal(<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={() => setPendingNation(null)} className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm" />
      <section role="dialog" aria-modal="true" aria-label="确认更换国家" tabIndex={-1} onKeyDown={handleDialogKeys} className="glass-panel relative w-full max-w-md rounded-lg border border-kards-border p-6 shadow-2xl">
        <h2 className="mb-4 text-lg font-bold text-kards-text">更换{pendingNation.field === 'main' ? '主国' : '盟国'}？</h2>
        <p className="text-sm text-kards-text">{factionLabel(pendingNation.field === 'main' ? mainNation : allyNation)} → {factionLabel(pendingNation.value)}</p>
        <p className="mt-3 text-sm leading-6 text-kards-text-muted">现有卡牌将保留，不符合新国家的卡牌会显示规则提示。确认后更新构筑卡池。</p>
        <div className="mt-5 flex justify-end gap-3">
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
  </div>;
}
