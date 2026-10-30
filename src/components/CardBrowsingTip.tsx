import { X } from 'lucide-react';
import { useUsageTip } from '../lib/usageTips';

export default function CardBrowsingTip({ className = '' }: { className?: string }) {
  const [visible, dismiss] = useUsageTip('card-detail-wheel');
  return visible ? <div className={`card-browsing-tip ${className}`}>
    <span>试试鼠标滚轮浏览？</span>
    <button type="button" onClick={dismiss} aria-label="不再显示滚轮浏览提示" title="不再显示" className="rounded p-1 text-kards-text-muted hover:text-kards-text"><X className="h-3 w-3" /></button>
  </div> : null;
}
