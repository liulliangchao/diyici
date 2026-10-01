import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useDataFile } from '../../app/DataContext';
import { syncLinkedPlanItems } from '../../domain/agenda';
import { DEVELOPMENT_TASK_STATUSES, PROJECT_STATUSES, type DevelopmentProject, type DevelopmentTask, type DevelopmentTaskStatus, type ProjectStatus } from '../../domain/model';
import { EmptyState, Field, formatDate, newRecordBase, SectionPanel } from '../../shared/ModuleUi';

const taskStatusLabels: Record<DevelopmentTaskStatus, string> = { todo: '待处理', 'in-progress': '进行中', blocked: '受阻', done: '已完成' };
const projectStatusLabels: Record<ProjectStatus, string> = { active: '进行中', paused: '暂时搁置', completed: '已完成' };

export default function DevelopmentPage() {
  const { data, updateData } = useDataFile();
  const [projectName, setProjectName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [taskStatusFilter, setTaskStatusFilter] = useState<DevelopmentTaskStatus | 'all'>('all');

  const projects = data?.developmentProjects ?? [];
  const openTaskCount = (data?.developmentTasks ?? []).filter((task) => task.status !== 'done').length;
  useEffect(() => {
    if (!selectedProjectId && projects[0]) setSelectedProjectId(projects[0].id);
    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) setSelectedProjectId(projects[0]?.id ?? '');
  }, [projects, selectedProjectId]);

  const tasks = useMemo(() => (data?.developmentTasks ?? [])
    .filter((task) => task.projectId === selectedProjectId)
    .filter((task) => taskStatusFilter === 'all' || task.status === taskStatusFilter)
    .sort((a, b) => (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99')), [data?.developmentTasks, selectedProjectId, taskStatusFilter]);

  function addProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !projectName.trim()) return;
    const project: DevelopmentProject = { ...newRecordBase(), name: projectName.trim(), status: 'active' };
    updateData((current) => ({ ...current, developmentProjects: [...current.developmentProjects, project] }));
    setProjectName('');
    setSelectedProjectId(project.id);
  }

  function updateProject(id: string, patch: Partial<DevelopmentProject>) {
    updateData((current) => ({ ...current, developmentProjects: current.developmentProjects.map((project) => project.id === id ? { ...project, ...patch, updatedAt: new Date().toISOString() } : project) }));
  }

  function deleteProject(project: DevelopmentProject) {
    const childIds = data?.developmentTasks.filter((task) => task.projectId === project.id).map((task) => task.id) ?? [];
    if (!window.confirm(`删除项目“${project.name}”及其 ${childIds.length} 条开发事项？`)) return;
    updateData((current) => ({
      ...current,
      developmentProjects: current.developmentProjects.filter((row) => row.id !== project.id),
      developmentTasks: current.developmentTasks.filter((row) => row.projectId !== project.id),
      planItems: current.planItems.filter((row) => !(row.linkedRecord?.type === 'development-task' && childIds.includes(row.linkedRecord.id))),
    }));
  }

  function addTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !selectedProjectId || !taskTitle.trim()) return;
    const task: DevelopmentTask = {
      ...newRecordBase(), projectId: selectedProjectId, title: taskTitle.trim(), status: 'todo',
      ...(dueDate ? { dueDate } : {}),
    };
    updateData((current) => ({ ...current, developmentTasks: [...current.developmentTasks, task] }));
    setTaskTitle(''); setDueDate('');
  }

  function updateTask(id: string, patch: Partial<DevelopmentTask>) {
    updateData((current) => {
      const developmentTasks = current.developmentTasks.map((task) => task.id === id ? { ...task, ...patch, updatedAt: new Date().toISOString() } : task);
      const updated = developmentTasks.find((task) => task.id === id)!;
      return syncLinkedPlanItems({ ...current, developmentTasks }, { type: 'development-task', id }, { title: updated.title, date: updated.dueDate, completed: updated.status === 'done' });
    });
  }

  function deleteTask(task: DevelopmentTask) {
    if (!window.confirm(`删除开发事项“${task.title}”？`)) return;
    updateData((current) => ({
      ...current,
      developmentTasks: current.developmentTasks.filter((row) => row.id !== task.id),
      planItems: current.planItems.filter((row) => !(row.linkedRecord?.type === 'development-task' && row.linkedRecord.id === task.id)),
    }));
  }

  return (
    <div className="module-page development-page">
      <section className="development-hero"><div><p className="eyebrow">BUILD DESK</p><h2>把想法拆成项目，把项目推进成结果</h2><p>每个项目各自管理开发事项、进度状态和截止日期。</p></div><div className="development-hero-stats"><div><strong>{projects.length}</strong><span>项目空间</span></div><div><strong>{openTaskCount}</strong><span>待完成事项</span></div><div><strong>{(data?.developmentTasks ?? []).filter((task) => task.status === 'blocked').length}</strong><span>需要处理</span></div></div><span aria-hidden="true" className="development-hero-mark">⌘</span></section>
      <SectionPanel title="项目空间" detail={`${projects.length} 个项目 · 事项按项目组织`} className="form-panel">
        <form className="project-create-form" onSubmit={addProject}>
          <Field label="新项目名称"><input aria-label="新项目名称" onChange={(event) => setProjectName(event.target.value)} placeholder="例如：个人主页改版" required value={projectName} /></Field>
          <button className="button button-primary" type="submit">创建项目</button>
        </form>
        {projects.length > 0 && <div className="project-strip">{projects.map((project) => (
          <article className={`project-card${selectedProjectId === project.id ? ' is-selected' : ''}`} key={project.id}>
            <button aria-pressed={selectedProjectId === project.id} className="project-select" onClick={() => setSelectedProjectId(project.id)} type="button">
              <span className="project-mark" aria-hidden="true">⌘</span><span className="project-card-copy"><strong>{project.name}</strong><small>{data?.developmentTasks.filter((task) => task.projectId === project.id && task.status !== 'done').length ?? 0} 项待完成</small></span>
            </button>
            <div className="project-card-tools">
              <Field label={`项目状态：${project.name}`}><select aria-label={`项目状态：${project.name}`} onChange={(event) => updateProject(project.id, { status: event.target.value as ProjectStatus })} value={project.status}>{PROJECT_STATUSES.map((status) => <option key={status} value={status}>{projectStatusLabels[status]}</option>)}</select></Field>
              <details className="record-edit" key={project.updatedAt}><summary>编辑</summary><form className="record-edit-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); updateProject(project.id, { name: String(form.get('name')).trim(), notes: String(form.get('notes')).trim() || undefined }); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Field label="项目名称"><input defaultValue={project.name} name="name" required /></Field><Field label="备注"><input defaultValue={project.notes ?? ''} name="notes" /></Field><button className="button button-primary" type="submit">保存项目</button></form></details>
              <button aria-label={`删除项目：${project.name}`} className="icon-button danger-button" onClick={() => deleteProject(project)} type="button">×</button>
            </div>
          </article>
        ))}</div>}
      </SectionPanel>

      <SectionPanel title={projects.length ? '开发事项' : '先创建一个项目'} detail={projects.length ? '事项保存在所属项目中，可按进度筛选。' : '项目用于归纳相关开发任务、问题和进度。'} action={projects.length > 0 ? <Field label="筛选状态"><select aria-label="筛选开发状态" onChange={(event) => setTaskStatusFilter(event.target.value as DevelopmentTaskStatus | 'all')} value={taskStatusFilter}><option value="all">全部状态</option>{DEVELOPMENT_TASK_STATUSES.map((status) => <option key={status} value={status}>{taskStatusLabels[status]}</option>)}</select></Field> : undefined} className="form-panel">
        {projects.length === 0 ? <EmptyState title="还没有开发项目" detail="创建项目后，就可以在项目下添加开发事项。" /> : <>
          <form className="task-create-form" onSubmit={addTask}>
            <Field label="开发事项"><input aria-label="开发事项标题" onChange={(event) => setTaskTitle(event.target.value)} placeholder="例如：修复导航折叠问题" required value={taskTitle} /></Field>
            <Field label="所属项目"><select aria-label="开发事项所属项目" onChange={(event) => setSelectedProjectId(event.target.value)} value={selectedProjectId}>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></Field>
            <Field label="截止日期"><input aria-label="开发截止日期" onChange={(event) => setDueDate(event.target.value)} type="date" value={dueDate} /></Field>
            <button className="button button-primary" type="submit">添加事项</button>
          </form>
          {tasks.length === 0 ? <EmptyState title="这个项目还没有事项" detail="添加一个具体的开发任务或问题。" /> : <div className="domain-record-list">{tasks.map((task) => <TaskRow item={task} key={task.id} onDelete={deleteTask} onUpdate={updateTask} />)}</div>}
        </>}
      </SectionPanel>
    </div>
  );
}

