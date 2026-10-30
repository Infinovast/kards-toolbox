import { useSyncExternalStore } from 'react';

const KEY = 'kards_dismissed_tips';
const EVENT = 'kards-usage-tips-changed';
function dismissedTips(): string[] {
  try { const value = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
const subscribe = (listener: () => void) => {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener('storage', listener); };
};
export function useUsageTip(id: string): [boolean, () => void] {
  const visible = useSyncExternalStore(subscribe, () => !dismissedTips().includes(id), () => false);
  return [visible, () => {
    localStorage.setItem(KEY, JSON.stringify([...new Set([...dismissedTips(), id])]));
    window.dispatchEvent(new Event(EVENT));
  }];
}
export function resetUsageTips() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}
