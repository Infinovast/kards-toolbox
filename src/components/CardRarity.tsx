import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { WILDCARD_ASPECT_RATIO, wildcardAsset } from '../lib/assetCatalog';

const labels: Record<string, string> = { Standard: '普通', Limited: '稀有', Special: '特殊', Elite: '精英' };

export default function CardRarity({ rarity, faction, previewEnabled = true }: { rarity?: string; faction?: string; previewEnabled?: boolean }) {
  const asset = wildcardAsset(faction, rarity);
  const label = labels[rarity || ''] || rarity || '—';
  const root = useRef<HTMLSpanElement>(null);
  const [preview, setPreview] = useState<CSSProperties | null>(null);
  const show = () => {
    const rect = root.current?.getBoundingClientRect();
    if (!asset || !rect || !previewEnabled) return;
    const width = Math.min(250, (window.innerHeight - 32) * WILDCARD_ASPECT_RATIO);
    const height = width / WILDCARD_ASPECT_RATIO;
    const left = rect.right + 12 + width <= window.innerWidth - 12 ? rect.right + 12 : Math.max(12, rect.left - width - 12);
    setPreview({ width, left, top: Math.max(12, Math.min(window.innerHeight - height - 12, rect.top + rect.height / 2 - height / 2)) });
  };
  useEffect(() => { setPreview(null); }, [asset, previewEnabled]);
  useEffect(() => {
    if (!preview) return;
    const hide = () => setPreview(null);
    const events = ['pointerdown', 'keydown', 'wheel', 'scroll', 'resize', 'blur'];
    events.forEach(event => window.addEventListener(event, hide, true));
    return () => events.forEach(event => window.removeEventListener(event, hide, true));
  }, [preview]);
  const image = asset && <img src={asset} alt="" />;
  return <span className="card-rarity-value">{asset && <span ref={root} role="img" aria-label={`${label}万能卡`} tabIndex={0} className="card-rarity-wildcard"
    style={{ aspectRatio: WILDCARD_ASPECT_RATIO }} onMouseEnter={show} onMouseLeave={() => setPreview(null)} onFocus={show} onBlur={() => setPreview(null)}>{image}</span>}{label}
    {preview && previewEnabled && asset && createPortal(<div role="tooltip" aria-label={`${label}万能卡大图`} className="wildcard-preview" style={{ ...preview, aspectRatio: WILDCARD_ASPECT_RATIO }}>{image}</div>, document.body)}
  </span>;
}