function TaskRow({ item, onUpdate, onDelete }: {
  item: DevelopmentTask;
  onUpdate(id: string, patch: Partial<DevelopmentTask>): void;
  onDelete(item: DevelopmentTask): void;
}) {
  return (
    <article className="domain-record">
      <div className="record-leading-icon task-leading" aria-hidden="true">{item.status === 'blocked' ? '!' : item.status === 'done' ? '✓' : '•'}</div>
      <div className="domain-record-body">
        <div className="record-title-line"><strong className={item.status === 'done' ? 'muted-strike' : ''}>{item.title}</strong><span className={`stage-pill task-${item.status}`}>{taskStatusLabels[item.status]}</span></div>
        <div className="record-meta-line">{item.dueDate && <span>截止 · {formatDate(item.dueDate)}</span>}{item.notes && <span>{item.notes}</span>}</div>
        <div className="record-row-tools">
          <Field label="更新事项状态"><select aria-label={`开发事项状态：${item.title}`} onChange={(event) => onUpdate(item.id, { status: event.target.value as DevelopmentTaskStatus })} value={item.status}>{DEVELOPMENT_TASK_STATUSES.map((status) => <option key={status} value={status}>{taskStatusLabels[status]}</option>)}</select></Field>
          <details className="record-edit" key={item.updatedAt}><summary>编辑详情</summary><form className="record-edit-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onUpdate(item.id, { title: String(form.get('title')).trim(), dueDate: String(form.get('dueDate')) || undefined, notes: String(form.get('notes')).trim() || undefined }); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Field label="事项标题"><input aria-label={`编辑开发事项：${item.title}`} defaultValue={item.title} name="title" required /></Field><Field label="截止日期"><input defaultValue={item.dueDate ?? ''} name="dueDate" type="date" /></Field><Field label="备注"><input defaultValue={item.notes ?? ''} name="notes" /></Field><button className="button button-primary" type="submit">保存修改</button></form></details>
        </div>
      </div>
      <button aria-label={`删除开发事项：${item.title}`} className="icon-button danger-button" onClick={() => onDelete(item)} type="button">×</button>
    </article>
  );
}
