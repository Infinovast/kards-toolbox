import { useSyncExternalStore } from 'react';
import { retryUserDataWrites, subscribeUserDataStorage, userDataStorageStatus } from '../lib/userDataStorage';

export default function UserDataSaveStatus() {
  const { pending, error } = useSyncExternalStore(subscribeUserDataStorage, userDataStorageStatus);
  if (!error) return null;
  return <aside role="alert" className="fixed bottom-5 left-24 z-[90] flex max-w-lg items-center gap-4 rounded-lg border border-kards-border bg-kards-panel p-4 text-sm text-kards-text shadow-lg">
    <div><p className="font-bold">本地数据保存失败</p><p className="mt-1 text-xs text-kards-text-muted">{error}。未保存的修改仍保留在当前窗口中。</p></div>
    <button type="button" disabled={pending > 0} onClick={() => { void retryUserDataWrites().catch(() => {}); }} className="shrink-0 rounded border border-kards-border px-3 py-2 hover:border-kards-gold disabled:opacity-50">{pending ? '保存中…' : '重试保存'}</button>
  </aside>;
}
