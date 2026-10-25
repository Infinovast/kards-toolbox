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
    <p className="mt-3 text-sm text-kards-text-muted">版本 {desktop?.version || version} · {desktop ? 'Windows 桌面版' : '浏览器预览版'}</p>
    <p className="mt-6 text-sm leading-7 text-kards-text">面向个人玩家的本地 KARDS 工具，提供卡牌查询、卡组构筑、卡组管理和本地图片生成。</p>
    <p className="mt-3 text-sm leading-7 text-kards-text-muted">卡组和设置保存在本机，卡图按需下载并缓存。卡牌数据可在设置中手动获取、核对并应用，不会自动更新牌库。</p>
    <div className="mt-6 border-t border-kards-border pt-6 text-sm leading-7 text-kards-text-muted">
      <h3 className="font-bold text-kards-text">来源与声明</h3>
      <p className="mt-2">整合与复用 Kards-Deck-Collector、kards-image-tool 和 koishi-plugin-kardsman 的实现。</p>
      <p className="mt-2">本工具为非官方项目，与 KARDS 官方无隶属关系。KARDS 名称、卡牌数据和图片归各自权利人所有。</p>
    </div>
  </section>;
}
