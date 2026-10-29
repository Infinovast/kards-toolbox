import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { version } from '../../package.json';

export default function AboutPage({ isDarkMode, onBack }: { isDarkMode: boolean; onBack: () => void }) {
  const [desktop, setDesktop] = useState<KardsDesktopAppInfo | null>(null);
  useEffect(() => {
    window.kardsDesktop?.getAppInfo().then(setDesktop).catch(() => {});
  }, []);

  return <section aria-label="关于 KARDS Toolbox" className="w-full max-w-2xl rounded-lg glass-panel p-6 sm:p-8">
    <button onClick={onBack} className="mb-8 flex items-center gap-2 text-sm text-kards-text-muted hover:text-kards-text"><ArrowLeft className="h-4 w-4" />返回</button>
    <div className="flex items-center gap-4 sm:gap-5">
      <img src={isDarkMode ? "/assets/kards_logos/KardsLogoWhite_icon_new.png" : "/assets/kards_logos/KardsLogoBlack_icon_new.png"} alt="" className="h-16 w-16 shrink-0 object-contain sm:h-20 sm:w-20" />
      <div>
        <h2 className="text-3xl font-bold text-kards-text">KARDS Toolbox</h2>
        <p className="mt-2 text-lg text-kards-text">KARDS 工具箱</p>
      </div>
    </div>
    <p className="mt-3 text-sm text-kards-text-muted">Version {desktop?.version || version} | {desktop ? 'Windows 桌面版' : '浏览器预览版'}</p>
    <p className="mt-6 text-sm leading-7 text-kards-text">面向个人玩家的 KARDS 工具集，提供卡牌查询、卡组构筑、管理和生图等功能。</p>
    <p className="mt-3 text-sm leading-7 text-kards-text-muted">卡组和设置在本地保存，卡图按需从线上缓存，卡牌数据可在设置中手动更新。</p>
    <p className="mt-6 border-t border-kards-border pt-6 text-sm leading-7 text-kards-text-muted">本工具为非官方项目，KARDS 游戏素材归各自权利人所有。</p>
  </section>;
}
