import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useDataFile } from '../../app/DataContext';
import { getDashboardSummary, setLinkedRecordComplete, type DashboardSummary } from '../../domain/agenda';
import type { QuickMemo } from '../../domain/model';
import { EmptyState, Field, formatDate, localDateValue, newRecordBase, SectionPanel } from '../../shared/ModuleUi';

const mealNames: Record<string, string> = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };

export default function DashboardPage() {
  const { data, updateData } = useDataFile();
  const [memoDraft, setMemoDraft] = useState('');
  const today = localDateValue();
  const summary = useMemo(() => data ? getDashboardSummary(data, today) : null, [data, today]);
  if (!data || !summary) return null;

  function addMemo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!memoDraft.trim()) return;
    const memo: QuickMemo = { ...newRecordBase(), content: memoDraft.trim() };
    updateData((current) => ({ ...current, quickMemos: [...current.quickMemos, memo] }));
    setMemoDraft('');
  }

  function togglePlanItem(item: DashboardSummary['plan']['items'][number]) {
    if (item.linkedRecord) {
      updateData((current) => setLinkedRecordComplete(current, item.linkedRecord!, !item.completed, today));
      return;
    }
    const planId = item.key.slice('plan:'.length);
    updateData((current) => ({ ...current, planItems: current.planItems.map((plan) => plan.id === planId ? { ...plan, completed: !plan.completed, updatedAt: new Date().toISOString() } : plan) }));
  }

  function updateMemo(id: string, content: string) {
    updateData((current) => ({ ...current, quickMemos: current.quickMemos.map((memo) => memo.id === id ? { ...memo, content, updatedAt: new Date().toISOString() } : memo) }));
  }

  function deleteMemo(memo: QuickMemo) {
    if (!window.confirm('删除这条快速备忘？')) return;
    updateData((current) => ({ ...current, quickMemos: current.quickMemos.filter((row) => row.id !== memo.id) }));
  }

  const progress = summary.plan.total ? Math.round(summary.plan.completed / summary.plan.total * 100) : 0;

  return (
    <div className="dashboard-page">
      <div className="dashboard-lead-grid">
        <SectionPanel title="今天的计划" detail={`${summary.plan.completed} / ${summary.plan.total} 项完成`} action={<a className="panel-link" href="#today">打开今日计划 <span aria-hidden="true">↗</span></a>} className="dashboard-plan-card">
          <div aria-label={`今日计划完成 ${progress}%`} className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          {summary.plan.items.length === 0 ? <EmptyState title="今天还没有安排" detail="把最重要的事先放进今日计划。" /> : <div className="dashboard-plan-list">{summary.plan.items.slice(0, 5).map((item) => <div className={`dashboard-plan-row${item.completed ? ' is-complete' : ''}`} key={item.key}><button aria-label={`${item.completed ? '取消完成' : '标记完成'}：${item.title}`} aria-pressed={item.completed} className={`check-button${item.completed ? ' checked' : ''}`} onClick={() => togglePlanItem(item)} type="button">{item.completed ? '✓' : ''}</button><span className="dashboard-plan-title">{item.title}</span>{item.source && <small>{item.source}</small>}</div>)}</div>}
          {summary.plan.items.length > 5 && <a className="panel-link dashboard-more-link" href="#today">还有 {summary.plan.items.length - 5} 项 · 查看全部</a>}
        </SectionPanel>

        <SectionPanel title="快速备忘" detail="随手记下临时想到的内容。" className="dashboard-memo-card">
          <form className="memo-create-form" onSubmit={addMemo}><Field label="快速备忘内容"><textarea aria-label="快速备忘内容" onChange={(event) => setMemoDraft(event.target.value)} placeholder="写下一个待记住的点…" value={memoDraft} /></Field><button className="button button-primary" disabled={!memoDraft.trim()} type="submit">记下来</button></form>
          {summary.memos.length === 0 ? <p className="memo-empty">你的备忘会保存在本地数据文件里。</p> : <div className="memo-list">{summary.memos.slice(0, 4).map((memo) => <MemoRow item={memo} key={memo.id} onDelete={deleteMemo} onUpdate={updateMemo} />)}</div>}
          {summary.memos.length > 4 && <div className="memo-overflow">还有 {summary.memos.length - 4} 条备忘</div>}
        </SectionPanel>
      </div>

      <div className="dashboard-section-heading"><div><p className="eyebrow">YOUR WORK</p><h2>工作进展</h2></div><span>按各模块记录汇总</span></div>
      <div className="dashboard-summary-grid">
        <SummaryCard title="自媒体" icon="◉" href="#media" accent="sage"><strong className="summary-number">{summary.work.mediaActive}</strong><span className="summary-unit">条内容在推进</span><p>{summary.work.mediaReady} 条待发布</p><CardLink label="查看内容进度" /></SummaryCard>
        <SummaryCard title="开发工作" icon="⌘" href="#development" accent="blue"><strong className="summary-number">{summary.work.developmentOpen}</strong><span className="summary-unit">项待完成</span><p className={summary.work.developmentBlocked ? 'summary-warning' : ''}>{summary.work.developmentBlocked ? `${summary.work.developmentBlocked} 项受阻` : '目前没有受阻事项'}</p><CardLink label="查看开发项目" /></SummaryCard>
        <SummaryCard title="咨询工作" icon="▧" href="#consulting" accent="lavender"><strong className="summary-number">{summary.work.followUps}</strong><span className="summary-unit">项近期跟进</span>{summary.work.upcomingFollowUps.slice(0, 2).map((followUp) => <p className="summary-detail-line" key={`${followUp.client}-${followUp.date}`}>{followUp.client} · {formatDate(followUp.date)}</p>)}{summary.work.upcomingFollowUps.length === 0 && <p>未来一周暂无跟进</p>}<CardLink label="查看客户记录" /></SummaryCard>
      </div>

      <div className="dashboard-section-heading life-heading"><div><p className="eyebrow">YOUR LIFE</p><h2>生活状态</h2></div><span>今天与最近的记录</span></div>
      <div className="dashboard-summary-grid">
        <SummaryCard title="健身计划" icon="↗" href="#fitness" accent="sage"><strong className="summary-number">{summary.life.workouts}</strong><span className="summary-unit">次今日训练</span><p>{summary.life.workoutsCompleted} 次已完成</p><CardLink label="打开训练记录" /></SummaryCard>
        <SummaryCard title="饮食计划" icon="◒" href="#diet" accent="amber"><strong className="summary-number">{summary.life.meals}</strong><span className="summary-unit">条今日餐食</span><p>{Object.entries(summary.life.mealTypes).filter(([, count]) => count > 0).map(([type]) => mealNames[type]).join(' · ') || '还没有餐食记录'}</p><CardLink label="查看今日饮食" /></SummaryCard>
        <SummaryCard title="游戏娱乐" icon="◇" href="#games" accent="lavender"><strong className="summary-number">{summary.life.gamesPlaying}</strong><span className="summary-unit">款正在玩的游戏</span>{summary.life.recentSessions.slice(0, 1).map((session) => <p key={`${session.gameName}-${session.date}`}>最近 · {session.gameName}{session.durationMinutes !== undefined ? ` · ${session.durationMinutes} 分钟` : ''}</p>)}{summary.life.recentSessions.length === 0 && <p>还没有游玩记录</p>}<CardLink label="查看游戏清单" /></SummaryCard>
      </div>
      <div className="dashboard-private-note"><span className="privacy-dot" />摘要由各模块实时汇总，数据保存在本机文件中</div>
    </div>
  );
}

