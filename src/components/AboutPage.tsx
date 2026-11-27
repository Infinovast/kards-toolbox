import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { version } from '../../package.json';
import { LOGOS } from '../lib/assetCatalog';
import { openExternalLink } from '../lib/externalLinks';
import './aboutPage.css';

declare const __APP_COMMIT_DATE__: string;

const PROJECT_URL = 'https://github.com/Infinovast/kards-toolbox';

export default function AboutPage({ isDarkMode, onBack }: { isDarkMode: boolean; onBack: () => void }) {
  const [appVersion, setAppVersion] = useState(version);
  const isDesktop = Boolean(window.kardsDesktop);
  useEffect(() => {
    window.kardsDesktop?.getAppInfo().then(info => setAppVersion(info.version || version)).catch(() => {});
  }, []);

  return <section aria-label="关于 KARDS Toolbox" className="flex h-full w-full flex-col bg-kards-bg text-kards-text">
    <header className="shrink-0 px-5 pt-4">
      <button type="button" onClick={onBack} className="flex min-h-9 items-center gap-2 rounded-sm px-3 text-sm text-kards-text-muted hover:bg-kards-panel-hover hover:text-kards-text">
        <ArrowLeft size={17} aria-hidden="true" />返回
      </button>
    </header>

    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-5 pt-6 pb-10 sm:px-8">
        <div className="flex flex-col items-center text-center">
          <img src={isDarkMode ? LOGOS.brand.white : LOGOS.brand.black} alt="" className="h-20 w-36 max-w-full object-cover" />
          <h2 className="mt-4 text-4xl leading-tight font-bold tracking-tight">KARDS Toolbox</h2>
          <p className="mt-3 text-sm text-kards-text-muted">
            版本 {appVersion}{__APP_COMMIT_DATE__ && ` (${__APP_COMMIT_DATE__})`} {isDesktop ? 'Windows 桌面版' : '浏览器预览版'}
          </p>
          <p className="mt-1 text-sm text-kards-text-muted">© 2026 Harold Chiu</p>
          <a className="about-external-link mt-4 min-h-8" href={PROJECT_URL} target="_blank" rel="noreferrer" onClick={openExternalLink}>
            GitHub 项目主页 <ArrowUpRight size={15} aria-hidden="true" />
          </a>
        </div>

        <p className="mt-8 text-sm leading-6">KARDS Toolbox 是面向 KARDS 玩家的本地游戏辅助工具，支持查询卡牌数据库，分析、管理、分享卡组，模拟开包和浏览官方最新资讯。</p>

        <section aria-labelledby="about-license" className="mt-6 border-t border-kards-border pt-6">
          <h3 id="about-license" className="mb-2 text-lg font-semibold">许可与声明</h3>
          <div className="space-y-2 text-sm leading-6">
            <p>项目代码和文档采用 <a className="about-external-link" href={`${PROJECT_URL}/blob/main/LICENSE`} target="_blank" rel="noreferrer" onClick={openExternalLink}>MIT 许可证</a>。</p>
            <p className="text-kards-text-muted">
              本工具为非官方项目，KARDS 游戏素材归各自权利人所有。{' '}
              <a className="about-external-link" href={`${PROJECT_URL}/blob/main/THIRD_PARTY_NOTICES.md`} target="_blank" rel="noreferrer" onClick={openExternalLink}>
                第三方内容与许可证 <ArrowUpRight size={15} aria-hidden="true" />
              </a>
            </p>
          </div>
        </section>
      </div>
    </div>
  </section>;
}
