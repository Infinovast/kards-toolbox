import { X } from 'lucide-react';
import { useUsageTip } from '../lib/usageTips';

export default function CardBrowsingTip({ className = '', alternateArt = false }: { className?: string; alternateArt?: boolean }) {
  const [visible, dismiss] = useUsageTip(alternateArt ? 'card-detail-alternate-art' : 'card-detail-wheel');
  return visible ? <div className={`card-browsing-tip ${className}`}>
    <span>{alternateArt ? '点击卡牌可以切换异画~' : '试试鼠标滚轮浏览？'}</span>
    <button type="button" onClick={dismiss} aria-label={alternateArt ? '不再显示异画提示' : '不再显示滚轮浏览提示'} title="不再显示" className="rounded p-1 text-kards-text-muted hover:text-kards-text"><X className="h-3 w-3" /></button>
  </div> : null;
}
