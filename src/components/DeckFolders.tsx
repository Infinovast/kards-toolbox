import { useState } from 'react';
import { ChevronRight, Folder, FolderOpen, FolderPlus, Pencil, Plus, Star, Trash2, X } from 'lucide-react';

export interface DeckFolder {
  id: string;
  name: string;
  deckIds: string[];
  isFavorite: boolean;
}

interface FolderDeck {
  id: string;
  name: string;
  totalCards: number;
  isFavorite: boolean;
}

export default function DeckFolders({ folders, decks, selectedDeckId, onSelect, onEdit, onCreate, onRename, onDelete, onAdd, onRemove, onFavorite }: {
  folders: DeckFolder[];
  decks: FolderDeck[];
  selectedDeckId: string | null;
  onSelect: (deck: FolderDeck) => void;
  onEdit: (deck: FolderDeck) => void;
  onCreate: () => void;
  onRename: (folder: DeckFolder) => void;
  onDelete: (folder: DeckFolder) => void;
  onAdd: (folder: DeckFolder) => void;
  onRemove: (folder: DeckFolder, deck: FolderDeck) => void;
  onFavorite: (folder: DeckFolder) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['unfiled']));
  const toggle = (id: string) => setExpanded(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const assigned = new Set(folders.flatMap(folder => folder.deckIds));
  const groups = [...folders].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite)).map(folder => ({
    id: folder.id, name: folder.name, folder,
    decks: folder.deckIds.flatMap(id => { const deck = decks.find(deck => deck.id === id); return deck ? [deck] : []; }),
  }));
  groups.push({ id: 'unfiled', name: '未归类', folder: null, decks: decks.filter(deck => !assigned.has(deck.id)) });

  const actionClass = 'rounded p-2 text-kards-text-muted hover:bg-kards-panel-hover hover:text-kards-text';
  return <section aria-label="卡组收藏夹" className="w-full max-w-7xl">
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="text-sm text-kards-text-muted">单击预览卡组，双击进入编辑。</p>
      <button onClick={onCreate} className="flex shrink-0 items-center gap-2 rounded border border-kards-border glass-panel px-3 py-2 text-sm text-kards-text"><FolderPlus className="h-4 w-4" />新建收藏夹</button>
    </div>
    <div className="overflow-hidden rounded-lg border border-kards-border glass-panel">
      {groups.map(group => {
        const open = expanded.has(group.id);
        return <div key={group.id} className="border-b border-kards-border last:border-b-0">
          <div className="flex items-center gap-1 px-2">
            <button aria-expanded={open} aria-controls={`folder-${group.id}`} onClick={() => toggle(group.id)} className="flex min-w-0 flex-1 items-center gap-3 px-2 py-3 text-left text-kards-text">
              <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
              {open ? <FolderOpen className="h-5 w-5 shrink-0 text-kards-gold" /> : <Folder className="h-5 w-5 shrink-0 text-kards-gold" />}
              <span className="truncate font-bold">{group.name}</span>
              <span className="shrink-0 text-xs text-kards-text-muted">{group.decks.length} 个卡组</span>
            </button>
            {group.folder && <>
              <button onClick={() => onAdd(group.folder!)} aria-label={`添加卡组到${group.name}`} title="添加卡组" className={actionClass}><Plus className="h-4 w-4" /></button>
              <button onClick={() => onFavorite(group.folder!)} aria-label={`${group.folder.isFavorite ? '取消置顶' : '置顶'}${group.name}`} title="置顶收藏夹" className={actionClass}><Star className={`h-4 w-4 ${group.folder.isFavorite ? 'fill-kards-gold text-kards-gold' : ''}`} /></button>
              <button onClick={() => onRename(group.folder!)} aria-label={`重命名${group.name}`} title="重命名收藏夹" className={actionClass}><Pencil className="h-4 w-4" /></button>
              <button onClick={() => onDelete(group.folder!)} aria-label={`删除${group.name}`} title="删除收藏夹" className={actionClass}><Trash2 className="h-4 w-4" /></button>
            </>}
          </div>
          {open && <div id={`folder-${group.id}`} role="group" aria-label={group.name} className="border-t border-kards-border pb-2">
            {group.decks.map(deck => <div key={deck.id} className={`flex items-center gap-1 pr-2 ${selectedDeckId === deck.id ? 'bg-kards-panel-hover' : 'hover:bg-kards-panel-hover'}`}>
              <button aria-label={`选择卡组 ${deck.name}`} aria-pressed={selectedDeckId === deck.id} onClick={() => onSelect(deck)} onDoubleClick={() => onEdit(deck)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-12 pr-2 text-left text-sm text-kards-text">
                <span className="min-w-0 flex-1 truncate" title={deck.name}>{deck.name}</span>
                {deck.isFavorite && <Star className="h-3.5 w-3.5 shrink-0 fill-kards-gold text-kards-gold" />}
                <span className="shrink-0 text-xs tabular-nums text-kards-text-muted">{deck.totalCards} 张</span>
              </button>
              {group.folder && <button onClick={() => onRemove(group.folder!, deck)} aria-label={`将${deck.name}移出${group.name}`} title="移出收藏夹" className={actionClass}><X className="h-4 w-4" /></button>}
            </div>)}
            {!group.decks.length && <p className="py-4 pl-12 pr-4 text-sm text-kards-text-muted">没有符合筛选的卡组</p>}
          </div>}
        </div>;
      })}
    </div>
  </section>;
}
