import { useEffect, useMemo, useState } from 'react';
import { Copy, ImageDown, Minus, Plus, Save, Search, Upload } from 'lucide-react';
import localforage from 'localforage';
import { CARD_FACTIONS, cardTitle, type KardsCardRecord } from '../types/card';
import { decodeDeckCode, encodeDeckCode, findCardsByImportId } from '../lib/deckCode';
import { inferDeckTitleFromText, extractDeckCodeFromText } from '../lib/deckImport';
import { DEFAULT_DECK_RULES, validateDeck, type DeckRuleSet, type DeckRules } from '../lib/deckRules';
import { CardFace, RaritySlots } from './CardFace';
import { downloadDeckImage, renderDeckImage } from '../lib/deckRenderer';

export interface BuilderDeck {
  id?: string;
  name: string;
  code: string;
  ruleSet?: DeckRuleSet;
  customRules?: DeckRules;
}
interface Draft {
  mainNation: string;
  allyNation: string;
  ruleSet: DeckRuleSet;
  customRules: DeckRules;
  entries: [string, number][];
  deckName: string;
  deckId?: string;
}
const inputClass = 'rounded border border-kards-border bg-kards-input-bg px-3 py-2 text-sm text-kards-text';
const numericRules = [
  ['deckSize', '可用牌张数'], ['maxAllyCards', '盟国上限'], ['maxStandard', '普通上限'],
  ['maxLimited', '限定上限'], ['maxSpecial', '特殊上限'], ['maxElite', '精英上限'],
] as const;

