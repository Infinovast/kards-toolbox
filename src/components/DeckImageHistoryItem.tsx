import { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, LoaderCircle } from 'lucide-react';
import { readDeckImage, saveDeckImage } from '../lib/deckImageCache';

async function thumbnail(source: string): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source;
  });
  const scale = Math.min(280 / image.naturalWidth, 180 / image.naturalHeight, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建缩略图');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.8);
}

export default function DeckImageHistoryItem({ code, name, selected, revision, renderMini, onSelect }: {
  code: string; name: string; selected: boolean; revision: number; renderMini: () => Promise<string>; onSelect: () => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const miniRenderer = useRef(renderMini); miniRenderer.current = renderMini;
  const [images, setImages] = useState<{ full?: string; mini?: string }>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false, started = false;
    setImages({}); setLoading(true);
    const load = async () => {
      if (started) return;
      started = true;
      try {
        const [full, cachedMini] = await Promise.all([readDeckImage(code), readDeckImage(code, 'mini')]);
        if (cancelled || !full) return;
        const fullThumb = await thumbnail(full);
        if (!cancelled) setImages({ full: fullThumb });
        const mini = cachedMini || await miniRenderer.current();
        if (cancelled) return;
        const miniThumb = await thumbnail(mini);
        if (!cancelled) setImages({ full: fullThumb, mini: miniThumb });
        if (!cachedMini && !cancelled) await saveDeckImage(code, mini, 'mini');
      } catch { /* A failed thumbnail does not prevent opening the cached deck. */ }
      finally { if (!cancelled) setLoading(false); }
    };
    // Read only visible records and retain small thumbnails rather than full PNGs.
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); void load(); }
    }, { rootMargin: '100px' });
    if (button.current) observer.observe(button.current);
    return () => { cancelled = true; observer.disconnect(); };
  }, [code, revision]);

  return <button ref={button} type="button" aria-pressed={selected} onClick={onSelect}
    className={`w-full rounded border p-2 text-left hover:border-kards-gold ${selected ? 'border-kards-gold bg-kards-panel-hover' : 'border-kards-border'}`}>
    <span className="mb-2 block truncate text-sm font-bold">{name}</span>
    <span className="grid grid-cols-2 gap-2">
      {(['full', 'mini'] as const).map(kind => <span key={kind} className="min-w-0">
        <span className="flex h-[88px] items-center justify-center overflow-hidden rounded bg-kards-input-bg">
          {images[kind] ? <img src={images[kind]} alt={kind === 'full' ? '历史卡组图缩略图' : '历史迷你图缩略图'} className="h-full w-full object-contain" draggable={false} />
            : loading ? <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none text-kards-text-muted" /> : <ImageIcon className="h-5 w-5 text-kards-text-muted" />}
        </span>
        <span className="mt-1 block text-center text-xs text-kards-text-muted">{kind === 'full' ? '卡组图' : '迷你图'}</span>
      </span>)}
    </span>
    <span className="mt-2 block break-all font-mono text-xs text-kards-text-muted">{code}</span>
  </button>;
}
