export interface DeckBuilderState {
  mainNation: string;
  allyNation: string;
  headquartersId: string;
  entries: Map<string, number>;
  deckName: string;
  deckId?: string;
}

export interface DeckBuilderHistory {
  past: DeckBuilderState[];
  present: DeckBuilderState;
  future: DeckBuilderState[];
}

type BuilderAction =
  | { type: 'edit'; update: Partial<DeckBuilderState> | ((current: DeckBuilderState) => Partial<DeckBuilderState>) }
  | { type: 'reset'; value: DeckBuilderState }
  | { type: 'undo' }
  | { type: 'redo' };

export function deckBuilderReducer(state: DeckBuilderHistory, action: BuilderAction): DeckBuilderHistory {
  if (action.type === 'reset') return { past: [], present: action.value, future: [] };
  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    return previous ? { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] } : state;
  }
  if (action.type === 'redo') {
    const next = state.future[0];
    return next ? { past: [...state.past, state.present], present: next, future: state.future.slice(1) } : state;
  }
  const update = typeof action.update === 'function' ? action.update(state.present) : action.update;
  if (Object.entries(update).every(([key, value]) => Object.is(state.present[key as keyof DeckBuilderState], value))) return state;
  return { past: [...state.past, state.present].slice(-100), present: { ...state.present, ...update }, future: [] };
}
