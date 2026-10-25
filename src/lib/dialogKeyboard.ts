import { useEffect, useRef } from 'react';

// Only the front dialog handles a key; keep multi-line input and IME composition intact.
export function useDialogKeyboard(open: boolean, close: () => void) {
  const ref = useRef<HTMLElement>(null);
  const latestClose = useRef(close); latestClose.current = close;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, textarea')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); latestClose.current();
    };
    ref.current?.addEventListener('keydown', keydown);
    const element = ref.current;
    return () => { element?.removeEventListener('keydown', keydown); if (previous?.isConnected) previous.focus(); };
  }, [open]);
  return ref;
}

export function handleDialogKeys(event: import('react').KeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented || event.nativeEvent.isComposing) return;
  const panel = event.currentTarget;
  const target = event.target as HTMLElement;
  if (event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation();
    panel.querySelector<HTMLButtonElement>('[data-dialog-cancel]')?.click();
  } else if (event.key === 'Enter' && !event.shiftKey && target.tagName !== 'BUTTON' && target.tagName !== 'SELECT' && (target.tagName !== 'TEXTAREA' || event.ctrlKey || event.metaKey)) {
    const confirm = panel.querySelector<HTMLButtonElement>('[data-dialog-confirm]');
    if (confirm && !confirm.disabled) { event.preventDefault(); event.stopPropagation(); confirm.click(); }
  } else if (event.key === 'Tab') {
    const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]')].filter(el => el.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && (target === first || target === panel)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && target === last) { event.preventDefault(); first?.focus(); }
  }
}

export function useModalFocus() {
  useEffect(() => {
    let current: HTMLElement | undefined;
    const returnFocus = new Map<HTMLElement, HTMLElement>();
    const update = () => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')];
      const top = dialogs.at(-1);
      if (top === current) return;
      const old = current; current = top;
      if (old && !old.isConnected) { const previous = returnFocus.get(old); if (previous?.isConnected) previous.focus(); returnFocus.delete(old); }
      if (top && !top.contains(document.activeElement)) {
        if (document.activeElement instanceof HTMLElement) returnFocus.set(top, document.activeElement);
        (top.querySelector<HTMLElement>('[autofocus], input, textarea, button') || top).focus();
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true }); update();
    return () => observer.disconnect();
  }, []);
}
