import { useEffect, useMemo, useState } from 'react';
import { FileConnectionPanel } from './app/FileConnectionPanel';
import { useDataFile } from './app/DataContext';
import TodayPage from './features/today/TodayPage';
import MediaPage from './features/media/MediaPage';
import DevelopmentPage from './features/development/DevelopmentPage';
import ConsultingPage from './features/consulting/ConsultingPage';
import FitnessPage from './features/fitness/FitnessPage';
import DietPage from './features/diet/DietPage';
import GamesPage from './features/games/GamesPage';
import DashboardPage from './features/dashboard/DashboardPage';
import SettingsPage from './features/settings/SettingsPage';

type PageId = 'home' | 'today' | 'media' | 'development' | 'consulting' | 'fitness' | 'diet' | 'games' | 'settings';

type NavigationItem = { id: PageId; label: string; icon: string; description: string };

const overviewItems: NavigationItem[] = [
  { id: 'home', label: '首页总览', icon: '⌂', description: '今天的安排和各领域近况都在这里。' },
  { id: 'today', label: '今日计划', icon: '▤', description: '把今天要做的事情安排清楚。' },
];

const workItems: NavigationItem[] = [
  { id: 'media', label: '自媒体', icon: '◉', description: '管理选题、制作进度和发布日期。' },
  { id: 'development', label: '开发工作', icon: '⌘', description: '按项目推进开发事项和问题。' },
  { id: 'consulting', label: '咨询工作', icon: '▧', description: '记录客户沟通和后续跟进。' },
];

const lifeItems: NavigationItem[] = [
  { id: 'fitness', label: '健身计划', icon: '↗', description: '安排训练并记录实际完成情况。' },
  { id: 'diet', label: '饮食计划', icon: '◒', description: '按日期记录每一餐的饮食。' },
  { id: 'games', label: '游戏娱乐', icon: '◇', description: '管理想玩的游戏和游玩记录。' },
];

const settingsItem: NavigationItem = {
  id: 'settings', label: '数据与设置', icon: '⚙', description: '管理本地数据文件、备份与恢复。',
};

const allItems = [...overviewItems, ...workItems, ...lifeItems, settingsItem];

function readPageFromHash(): PageId {
  const candidate = window.location.hash.slice(1) as PageId;
  return allItems.some((item) => item.id === candidate) ? candidate : 'home';
}

