import { useMemo, useState, type FormEvent } from 'react';
import { useDataFile } from '../../app/DataContext';
import { getDatedModuleEvents, getLinkableModuleEvents, setLinkedRecordComplete, type DatedModuleEvent } from '../../domain/agenda';
import { EmptyState, Field, localDateValue, newRecordBase, SectionPanel } from '../../shared/ModuleUi';
import type { LinkedRecord, PlanItem } from '../../domain/model';

const categories = ['工作', '自媒体', '开发', '咨询', '健身', '饮食', '游戏', '个人'];

export default function TodayPage() {
  const { data, updateData } = useDataFile();
  const [date, setDate] = useState(localDateValue());
  const [title, setTitle] = useState('');
  const [plannedTime, setPlannedTime] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes] = useState('');
  const [linkedKey, setLinkedKey] = useState('');

  const items = useMemo(() => (data?.planItems ?? [])
    .filter((item) => item.date === date)
    .sort((a, b) => (a.plannedTime ?? '99:99').localeCompare(b.plannedTime ?? '99:99') || a.sortOrder - b.sortOrder), [data?.planItems, date]);
  const moduleEvents = useMemo(() => data ? getDatedModuleEvents(data, date) : [], [data, date]);
  const linkableEvents = useMemo(() => data ? getLinkableModuleEvents(data) : [], [data]);
  const completed = items.filter((item) => item.completed).length + moduleEvents.filter((event) => event.completed).length;
  const total = items.length + moduleEvents.length;

  function changeDate(nextDate: string) {
    setDate(nextDate);
    setLinkedKey('');
  }

  function selectLinkedRecord(key: string) {
    setLinkedKey(key);
    const linked = linkableEvents.find((event) => event.key === key);
    if (!linked) return;
    setDate(linked.date);
    setTitle(linked.title);
    setCategory(linked.linkedRecord.type === 'media' ? '自媒体' : linked.linkedRecord.type === 'development-task' ? '开发' : linked.linkedRecord.type === 'consultation-follow-up' ? '咨询' : '健身');
  }

  function addPlanItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const linked = linkableEvents.find((event) => event.key === linkedKey);
    const cleanTitle = linked?.title ?? title.trim();
    if (!cleanTitle || !data) return;
    const item: PlanItem = {
      ...newRecordBase(),
      date: linked?.date ?? date,
      title: cleanTitle,
      ...(plannedTime ? { plannedTime } : {}),
      ...(category ? { category } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(linked ? { linkedRecord: linked.linkedRecord } : {}),
      completed: linked?.completed ?? false,
      sortOrder: data.planItems.length,
    };
    updateData((current) => ({ ...current, planItems: [...current.planItems, item] }));
    setTitle('');
    setPlannedTime('');
    setCategory('');
    setNotes('');
    setLinkedKey('');
  }

  function updatePlanItem(id: string, patch: Partial<PlanItem>) {
    updateData((current) => {
      const existing = current.planItems.find((item) => item.id === id);
      let next = current;
      if (existing?.linkedRecord && patch.completed !== undefined) {
        next = setLinkedRecordComplete(current, existing.linkedRecord, patch.completed, localDateValue());
      }
      return {
        ...next,
        planItems: next.planItems.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item),
      };
    });
  }

  function deletePlanItem(item: PlanItem) {
    if (!window.confirm(`删除“${item.title}”？`)) return;
    updateData((current) => ({ ...current, planItems: current.planItems.filter((row) => row.id !== item.id) }));
  }

  function shiftDate(offset: number) {
    const next = new Date(`${date}T12:00:00`);
    next.setDate(next.getDate() + offset);
    changeDate(localDateValue(next));
  }

  return (
    <div className="module-page">
      <div className="date-toolbar">
        <div className="date-switcher">
          <button aria-label="前一天" className="icon-button" onClick={() => shiftDate(-1)} type="button">‹</button>
          <Field label="查看日期"><input aria-label="查看日期" onChange={(event) => changeDate(event.target.value)} type="date" value={date} /></Field>
          <button aria-label="后一天" className="icon-button" onClick={() => shiftDate(1)} type="button">›</button>
          <button className="text-button" onClick={() => changeDate(localDateValue())} type="button">回到今天</button>
        </div>
        <div className="completion-counter"><strong>{completed}<span> / </span>{total}</strong><small>项已完成</small></div>
      </div>

      <SectionPanel title="添加计划" detail="安排到具体日期，可选时间和所属领域。" className="form-panel">
        <form className="plan-create-form" onSubmit={addPlanItem}>
          <Field label="计划内容"><input aria-label="计划内容" autoComplete="off" onChange={(event) => setTitle(event.target.value)} placeholder="例如：完成周报初稿" readOnly={Boolean(linkedKey)} required value={title} /></Field>
          <Field className="plan-link-field" label="关联模块记录"><select aria-label="关联模块记录" onChange={(event) => selectLinkedRecord(event.target.value)} value={linkedKey}><option value="">不关联 · 独立计划</option>{linkableEvents.map((event) => <option key={event.key} value={event.key}>{event.date} · {event.source} · {event.title}</option>)}</select></Field>
          <Field label="计划时间"><input aria-label="计划时间" onChange={(event) => setPlannedTime(event.target.value)} type="time" value={plannedTime} /></Field>
          <Field label="所属领域"><select aria-label="所属领域" onChange={(event) => setCategory(event.target.value)} value={category}><option value="">暂不分类</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
          <Field className="plan-notes-field" label="备注"><input aria-label="计划备注" onChange={(event) => setNotes(event.target.value)} placeholder="可选" value={notes} /></Field>
          <button className="button button-primary plan-submit" type="submit"><span aria-hidden="true">＋</span>添加计划</button>
        </form>
      </SectionPanel>

      <SectionPanel title={date === localDateValue() ? '今天的安排' : '当天安排'} detail={`${date} · ${total} 项计划`} className="plan-list-panel">
        {items.length === 0 ? (
          <EmptyState title="这一天还没有安排" detail="先记下一件今天想完成的事。" />
        ) : (
          <div className="plan-list">
            {items.map((item) => <PlanRow item={item} key={item.id} onDelete={deletePlanItem} onUpdate={updatePlanItem} />)}
          </div>
        )}
      </SectionPanel>
      <SectionPanel title="来自各模块的日期事项" detail="发布、开发截止、咨询跟进和训练安排会按日期汇总。">
        {moduleEvents.length === 0 ? <EmptyState title="这一天没有额外的模块事项" detail="设置模块记录的日期后，它们会自动出现在这里。" /> : <div className="module-event-list">{moduleEvents.map((event) => <ModuleEventRow event={event} key={event.key} onComplete={(reference, completedState) => updateData((current) => setLinkedRecordComplete(current, reference, completedState, localDateValue()))} />)}</div>}
      </SectionPanel>
    </div>
  );
}

