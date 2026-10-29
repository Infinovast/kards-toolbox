import { useMemo, useState } from 'react';
import { ArrowLeft, ChevronRight, Plus, Shield, Upload, X } from 'lucide-react';
import { READY_DECKS, type ReadyDeck } from '../data/readyDecks';
import { handleDialogKeys } from '../lib/dialogKeyboard';
import { findCardsByImportId } from '../lib/deckCode';
import type { KardsCardRecord } from '../types/card';
import ReadyDeckCard from './ReadyDeckCard';

export default function NewDeckDialog({ cards, onClose, onCreate, onImport, onPreset }: {
  cards: KardsCardRecord[];
  onClose: () => void;
  onCreate: () => void;
  onImport: () => void;
  onPreset: (deck: ReadyDeck) => void;
}) {
  const [showPresets, setShowPresets] = useState(false);
  const [selected, setSelected] = useState<ReadyDeck>(READY_DECKS[0]);
  const cardsById = useMemo(() => findCardsByImportId(cards), [cards]);
  const close = () => showPresets ? setShowPresets(false) : onClose();
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div onClick={onClose} className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm" />
    <section role="dialog" aria-modal="true" aria-label={showPresets ? '战备卡组' : '新卡组'} tabIndex={-1} onKeyDown={handleDialogKeys} className={`glass-panel relative flex max-h-[calc(100dvh-32px)] w-full flex-col rounded-lg border border-kards-border p-6 shadow-2xl ${showPresets ? 'max-w-3xl' : 'max-w-xl'}`}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-kards-text">{showPresets ? '战备卡组' : '新卡组'}</h2>
        <button data-dialog-cancel aria-label={showPresets ? '返回新卡组选项' : '关闭新卡组'} onClick={close} className="rounded p-1 text-kards-text-muted"><X className="h-5 w-5" /></button>
      </div>
      {showPresets ? <>
        <div className="custom-scrollbar min-h-0 overflow-y-auto pr-1">
          <div role="group" aria-label="战备卡组选择" className="ready-deck-grid">
            {READY_DECKS.map(deck => <ReadyDeckCard key={deck.name} deck={deck} cardsById={cardsById}
              selected={selected === deck} onSelect={() => setSelected(deck)} />)}
          </div>
          <div className="mt-5 space-y-3" aria-label={`${selected.name}介绍`}>
            <h3 className="font-bold text-kards-text">{selected.name}</h3>
            <p className="whitespace-pre-line text-sm leading-7 text-kards-text">{selected.description}</p>
            <p className="break-all rounded bg-kards-input-bg p-3 font-mono text-xs text-kards-status">{selected.code}</p>
          </div>
        </div>
        <div className="mt-5 flex shrink-0 items-center justify-between gap-3">
          <button onClick={() => setShowPresets(false)} className="flex items-center gap-1 rounded border border-kards-border px-3 py-2 text-sm text-kards-text"><ArrowLeft className="h-4 w-4" />返回</button>
          <button data-dialog-confirm onClick={() => onPreset(selected)} className="rounded bg-kards-accent px-4 py-2 text-sm font-bold text-white">添加到卡组</button>
        </div>
      </> : <div className="space-y-2">
        {[
          { label: '新建卡组', detail: '从空白卡组开始构筑', Icon: Plus, action: onCreate },
          { label: '战备卡组', detail: '选择预设卡组并查看介绍', Icon: Shield, action: () => setShowPresets(true) },
          { label: '导入卡组', detail: '粘贴卡组码、分享文本或选择卡组图片', Icon: Upload, action: onImport },
        ].map(({ label, detail, Icon, action }) => <button key={label} onClick={action} className="flex w-full items-center gap-3 rounded border border-kards-border px-4 py-3 text-left text-kards-text hover:border-kards-gold hover:bg-kards-panel-hover">
          <Icon className="h-5 w-5 shrink-0 text-kards-status" /><span className="flex-1"><span className="block text-sm font-bold">{label}</span><span className="mt-1 block text-xs text-kards-text-muted">{detail}</span></span><ChevronRight className="h-4 w-4 text-kards-text-muted" />
        </button>)}
      </div>}
    </section>
  </div>;
}
