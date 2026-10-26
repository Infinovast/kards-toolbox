import { useEffect, useRef } from 'react';

export function useDismissiblePanel<T extends HTMLElement = HTMLElement>(open: boolean, close: () => void, dismissOutside: () => void = close) {
  const ref = useRef<T>(null);
  const latestClose = useRef(close);
  const latestOutside = useRef(dismissOutside);
  latestClose.current = close;
  latestOutside.current = dismissOutside;

  useEffect(() => {
    if (!open) return;
    const pointerdown = (event: PointerEvent) => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (event.target instanceof Node && ref.current?.contains(event.target)) return;
      latestOutside.current();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== 'Escape'
        || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      latestClose.current();
    };
    document.addEventListener('pointerdown', pointerdown, true);
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('pointerdown', pointerdown, true);
      document.removeEventListener('keydown', keydown, true);
    };
  }, [open]);

  return ref;
}

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
  } else if (event.key === 'Enter' && !event.shiftKey && (target.tagName !== 'BUTTON' || event.ctrlKey || event.metaKey) && target.tagName !== 'SELECT' && (target.tagName !== 'TEXTAREA' || event.ctrlKey || event.metaKey)) {
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
    let lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const rememberFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target !== document.body) lastFocus = event.target;
    };
    document.addEventListener('focusin', rememberFocus);
    const returnFocus = new Map<HTMLElement, HTMLElement>();
    const update = () => {
      const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')];
      const top = dialogs.at(-1);
      if (top === current) return;
      const old = current; current = top;
      if (old && !old.isConnected) {
        const previous = returnFocus.get(old);
        if (previous?.isConnected) {
          if (!previous.matches(':disabled')) previous.focus();
          else previous.closest<HTMLElement>('[aria-label="卡组构筑"]')?.focus();
        }
        returnFocus.delete(old);
      }
      if (top && !top.contains(document.activeElement)) {
        // Disabling the opener during async work can move focus to body before
        // this observer runs. Remember the actual trigger for closing the dialog.
        const previous = document.activeElement === document.body ? lastFocus : document.activeElement;
        if (previous instanceof HTMLElement) returnFocus.set(top, previous);
        (top.querySelector<HTMLElement>('[autofocus]') || top.querySelector<HTMLElement>('input:not([type="file"]):not(:disabled), textarea:not(:disabled)') || top.querySelector<HTMLElement>('[data-dialog-confirm]:not(:disabled)') || top).focus();
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true }); update();
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.key !== 'Escape') return;
      const top = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].at(-1);
      const cancel = top?.querySelector<HTMLElement>('[data-dialog-cancel]');
      if (cancel) { event.preventDefault(); event.stopPropagation(); cancel.click(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { observer.disconnect(); document.removeEventListener('keydown', keydown); document.removeEventListener('focusin', rememberFocus); };
  }, []);
}