function ModuleEventRow({ event, onComplete }: { event: DatedModuleEvent; onComplete(reference: LinkedRecord, completed: boolean): void }) {
  return <article className={`module-event-row${event.completed ? ' is-complete' : ''}`}><button aria-label={`${event.completed ? '取消完成' : '标记完成'}：${event.title}`} aria-pressed={event.completed} className={`check-button${event.completed ? ' checked' : ''}`} onClick={() => onComplete(event.linkedRecord, !event.completed)} type="button">{event.completed ? '✓' : ''}</button><div className="module-event-copy"><strong>{event.title}</strong><span>{event.source}</span></div>{event.notes && <small>{event.notes}</small>}</article>;
}

function PlanRow({ item, onUpdate, onDelete }: {
  item: PlanItem;
  onUpdate(id: string, patch: Partial<PlanItem>): void;
  onDelete(item: PlanItem): void;
}) {
  return (
    <article className={`plan-row${item.completed ? ' is-complete' : ''}`}>
      <button
        aria-label={`${item.completed ? '取消完成' : '标记完成'}：${item.title}`}
        aria-pressed={item.completed}
        className={`check-button${item.completed ? ' checked' : ''}`}
        onClick={() => onUpdate(item.id, { completed: !item.completed })}
        type="button"
      >{item.completed ? '✓' : ''}</button>
      <div className="plan-row-copy">
        <strong>{item.title}</strong>
        <div className="plan-row-meta">
          {item.plannedTime && <span>{item.plannedTime}</span>}
          {item.category && <span className="category-tag">{item.category}</span>}
          {item.linkedRecord && <span className="linked-tag">关联模块</span>}
          {item.notes && <span className="plan-note">{item.notes}</span>}
        </div>
        <details className="record-edit" key={item.updatedAt}>
          <summary>编辑</summary>
          <form className="record-edit-form" onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onUpdate(item.id, item.linkedRecord ? {
              plannedTime: String(form.get('time')) || undefined,
              category: String(form.get('category')) || undefined,
              notes: String(form.get('notes')).trim() || undefined,
            } : {
              title: String(form.get('title')).trim(),
              date: String(form.get('date')),
              plannedTime: String(form.get('time')) || undefined,
              category: String(form.get('category')) || undefined,
              notes: String(form.get('notes')).trim() || undefined,
            });
            event.currentTarget.closest('details')?.removeAttribute('open');
          }}>
            {item.linkedRecord ? <p className="linked-edit-note">标题、日期和完成状态来自关联模块，请到来源记录中修改。</p> : <><Field label="计划内容"><input aria-label={`编辑计划内容：${item.title}`} defaultValue={item.title} name="title" required /></Field><Field label="日期"><input aria-label={`编辑日期：${item.title}`} defaultValue={item.date} name="date" required type="date" /></Field></>}
            <Field label="时间"><input aria-label={`编辑时间：${item.title}`} defaultValue={item.plannedTime ?? ''} name="time" type="time" /></Field>
            <Field label="领域"><select aria-label={`编辑领域：${item.title}`} defaultValue={item.category ?? ''} name="category"><option value="">暂不分类</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
            <Field label="备注"><input aria-label={`编辑备注：${item.title}`} defaultValue={item.notes ?? ''} name="notes" /></Field>
            <button className="button button-primary" type="submit">保存修改</button>
          </form>
        </details>
      </div>
      <button aria-label={`删除计划：${item.title}`} className="icon-button danger-button" onClick={() => onDelete(item)} type="button">×</button>
    </article>
  );
}
