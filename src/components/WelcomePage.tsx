import { ArrowRight, ArrowRightLeft, Image, Plus, Shield, Upload } from 'lucide-react';
import { LOGOS } from '../lib/assetCatalog';
import './welcomePage.css';

export type WelcomeAction = 'import' | 'create' | 'ready' | 'compare' | 'image' | 'search' | 'cards' | 'packs' | 'decks';

export default function WelcomePage({ showWelcomePage, onShowWelcomePageChange, onAction }: {
  showWelcomePage: boolean;
  onShowWelcomePageChange: (show: boolean) => void;
  onAction: (action: WelcomeAction) => void;
}) {
  return <section aria-labelledby="welcome-heading" className="welcome-page">
    <header className="welcome-heading">
      <h2 id="welcome-heading">欢迎使用 KARDS 工具箱</h2>
    </header>

    <div className="welcome-sections glass-panel">
      <section className="welcome-decks" aria-labelledby="welcome-decks-heading">
        <h3 id="welcome-decks-heading">从一副卡组开始</h3>
        <div className="welcome-actions">
          {[
            { action: 'import', label: '导入卡组', description: '粘贴卡组码、分享文本，或选择卡组图片', Icon: Upload },
            { action: 'create', label: '新建空白卡组', description: '从零开始，搭配自己的阵容', Icon: Plus },
            { action: 'ready', label: '新建战备卡组', description: '选择一副预设卡组，快速开始构筑', Icon: Shield },
            { action: 'compare', label: '对比两个卡组', description: '比较费用曲线、稀有度和五项能力评分', Icon: ArrowRightLeft },
            { action: 'image', label: '卡组快速生图', description: '输入卡组码，生成完整图与迷你分享图', Icon: Image },
          ].map(({ action, label, description, Icon }) => <button key={action} type="button" className="welcome-action" onClick={() => onAction(action as WelcomeAction)}>
            <Icon className="welcome-action-icon" aria-hidden="true" />
            <span className="welcome-action-copy"><span>{label}</span><small>{description}</small></span>
            <ArrowRight className="welcome-action-arrow" aria-hidden="true" />
          </button>)}
        </div>
      </section>

      <div className="welcome-discover">
        <section aria-labelledby="welcome-cards-heading">
          <h3 id="welcome-cards-heading">发现下一张好牌</h3>
          <button type="button" className="welcome-action" onClick={() => onAction('search')}>
            <span className="welcome-action-icon" aria-hidden="true"><img src={LOGOS.card.black} alt="" className="welcome-icon-light" /><img src={LOGOS.card.white} alt="" className="welcome-icon-dark" /></span>
            <span className="welcome-action-copy"><span>搜索卡牌</span><small>按卡名、描述或属性查找</small></span>
            <ArrowRight className="welcome-action-arrow" aria-hidden="true" />
          </button>
          <button type="button" className="welcome-action" onClick={() => onAction('cards')}>
            <span className="welcome-action-icon" aria-hidden="true"><img src={LOGOS.cards.black} alt="" className="welcome-icon-light" /><img src={LOGOS.cards.white} alt="" className="welcome-icon-dark" /></span>
            <span className="welcome-action-copy"><span>探索卡牌库</span><small>浏览全部卡牌，了解词条与效果</small></span>
            <ArrowRight className="welcome-action-arrow" aria-hidden="true" />
          </button>
        </section>
        <section className="welcome-packs" aria-labelledby="welcome-packs-heading">
          <h3 id="welcome-packs-heading">来点惊喜</h3>
          <button type="button" className="welcome-action" onClick={() => onAction('packs')}>
            <img src={LOGOS.pack} alt="" className="welcome-action-icon pack-navigation-icon" />
            <span className="welcome-action-copy"><span>开个卡包试试手气</span><small>挑选卡包，体验模拟开包与翻牌</small></span>
            <ArrowRight className="welcome-action-arrow" aria-hidden="true" />
          </button>
        </section>
      </div>
    </div>

    <footer className="welcome-footer glass-panel">
      <div>
        <label className="welcome-preference"><input type="checkbox" checked={showWelcomePage} onChange={event => onShowWelcomePageChange(event.target.checked)} />显示欢迎页</label>
        <p>启动时显示，随时可点击左上角 Logo 返回。</p>
      </div>
      <button type="button" className="welcome-open-decks" onClick={() => onAction('decks')}>进入我的卡组<ArrowRight aria-hidden="true" /></button>
    </footer>
  </section>;
}
