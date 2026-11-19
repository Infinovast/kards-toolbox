import { useEffect, useRef, useState, type RefObject } from 'react';
import { ImagePlus, LoaderCircle } from 'lucide-react';
import { importDeckImage, type ImageDeckResult } from '../lib/deckImageImport';

export default function DeckImageImport({ onRecognized, onError, onBusyChange, cancelRef }: {
  onRecognized: (result: ImageDeckResult) => void;
  onError: (message: string | null) => void;
  onBusyChange: (busy: boolean) => void;
  cancelRef: RefObject<(() => void) | null>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    cancelRef.current = () => controller.current?.abort();
    return () => { controller.current?.abort(); cancelRef.current = null; onBusyChange(false); };
  }, [cancelRef, onBusyChange]);
  const recognize = async (file: File) => {
    controller.current?.abort();
    const task = new AbortController(); controller.current = task;
    setBusy(true); onBusyChange(true); onError(null); setMessage('识别二维码…');
    try {
      const result = await importDeckImage(file, setMessage, task.signal);
      if (task.signal.aborted) return;
      onRecognized(result);
      setMessage(`已读取二维码：${result.total} 张（含总部）`);
    } catch (error) {
      if (!task.signal.aborted) { setMessage(''); onError(error instanceof Error ? error.message : '无法识别卡组图片'); }
    } finally {
      if (!task.signal.aborted) { setBusy(false); onBusyChange(false); }
    }
  };
  return <div className="space-y-2">
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/avif,image/bmp" className="sr-only" tabIndex={-1} aria-label="选择卡组图片文件"
      onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void recognize(file); }} />
    <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-md border border-kards-border px-3 py-2 text-sm font-bold text-kards-text hover:border-kards-gold hover:bg-kards-panel-hover disabled:opacity-40">
      {busy ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ImagePlus aria-hidden="true" className="h-4 w-4" />}选择卡组图片
    </button>
    <p role="status" aria-live="polite" className="min-h-4 text-xs text-kards-status">{message}</p>
  </div>;
}
