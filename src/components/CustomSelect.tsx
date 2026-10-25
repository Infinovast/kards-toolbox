import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  icon?: ReactNode;
  iconOnly?: boolean;
  group?: string;
  disabled?: boolean;
}

type Props = {
  label: string;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  layout?: 'list' | 'grid';
} & ({ multiple: true; value: string[]; onChange: (value: string[]) => void }
  | { multiple?: false; value: string; onChange: (value: string) => void });

/** A shared, portalled select: no clipping inside sidebars or modal scroll areas. */
export default function CustomSelect(props: Props) {
  const { label, options, placeholder = label, className = '', disabled, layout = 'list' } = props;
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });
  const search = useRef({ text: '', time: 0 });
  const selected = options.filter(option => props.multiple ? props.value.includes(option.value) : props.value === option.value);
  const isSelected = (value: string) => props.multiple ? props.value.includes(value) : props.value === value;

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };
  const show = (fromEnd = false) => {
    if (disabled) return;
    const index = options.findIndex(option => isSelected(option.value) && !option.disabled);
    const available = options.map((option, at) => option.disabled ? -1 : at).filter(at => at >= 0);
    setActive(index >= 0 ? index : (fromEnd ? available.at(-1) : available[0]) ?? -1);
    setPosition({ visibility: 'hidden' });
    setOpen(true);
  };
  const choose = (option: SelectOption) => {
    if (option.disabled) return;
    if (props.multiple === true) {
      props.onChange(props.value.includes(option.value) ? props.value.filter(value => value !== option.value) : [...props.value, option.value]);
    } else {
      props.onChange(option.value);
      close();
    }
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !popup.current) return;
      const rect = trigger.current.getBoundingClientRect();
      if (!rect.width || !rect.height) { setOpen(false); return; }
      const gap = 6, margin = 10;
      const below = window.innerHeight - rect.bottom - gap - margin;
      const above = rect.top - gap - margin;
      const upwards = below < 260 && above > below;
      const maxHeight = Math.max(80, Math.min(420, upwards ? above : below));
      const width = Math.min(window.innerWidth - margin * 2, Math.max(rect.width, layout === 'grid' ? 300 : 232));
      const height = Math.min(popup.current.scrollHeight, maxHeight);
      setPosition({ width, maxHeight, left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)), top: upwards ? Math.max(margin, rect.top - height - gap) : rect.bottom + gap });
    };
    place();
    window.addEventListener('resize', place);
    const scroll = (event: Event) => { if (!popup.current?.contains(event.target as Node)) place(); };
    window.addEventListener('scroll', scroll, true);
    const observer = new ResizeObserver(place);
    if (trigger.current) observer.observe(trigger.current);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', scroll, true); observer.disconnect(); };
  }, [open, layout]);

  useLayoutEffect(() => {
    // The initial measurement pass is hidden; focus only after it becomes visible.
    if (open && position.visibility !== 'hidden') list.current?.focus();
  }, [open, position.visibility]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close(false);
    };
    // Another select can be opened with a keyboard without dispatching a pointer.
    const focus = (event: FocusEvent) => {
      if (!popup.current?.contains(event.target as Node) && event.target !== trigger.current) setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', focus);
    return () => { document.removeEventListener('pointerdown', outside, true); document.removeEventListener('focusin', focus); };
  }, [open]);

  useEffect(() => {
    if (open && active >= 0) document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active, id]);

  const handleKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.nativeEvent.isComposing) return;
    // Consume popup keys before a surrounding builder or dialog sees them.
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (event.key === 'Tab') {
      event.stopPropagation();
      // Return to the opener so native Tab proceeds to the next form control.
      close();
      return;
    }
    if (event.target !== list.current) { if (event.key === 'Enter' || event.key === ' ') event.stopPropagation(); return; }
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
      const at = enabled.indexOf(active);
      const next = event.key === 'Home' ? enabled[0] : event.key === 'End' ? enabled.at(-1) : enabled[(at + (['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1) + enabled.length) % enabled.length];
      setActive(next ?? -1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); event.stopPropagation();
      if (options[active]) choose(options[active]);
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.stopPropagation();
      const now = Date.now();
      search.current = { text: (now - search.current.time > 700 ? '' : search.current.text) + event.key.toLocaleLowerCase(), time: now };
      const index = options.findIndex(option => !option.disabled && option.label.toLocaleLowerCase().startsWith(search.current.text));
      if (index >= 0) setActive(index);
    }
  };

  return <>
    <button ref={trigger} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} data-value={Array.isArray(props.value) ? props.value.join(',') : props.value}
      className={`custom-select-trigger ${selected.length && props.multiple ? 'has-selection' : ''} ${className}`}
      title={`${label}：${selected.map(option => option.label).join('、') || '全部'}`}
      onClick={() => open ? close() : show()} onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); event.stopPropagation(); show(event.key === 'ArrowUp'); }
        else if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(); }
      }}>
      <span className="custom-select-value">
        {selected.slice(0, 2).map(option => option.icon && <span key={option.value} className="custom-select-icon" aria-hidden="true">{option.icon}</span>)}
        <span className="truncate">{selected.length > 1 ? `${placeholder} · ${selected.length}` : selected[0]?.iconOnly ? <span className="sr-only">{selected[0].label}</span> : selected[0]?.label || placeholder}</span>
      </span>
      <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${open ? 'rotate-180' : ''}`} />
    </button>
    {open && createPortal(<div ref={popup} className={`custom-select-popover glass-panel custom-scrollbar ${props.multiple ? 'is-multiple' : ''}`} style={position} onKeyDown={handleKeys} onClick={event => event.stopPropagation()}>
      {props.multiple && <div className="custom-select-heading"><span>{placeholder} · 可多选</span><button type="button" onClick={() => { props.onChange([]); list.current?.focus(); }}>清除选择</button></div>}
      <div ref={list} id={id} tabIndex={0} role="listbox" aria-label={`${label}选项`} aria-multiselectable={props.multiple || undefined} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined} className={`custom-select-options custom-select-${layout}`}>
        {options.map((option, index) => <div key={option.value} className="custom-select-option-wrap">
          {option.group && options[index - 1]?.group !== option.group && <div className="custom-select-group">{option.group}</div>}
          <div id={`${id}-${index}`} role="option" aria-label={option.label} aria-selected={isSelected(option.value)} aria-disabled={option.disabled || undefined} data-value={option.value}
            className={`custom-select-option ${index === active ? 'is-active' : ''} ${option.iconOnly ? 'is-icon-only' : ''}`} title={option.label}
            onPointerMove={() => { if (!option.disabled) setActive(index); }} onMouseDown={event => event.preventDefault()} onClick={() => { choose(option); if (props.multiple) list.current?.focus(); }}>
            {option.icon && <span className="custom-select-icon" aria-hidden="true">{option.icon}</span>}
            <span className={option.iconOnly ? 'sr-only' : 'min-w-0 flex-1 truncate'}>{option.label}</span>
            {!option.iconOnly && <Check aria-hidden="true" className={`custom-select-check h-3.5 w-3.5 shrink-0 ${isSelected(option.value) ? '' : 'invisible'}`} />}
          </div>
        </div>)}
        {!options.length && <div className="px-3 py-4 text-sm text-kards-text-muted">暂无可选项</div>}
      </div>
    </div>, document.body)}
  </>;
}