function NavigationGroup({ title, items, activePage }: { title?: string; items: NavigationItem[]; activePage: PageId }) {
  return (
    <div className="nav-group">
      {title && <div className="nav-group-title">{title}</div>}
      {items.map((item) => (
        <a
          aria-current={activePage === item.id ? 'page' : undefined}
          className={`nav-link${activePage === item.id ? ' is-active' : ''}`}
          href={`#${item.id}`}
          key={item.id}
        >
          <span aria-hidden="true" className="nav-icon">{item.icon}</span>
          <span>{item.label}</span>
        </a>
      ))}
    </div>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState<PageId>(() => readPageFromHash());
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const dataFile = useDataFile();
  const activeItem = useMemo(() => allItems.find((item) => item.id === activePage) ?? overviewItems[0], [activePage]);

  useEffect(() => {
    const updatePage = () => { setActivePage(readPageFromHash()); setQuickCreateOpen(false); };
    window.addEventListener('hashchange', updatePage);
    return () => window.removeEventListener('hashchange', updatePage);
  }, []);

  const today = new Intl.DateTimeFormat('zh-CN', {
    month: 'long', day: 'numeric', weekday: 'long',
  }).format(new Date());
  const statusLabel = dataFile.status === 'saved'
    ? `已保存 · ${dataFile.fileName}`
    : dataFile.status === 'saving'
      ? '正在保存'
      : dataFile.status === 'loading'
        ? '检查数据文件中'
        : dataFile.status === 'connecting'
          ? '正在连接'
          : dataFile.status === 'permission-required'
            ? '需要文件授权'
            : dataFile.status === 'unsupported'
              ? '浏览器不支持'
              : dataFile.status === 'error'
                ? '文件读写有问题'
                : '尚未连接数据文件';

  return (
    <div className="app-shell">
      <aside aria-label="主导航" className="sidebar">
        <a className="brand" href="#home" aria-label="日常，返回首页">
          <span aria-hidden="true" className="brand-mark">日</span>
          <span className="brand-copy"><strong>日常</strong><small>工作 · 生活</small></span>
        </a>

        <nav aria-label="主导航" className="sidebar-nav">
          <NavigationGroup items={overviewItems} activePage={activePage} />
          <NavigationGroup title="工作" items={workItems} activePage={activePage} />
          <NavigationGroup title="生活" items={lifeItems} activePage={activePage} />
        </nav>

        <div className="sidebar-bottom">
          <nav aria-label="设置导航">
            <NavigationGroup items={[settingsItem]} activePage={activePage} />
          </nav>
          <div className="privacy-note"><span className="privacy-dot" />仅保存在这台电脑</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>个人空间</span><span className="breadcrumb-separator">/</span><strong>{activeItem.label}</strong></div>
          <div className="topbar-actions">
            <div className="quick-create-wrap" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setQuickCreateOpen(false); }} onKeyDown={(event) => { if (event.key === 'Escape') setQuickCreateOpen(false); }}>
              <button aria-expanded={quickCreateOpen} aria-haspopup="menu" className="button button-secondary topbar-create" disabled={!dataFile.data} onClick={() => setQuickCreateOpen((open) => !open)} type="button"><span aria-hidden="true">＋</span>快速新增</button>
              {quickCreateOpen && <div aria-label="选择新增类型" className="quick-create-menu" role="menu">
                {[
                  ['today', '新增计划'], ['media', '新增自媒体内容'], ['development', '新增开发事项'],
                  ['consulting', '新增咨询记录'], ['fitness', '安排训练'], ['diet', '记录饮食'], ['games', '添加游戏'],
                ].map(([route, label]) => <a href={`#${route}`} key={route} onClick={() => setQuickCreateOpen(false)} role="menuitem">{label}<span aria-hidden="true">↗</span></a>)}
              </div>}
            </div>
            <div className="date-label"><span aria-hidden="true">◷</span>{today}</div>
            {dataFile.data && <button aria-label="手动保存数据文件" className="button button-secondary manual-save" disabled={dataFile.status === 'saving'} onClick={() => void dataFile.retrySave()} type="button"><span aria-hidden="true">↧</span>{dataFile.status === 'saving' ? '保存中…' : dataFile.status === 'error' ? '重试保存' : '保存'}</button>}
            <div aria-label={`数据文件状态：${statusLabel}`} className={`file-status file-status-${dataFile.status}`} title={dataFile.fileName ?? undefined}>
              <span className="status-dot" />{statusLabel}
            </div>
          </div>
        </header>

        <section aria-labelledby="page-title" className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{activePage === 'home' ? 'PERSONAL SPACE' : 'WORK & LIFE'}</p>
              <h1 id="page-title">{activeItem.label}</h1>
              <p className="page-description">{activeItem.description}</p>
            </div>
            <div className="heading-date"><span>今天</span><strong>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date())}</strong></div>
          </div>

          {!dataFile.data ? (
            <FileConnectionPanel />
          ) : activePage === 'home' ? (
            <DashboardPage />
          ) : activePage === 'today' ? (
            <TodayPage />
          ) : activePage === 'media' ? (
            <MediaPage />
          ) : activePage === 'development' ? (
            <DevelopmentPage />
          ) : activePage === 'consulting' ? (
            <ConsultingPage />
          ) : activePage === 'fitness' ? (
            <FitnessPage />
          ) : activePage === 'diet' ? (
            <DietPage />
          ) : activePage === 'games' ? (
            <GamesPage />
          ) : (
            <SettingsPage />
          )}
          <div className="shell-footnote">本机运行 · 私人数据 · 离线可用</div>
        </section>
      </main>
    </div>
  );
}
