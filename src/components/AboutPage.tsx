import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { version } from '../../package.json';

export default function AboutPage({ onBack }: { onBack: () => void }) {
  const [desktop, setDesktop] = useState<KardsDesktopAppInfo | null>(null);
  useEffect(() => {
    window.kardsDesktop?.getAppInfo().then(setDesktop).catch(() => {});
  }, []);

  return <section aria-label="关于 KARDS Toolbox" className="w-full max-w-2xl rounded-lg glass-panel p-6 sm:p-8">
    <button onClick={onBack} className="mb-8 flex items-center gap-2 text-sm text-kards-text-muted hover:text-kards-text"><ArrowLeft className="h-4 w-4" />返回</button>
    <h2 className="text-3xl font-bold text-kards-text">KARDS Toolbox</h2>
    <p className="mt-2 text-lg text-kards-text">KARDS 工具箱</p>
    <p className="mt-3 text-sm text-kards-text-muted">版本 {desktop?.version || version} | {desktop ? 'Windows 桌面版' : '浏览器预览版'}</p>
    <p className="mt-6 text-sm leading-7 text-kards-text">面向个人玩家的 KARDS 本地工具集，提供卡牌查询、卡组构筑、卡组管理和本地卡组图片生成等功能。</p>
    <p className="mt-3 text-sm leading-7 text-kards-text-muted">卡组和设置在本地保存，卡图按需缓存，卡牌数据可在设置中手动更新。</p>
    <div className="mt-6 border-t border-kards-border pt-6 text-sm leading-7 text-kards-text-muted">
      <h3 className="font-bold text-kards-text">声明</h3>
      <p className="mt-2">KARDS Toolbox 是根据 1939 Games 的 "Community content policy" 政策，使用 1939 Games 拥有的资产创建的。所有素材归各自权利人所有。</p>
    </div>
  </section>;
}