export default function DeckBuilder({ cards, initialDeck, onSave, active = true }: {
  active?: boolean;
  cards: KardsCardRecord[];
  initialDeck: BuilderDeck | null;
  onSave: (deck: BuilderDeck, warnings: string[]) => void;
}) {
  const [mainNation, setMainNation] = useState('Germany');
  const [allyNation, setAllyNation] = useState('Soviet');
  const [ruleSet, setRuleSet] = useState<DeckRuleSet>('standard');
  const [customRules, setCustomRules] = useState<DeckRules>({ ...DEFAULT_DECK_RULES.standard });
  const [entries, setEntries] = useState<Map<string, number>>(new Map());
  const [deckId, setDeckId] = useState<string>();
  const [query, setQuery] = useState('');
  const [selectedFaction, setSelectedFaction] = useState('All');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [query, selectedFaction]);
  const [deckName, setDeckName] = useState('新卡组');
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    localforage.getItem<Draft>('kards_builder_draft').then((draft) => {
      if (!draft) return;
      setMainNation(draft.mainNation); setAllyNation(draft.allyNation);
      setRuleSet(draft.ruleSet); setCustomRules({ ...DEFAULT_DECK_RULES.standard, ...draft.customRules });
      setEntries(new Map(draft.entries)); setDeckName(draft.deckName); setDeckId(draft.deckId);
    }).catch(() => setMessage('构筑草稿读取失败，可以重新开始构筑')).finally(() => setDraftLoaded(true));
  }, []);

  useEffect(() => {
    if (!initialDeck || !draftLoaded) return;
    try {
      const decoded = decodeDeckCode(initialDeck.code);
      setMainNation(decoded.mainNation); setAllyNation(decoded.allyNation); setEntries(decoded.counts);
      setDeckName(initialDeck.name); setDeckId(initialDeck.id);
      setRuleSet(initialDeck.ruleSet || (decoded.mainNation === decoded.allyNation ? 'arena' : 'standard'));
      setCustomRules({ ...DEFAULT_DECK_RULES.standard, ...initialDeck.customRules });
      setMessage('已载入卡组；保存会更新原卡组');
    } catch (error) { setMessage(String(error)); }
  }, [initialDeck, draftLoaded]);

  useEffect(() => {
    if (!draftLoaded) return;
    const timer = window.setTimeout(() => {
      localforage.setItem('kards_builder_draft', { mainNation, allyNation, ruleSet, customRules, entries: [...entries], deckName, deckId })
        .catch(() => setMessage('草稿保存失败，请检查本地存储空间'));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [mainNation, allyNation, ruleSet, customRules, entries, deckName, deckId, draftLoaded]);

  const cardsById = useMemo(() => findCardsByImportId(cards), [cards]);
  const rules = ruleSet === 'custom' ? customRules : DEFAULT_DECK_RULES[ruleSet];
  const totalCards = [...entries.values()].reduce((sum, count) => sum + count, 0);
  const warnings = validateDeck(entries, cardsById, mainNation, allyNation, rules);
  const matchingCards = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return cards.filter((card) => {
      const text = [card.importId, ...Object.values(card.json.title || {}), ...Object.values(card.json.text || {})].join(' ').toLocaleLowerCase();
      return (!term || text.includes(term)) && (selectedFaction === 'All' || card.json.faction === selectedFaction);
    });
  }, [cards, query, selectedFaction]);

  const adjustCard = (importId: string, change: number) => setEntries((current) => {
    const next = new Map<string, number>(current), count = (next.get(importId) || 0) + change;
    if (count <= 0) next.delete(importId);
    else next.set(importId, Math.min(999, count));
    return next;
  });

  const importCode = () => {
    try {
      const decoded = decodeDeckCode(importText);
      setMainNation(decoded.mainNation); setAllyNation(decoded.allyNation); setEntries(decoded.counts);
      const title = inferDeckTitleFromText(importText, extractDeckCodeFromText(importText));
      setDeckName(title || '导入的卡组');
      const unknown = [...decoded.counts.keys()].filter((id) => !cardsById.has(id));
      setMessage(unknown.length ? `导入成功，保留 ${unknown.length} 种未知卡；请手动更新牌库补全资料` : '导入成功');
    } catch (error) { setMessage(error instanceof Error ? error.message : '卡组码无法导入'); }
  };
  const copyCode = async () => {
    const code = encodeDeckCode(mainNation, allyNation, entries);
    try { await navigator.clipboard.writeText(code); setMessage(`已复制卡组码${warnings.length ? '（含规则提示）' : ''}`); }
    catch { setImportText(code); setMessage('剪贴板不可用，卡组码已填入左侧输入框，可手动复制'); }
  };
  const saveDeck = () => {
    onSave({ id: deckId, code: encodeDeckCode(mainNation, allyNation, entries), name: deckName.trim() || '新卡组', ruleSet, customRules }, warnings);
  };
  const exportImage = async () => {
    setRendering(true);
    try { downloadDeckImage(await renderDeckImage(encodeDeckCode(mainNation, allyNation, entries), cards, deckName), deckName); setMessage('图片已在本机生成，缺少的卡图使用文字占位'); }
    catch (error) { setMessage(error instanceof Error ? error.message : '图片生成失败'); }
    finally { setRendering(false); }
  };

  return <div className="flex h-full min-h-0 gap-4 p-5">
    <section className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-kards-border pb-3">
        <select aria-label="主国" value={mainNation} onChange={(e) => setMainNation(e.target.value)} className={inputClass}>{CARD_FACTIONS.slice(0, 10).map((item) => <option key={item.id} value={item.id}>{item.label}主国</option>)}</select>
        <select aria-label="盟国" value={allyNation} onChange={(e) => setAllyNation(e.target.value)} className={inputClass}>{CARD_FACTIONS.slice(0, 10).map((item) => <option key={item.id} value={item.id}>{item.label}盟国</option>)}</select>
        <select aria-label="构筑规则" value={ruleSet} onChange={(e) => setRuleSet(e.target.value as DeckRuleSet)} className={inputClass}><option value="standard">标准构筑</option><option value="arena">竞技场</option><option value="custom">自定义规则</option></select>
        {ruleSet === 'custom' && <div className="flex w-full flex-wrap gap-3">
          {numericRules.map(([key, label]) => <label key={key} className="flex items-center gap-1 text-xs text-kards-text-muted">{label}<input type="number" min="1" max="999" value={customRules[key]} onChange={(e) => setCustomRules({ ...customRules, [key]: Math.max(1, Math.min(999, Number(e.target.value) || 1)) })} className={`${inputClass} w-16 !px-2 !py-1`} /></label>)}
          <label className="text-xs text-kards-text"><input type="checkbox" checked={customRules.allowReserved} onChange={(e) => setCustomRules({ ...customRules, allowReserved: e.target.checked })} /> 允许预备卡</label>
          <label className="text-xs text-kards-text"><input type="checkbox" checked={customRules.allowGenerated} onChange={(e) => setCustomRules({ ...customRules, allowGenerated: e.target.checked })} /> 允许衍生卡</label>
        </div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[140px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-kards-text-muted" /><input aria-label="构筑搜索卡牌" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索卡名或文本" className={`${inputClass} w-full !pl-9`} /></div>
        <select aria-label="构筑阵营筛选" value={selectedFaction} onChange={(e) => setSelectedFaction(e.target.value)} className={inputClass}><option value="All">全部阵营</option>{CARD_FACTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select>
      </div>
      <div className="flex items-start gap-2"><textarea rows={1} aria-label="导入卡组码" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && (e.ctrlKey || e.metaKey)) { e.preventDefault(); importCode(); } else if (e.key === 'Escape') { setImportText(''); e.stopPropagation(); } }} title="Ctrl+Enter 导入；Esc 清空" value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="粘贴 %% 卡组码或完整分享文本" className={`${inputClass} max-h-32 min-w-0 flex-1 resize-y`} /><button onClick={importCode} className="flex items-center gap-1 rounded border border-kards-border px-3 py-2 text-sm text-kards-text hover:border-kards-gold"><Upload className="h-4 w-4" />导入</button></div>
      <p className="text-xs text-kards-text-muted">找到 {matchingCards.length} 张</p>
      <div data-testid="builder-grid" className="card-gallery card-gallery-builder custom-scrollbar min-h-0 flex-1 overflow-y-auto pb-2">
        {matchingCards.slice((page - 1) * 60, page * 60).map((card) => <div key={card.importId} className="card-tile">
          <button onClick={() => adjustCard(card.importId, 1)} onContextMenu={e => { e.preventDefault(); adjustCard(card.importId, -1); }} aria-label={`添加${cardTitle(card, 'zh-Hans')}`} title="单击加一张，右键减一张" className="group block w-full text-left">
            <CardFace card={card} enabled={active} />
            <div className="card-caption" title={cardTitle(card, 'zh-Hans')}>{cardTitle(card, 'zh-Hans')}</div>
          </button>
          <RaritySlots rarity={card.json.rarity} count={entries.get(card.importId) || 0} />
        </div>)}
        {!matchingCards.length && <p className="col-span-full py-10 text-center text-sm text-kards-text-muted">没有匹配的卡牌，请更换搜索词或阵营</p>}
      </div>
      <div className="flex shrink-0 items-center justify-center gap-3 text-xs text-kards-text"><button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border border-kards-border px-3 py-1 disabled:opacity-40">上一页</button><span>{page} / {Math.max(1, Math.ceil(matchingCards.length / 60))}</span><button disabled={page * 60 >= matchingCards.length} onClick={() => setPage(page + 1)} className="rounded border border-kards-border px-3 py-1 disabled:opacity-40">下一页</button></div>
    </section>
    <aside className="flex w-[300px] shrink-0 flex-col gap-3 overflow-hidden rounded-lg border border-kards-border glass-panel p-4 xl:w-[340px]">
      <div className="flex items-center justify-between"><h2 className="font-bold text-kards-text">{deckId ? '编辑卡组' : '当前卡组'}</h2><span className="text-lg font-bold tabular-nums text-kards-status">{totalCards} / {rules.deckSize}</span></div>
      <p className="text-xs text-kards-text-muted">可用牌张数，另含 1 张总部 · 草稿自动保存</p>
      <input value={deckName} onChange={(e) => setDeckName(e.target.value)} className={inputClass} aria-label="卡组名称" onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing && entries.size) { e.preventDefault(); saveDeck(); } }} />
      <div className="custom-scrollbar min-h-16 flex-1 space-y-1 overflow-y-auto">
        {[...entries].map(([id, count]) => {
          const card = cardsById.get(id), title = card ? cardTitle(card, 'zh-Hans') : `未知卡牌 ${id}`;
          return <div key={id} className="flex items-center gap-2 border-b border-kards-border py-2 text-sm"><span className="min-w-0 flex-1 truncate text-kards-text" title={title}>{title}</span><button onClick={() => adjustCard(id, -1)} aria-label={`减少${title}`} className="rounded border border-kards-border p-1 text-kards-text"><Minus className="h-3 w-3" /></button><span className="w-6 text-center tabular-nums text-kards-text">{count}</span><button onClick={() => adjustCard(id, 1)} aria-label={`增加${title}`} className="rounded border border-kards-border p-1 text-kards-text"><Plus className="h-3 w-3" /></button></div>;
        })}
        {!entries.size && <p className="py-10 text-center text-sm text-kards-text-muted">从左侧选择卡牌开始构筑</p>}
      </div>
      {warnings.length > 0 && <div className="custom-scrollbar max-h-28 shrink-0 overflow-y-auto rounded bg-kards-input-bg p-2 text-xs text-kards-text-muted"><div className="mb-1 font-bold text-kards-status">规则提示 · 允许保存与导出</div>{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div>}
      {message && <p role="status" className="custom-scrollbar max-h-16 shrink-0 overflow-y-auto text-xs text-kards-text-muted">{message}</p>}
      <div className="grid shrink-0 grid-cols-2 gap-2"><button onClick={copyCode} disabled={!entries.size} className="flex items-center justify-center gap-2 rounded border border-kards-border px-2 py-2 text-sm text-kards-text disabled:opacity-40"><Copy className="h-4 w-4" />复制代码</button><button onClick={saveDeck} disabled={!entries.size} className="flex items-center justify-center gap-2 rounded bg-kards-accent px-2 py-2 text-sm font-bold text-white disabled:opacity-40"><Save className="h-4 w-4" />保存更改</button><button onClick={exportImage} disabled={!entries.size || rendering} className="col-span-2 flex items-center justify-center gap-2 rounded border border-kards-border py-2 text-sm text-kards-text disabled:opacity-40"><ImageDown className="h-4 w-4" />{rendering ? '正在本地生成…' : '导出卡组图片'}</button></div>
    </aside>
  </div>;
}