function SummaryCard({ title, icon, href, accent, children }: {
  title: string; icon: string; href: string; accent: 'sage' | 'blue' | 'lavender' | 'amber'; children: ReactNode;
}) {
  return <article className={`summary-card accent-${accent}`}><header><span className="summary-card-icon" aria-hidden="true">{icon}</span><strong>{title}</strong></header><div className="summary-card-content">{children}</div><a className="summary-card-hitarea" href={href} aria-label={`进入${title}`} /></article>;
}

function CardLink({ label }: { label: string }) {
  return <span aria-hidden="true" className="summary-card-link">{label} <span>↗</span></span>;
}

function MemoRow({ item, onUpdate, onDelete }: {
  item: QuickMemo;
  onUpdate(id: string, content: string): void;
  onDelete(item: QuickMemo): void;
}) {
  return <article className="memo-row"><span className="memo-pin" aria-hidden="true" /><div className="memo-copy"><p>{item.content}</p><details className="record-edit" key={item.updatedAt}><summary>编辑</summary><form className="memo-edit-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onUpdate(item.id, String(form.get('content')).trim()); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Field label="备忘内容"><textarea aria-label={`编辑备忘：${item.content}`} defaultValue={item.content} name="content" required /></Field><button className="button button-primary" type="submit">保存修改</button></form></details></div><button aria-label={`删除备忘：${item.content}`} className="icon-button danger-button" onClick={() => onDelete(item)} type="button">×</button></article>;
}
