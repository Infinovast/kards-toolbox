import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Settings } from 'lucide-react';
import { CARD_LANGUAGES, type CardLanguage } from '../types/card';
import CustomSelect from './CustomSelect';

export default function CardLibrarySettings({ language, onLanguageChange, detailMode, onDetailModeChange }: {
  language: CardLanguage;
  onLanguageChange: (language: CardLanguage) => void;
  detailMode: 'modal' | 'sidebar';
  onDetailModeChange: (mode: 'modal' | 'sidebar') => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const width = Math.min(288, window.innerWidth - 20);
      const height = panel.current.offsetHeight;
      setPosition({ width, left: Math.max(10, Math.min(rect.right - width, window.innerWidth - width - 10)),
        top: rect.bottom + height + 16 <= window.innerHeight ? rect.bottom + 6 : Math.max(10, rect.top - height - 6) });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const observer = new ResizeObserver(place);
    if (trigger.current?.parentElement) observer.observe(trigger.current.parentElement);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); observer.disconnect(); };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const element = panel.current;
    element?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Node) || element?.contains(target) || trigger.current?.contains(target)) return;
      // The two selects render their options in separate portals.
      if ([...element?.querySelectorAll('[aria-controls]') || []].some(control =>
        document.getElementById(control.getAttribute('aria-controls')!)?.closest('.custom-select-popover')?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('focusin', outside);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('focusin', outside);
      if (document.activeElement === document.body || element?.contains(document.activeElement)) trigger.current?.focus();
    };
  }, [open]);

  const handleKeys = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || !open) return;
    const controls = panel.current?.querySelectorAll<HTMLButtonElement>('button');
    if (event.key === 'Escape' || event.key === 'Tab' && event.target === (event.shiftKey ? controls?.[0] : controls?.[controls.length - 1])) {
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
    }
  };

  return <>
    <button ref={trigger} type="button" className="library-settings-button" aria-label="卡牌库设置" title="卡牌库设置"
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onKeyDown={handleKeys}
      onClick={() => { setPosition({ visibility: 'hidden' }); setOpen(value => !value); }}>
      <Settings aria-hidden="true" className="h-4 w-4" />
    </button>
    {open && createPortal(<div ref={panel} id={id} role="dialog" aria-label="卡牌库设置" className="library-settings-popover" style={position} onKeyDown={handleKeys}>
      <div className="library-settings-row"><span>文字语言</span><CustomSelect label="卡牌文字语言" value={language}
        onChange={value => { onLanguageChange(value as CardLanguage); setOpen(false); }}
        options={CARD_LANGUAGES.map(item => ({ value: item.id, label: item.label }))} /></div>
      <div className="library-settings-row"><span>详情样式</span><CustomSelect label="卡牌详情样式" value={detailMode}
        onChange={value => { onDetailModeChange(value as 'modal' | 'sidebar'); setOpen(false); }}
        options={[{ value: 'modal', label: '浮窗' }, { value: 'sidebar', label: '侧栏' }]} /></div>
    </div>, document.body)}
  </>;
}
