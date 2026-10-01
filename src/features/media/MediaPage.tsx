import { useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { useDataFile } from '../../app/DataContext';
import { deleteMediaSnapshot, MEDIA_METRICS, type MediaMetricKey, upsertMediaSnapshot } from '../../domain/mediaMetrics';
import { syncLinkedPlanItems } from '../../domain/agenda';
import { MEDIA_STAGES, type MediaContent, type MediaMetricsSnapshot, type MediaStage } from '../../domain/model';
import { EmptyState, Field, formatDate, localDateValue, newRecordBase, SectionPanel } from '../../shared/ModuleUi';

const stageLabels: Record<MediaStage, string> = {
  idea: '选题', preparing: '准备中', producing: '制作中', ready: '待发布', published: '已发布',
};

export default function MediaPage() {
  const { data, updateData } = useDataFile();
  const [filter, setFilter] = useState<MediaStage | 'all'>('all');
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState('');
  const [format, setFormat] = useState('');
  const [stage, setStage] = useState<MediaStage>('idea');
  const [publishDate, setPublishDate] = useState('');

  const items = useMemo(() => (data?.mediaItems ?? [])
    .filter((item) => filter === 'all' || item.stage === filter)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [data?.mediaItems, filter]);

  function addContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !title.trim()) return;
    const item: MediaContent = {
      ...newRecordBase(), title: title.trim(), stage,
      ...(platform.trim() ? { platform: platform.trim() } : {}),
      ...(format.trim() ? { format: format.trim() } : {}),
      ...(publishDate ? { plannedPublishDate: publishDate } : {}),
    };
    updateData((current) => ({ ...current, mediaItems: [...current.mediaItems, item] }));
    setTitle(''); setPlatform(''); setFormat(''); setStage('idea'); setPublishDate('');
  }

  function updateItem(id: string, patch: Partial<MediaContent>) {
    updateData((current) => {
      const mediaItems = current.mediaItems.map((item) => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item);
      const updated = mediaItems.find((item) => item.id === id)!;
      return syncLinkedPlanItems({ ...current, mediaItems }, { type: 'media', id }, { title: updated.title, date: updated.plannedPublishDate, completed: updated.stage === 'published' });
    });
  }

  function deleteItem(item: MediaContent) {
    if (!window.confirm(`删除内容“${item.title}”？`)) return;
    updateData((current) => ({
      ...current,
      mediaItems: current.mediaItems.filter((row) => row.id !== item.id),
      planItems: current.planItems.filter((row) => !(row.linkedRecord?.type === 'media' && row.linkedRecord.id === item.id)),
    }));
  }

  const counts = MEDIA_STAGES.map((value) => ({ stage: value, count: data?.mediaItems.filter((item) => item.stage === value).length ?? 0 }));
  const publishedItems = (data?.mediaItems ?? []).filter((item) => item.stage === 'published');
  const inProgressCount = (data?.mediaItems ?? []).filter((item) => item.stage !== 'published').length;

  return (
    <div className="module-page media-page">
      <section className="media-intro-band">
        <div className="media-intro-copy"><p className="eyebrow">CREATOR STUDIO</p><h2>从一个选题，到一支被看见的视频</h2><p>追踪内容进度，也持续观察发布后的真实表现。</p></div>
        <div className="media-intro-stats"><div><strong>{inProgressCount}</strong><span>进行中的内容</span></div><div><strong>{counts.find((item) => item.stage === 'published')?.count ?? 0}</strong><span>已发布作品</span></div><div><strong>{publishedItems.reduce((total, item) => total + (item.metricsSnapshots?.length ?? 0), 0)}</strong><span>次数据记录</span></div></div>
        <span aria-hidden="true" className="media-intro-orbit">◉</span>
      </section>
      <div className="workflow-summary">
        {counts.map(({ stage: value, count }) => <button className={`workflow-step${filter === value ? ' is-selected' : ''}`} key={value} onClick={() => setFilter(filter === value ? 'all' : value)} type="button"><span>{stageLabels[value]}</span><strong>{count}</strong></button>)}
      </div>

      <MediaInsightsPanel items={publishedItems} onUpdate={updateItem} />

      <SectionPanel title="新建内容" detail="从选题开始，记录平台、形式和计划发布日期。" className="form-panel">
        <form className="domain-form media-create-form" onSubmit={addContent}>
          <Field label="选题 / 内容标题"><input aria-label="选题标题" onChange={(event) => setTitle(event.target.value)} placeholder="例如：一周工作复盘" required value={title} /></Field>
          <Field label="发布平台"><input aria-label="发布平台" onChange={(event) => setPlatform(event.target.value)} placeholder="可选" value={platform} /></Field>
          <Field label="内容形式"><input aria-label="内容形式" onChange={(event) => setFormat(event.target.value)} placeholder="图文、视频…" value={format} /></Field>
          <Field label="当前阶段"><select aria-label="当前阶段" onChange={(event) => setStage(event.target.value as MediaStage)} value={stage}>{MEDIA_STAGES.map((value) => <option key={value} value={value}>{stageLabels[value]}</option>)}</select></Field>
          <Field label="计划发布日期"><input aria-label="计划发布日期" onChange={(event) => setPublishDate(event.target.value)} type="date" value={publishDate} /></Field>
          <button className="button button-primary" type="submit">添加内容</button>
        </form>
      </SectionPanel>

      <SectionPanel title={filter === 'all' ? '内容库' : `${stageLabels[filter]}内容`} detail={`${items.length} 条内容记录`} action={<Field label="筛选阶段"><select aria-label="筛选阶段" onChange={(event) => setFilter(event.target.value as MediaStage | 'all')} value={filter}><option value="all">全部阶段</option>{MEDIA_STAGES.map((value) => <option key={value} value={value}>{stageLabels[value]}</option>)}</select></Field>}>
        {items.length === 0 ? <EmptyState title="还没有内容记录" detail="添加一个选题，开始记录它的制作进度。" /> : (
          <div className="domain-record-list">
            {items.map((item) => <MediaRow item={item} key={item.id} onDelete={deleteItem} onUpdate={updateItem} />)}
          </div>
        )}
      </SectionPanel>
    </div>
  );
}

const metricLabels: Record<MediaMetricKey, string> = { views: '播放量', likes: '点赞', comments: '评论', saves: '收藏', shares: '分享' };
const emptyMetricDraft = () => ({ views: '', likes: '', comments: '', saves: '', shares: '' });

function MediaInsightsPanel({ items, onUpdate }: { items: MediaContent[]; onUpdate(id: string, patch: Partial<MediaContent>): void }) {
  const [selectedId, setSelectedId] = useState('');
  const [selectedMetric, setSelectedMetric] = useState<MediaMetricKey>('views');
  const [snapshotDate, setSnapshotDate] = useState(localDateValue());
  const [values, setValues] = useState<Record<MediaMetricKey, string>>(emptyMetricDraft());
  const item = items.find((video) => video.id === selectedId) ?? items[0] ?? null;
  const snapshots = (item?.metricsSnapshots ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const latest = snapshots[snapshots.length - 1];

  function saveSnapshot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!item) return;
    const now = new Date().toISOString();
    const existing = snapshots.find((row) => row.date === snapshotDate);
    const snapshot: MediaMetricsSnapshot = {
      ...(existing ?? { id: crypto.randomUUID(), createdAt: now }),
      updatedAt: now,
      date: snapshotDate,
      views: Number(values.views || 0),
      likes: Number(values.likes || 0),
      comments: Number(values.comments || 0),
      saves: Number(values.saves || 0),
      shares: Number(values.shares || 0),
    };
    onUpdate(item.id, { metricsSnapshots: upsertMediaSnapshot(item, snapshot).metricsSnapshots });
    setValues(emptyMetricDraft());
  }

  function editSnapshot(snapshot: MediaMetricsSnapshot) {
    setSnapshotDate(snapshot.date);
    setValues({ views: String(snapshot.views), likes: String(snapshot.likes), comments: String(snapshot.comments), saves: String(snapshot.saves), shares: String(snapshot.shares) });
  }

  function removeSnapshot(snapshot: MediaMetricsSnapshot) {
    if (!item || !window.confirm(`删除 ${formatDate(snapshot.date)} 的视频数据记录？`)) return;
    onUpdate(item.id, { metricsSnapshots: deleteMediaSnapshot(item, snapshot.id).metricsSnapshots });
    if (snapshot.date === snapshotDate) setValues(emptyMetricDraft());
  }

  return (
    <SectionPanel title="发布后数据" detail="按日期记录平台后台的累计数据，观察作品发布后的表现。" className="media-insights-panel">
      {items.length === 0 ? <div className="media-insights-empty"><div className="media-insights-empty-mark" aria-hidden="true">↗</div><div><strong>发布一支作品后，就能开始追踪表现</strong><p>将内容阶段更新为“已发布”，再按日期录入播放、互动与分享数据。</p></div></div> : <>
        <div className="media-insights-toolbar"><Field label="选择已发布视频"><select aria-label="选择已发布视频" onChange={(event) => { setSelectedId(event.target.value); setSnapshotDate(localDateValue()); setValues(emptyMetricDraft()); }} value={item?.id ?? ''}>{items.map((video) => <option key={video.id} value={video.id}>{video.title}</option>)}</select></Field>{latest && <span className="insight-updated">最近记录 · {formatDate(latest.date)}</span>}</div>
        <div className="media-metric-cards">{MEDIA_METRICS.map((metric) => <button aria-pressed={selectedMetric === metric.key} className={`media-metric-card${selectedMetric === metric.key ? ' is-selected' : ''}`} key={metric.key} onClick={() => setSelectedMetric(metric.key)} style={{ '--metric-color': metric.color } as CSSProperties} type="button"><span>{metric.label}</span><strong>{latest ? latest[metric.key].toLocaleString('zh-CN') : '—'}</strong><small>{snapshots.length > 1 && latest ? `共 ${snapshots.length} 次记录` : '点击查看趋势'}</small></button>)}</div>
        <div className="media-insights-body"><div className="media-trend-area"><div className="media-trend-heading"><div><span className="eyebrow">PERFORMANCE TREND</span><h3>{metricLabels[selectedMetric]}趋势</h3></div><span>累计数据</span></div><MetricTrendChart snapshots={snapshots} metric={selectedMetric} />
          {snapshots.length > 0 && <div className="metrics-history"><div className="metrics-history-heading"><strong>记录历史</strong><span>{snapshots.length} 个日期</span></div><div className="metrics-history-scroll"><table><thead><tr><th>日期</th>{MEDIA_METRICS.map((metric) => <th key={metric.key}>{metric.label}</th>)}<th>操作</th></tr></thead><tbody>{snapshots.slice().reverse().map((snapshot) => <tr key={snapshot.id}><td>{formatDate(snapshot.date)}</td>{MEDIA_METRICS.map((metric) => <td key={metric.key}>{snapshot[metric.key].toLocaleString('zh-CN')}</td>)}<td><button className="text-button" onClick={() => editSnapshot(snapshot)} type="button">编辑</button><button aria-label={`删除${formatDate(snapshot.date)}视频数据`} className="text-button danger-text" onClick={() => removeSnapshot(snapshot)} type="button">删除</button></td></tr>)}</tbody></table></div></div>}
        </div>
        <form className="metric-entry-form" onSubmit={saveSnapshot}><div className="metric-entry-heading"><span className="metric-entry-icon" aria-hidden="true">＋</span><div><strong>记录一次数据</strong><p>同一天再次保存会更新原记录。</p></div></div><Field label="统计日期"><input aria-label="视频数据日期" onChange={(event) => setSnapshotDate(event.target.value)} type="date" value={snapshotDate} required /></Field>{MEDIA_METRICS.map((metric) => <Field key={metric.key} label={metric.label}><input aria-label={`视频${metric.label}`} min="0" onChange={(event) => setValues((current) => ({ ...current, [metric.key]: event.target.value }))} placeholder="0" step="1" type="number" value={values[metric.key]} /></Field>)}<button className="button button-primary" type="submit">保存数据</button></form></div>
      </>}
    </SectionPanel>
  );
}

function MetricTrendChart({ snapshots, metric }: { snapshots: MediaMetricsSnapshot[]; metric: MediaMetricKey }) {
  if (snapshots.length === 0) return <div className="metric-chart-empty"><span aria-hidden="true">⌁</span><strong>还没有趋势数据</strong><p>在右侧录入一次发布后的数据，图表会从这里开始。</p></div>;
  const width = 680;
  const height = 220;
  const left = 54;
  const right = 18;
  const top = 17;
  const bottom = 38;
  const values = snapshots.map((snapshot) => snapshot[metric]);
  const max = Math.max(...values, 1);
  const x = (index: number) => snapshots.length === 1 ? (left + width - right) / 2 : left + (index / (snapshots.length - 1)) * (width - left - right);
  const y = (value: number) => height - bottom - (value / max) * (height - top - bottom);
  const points = snapshots.map((snapshot, index) => `${x(index)},${y(snapshot[metric])}`).join(' ');
  const color = MEDIA_METRICS.find((item) => item.key === metric)!.color;
  return <div className="metric-chart-wrap"><svg aria-label={`${metricLabels[metric]}趋势图`} className="metric-chart" preserveAspectRatio="none" role="img" viewBox={`0 0 ${width} ${height}`}>
    {[0, .5, 1].map((fraction) => { const value = Math.round(max * fraction); const lineY = y(value); return <g key={fraction}><line className="chart-gridline" x1={left} x2={width - right} y1={lineY} y2={lineY} /><text className="chart-axis-label" textAnchor="end" x={left - 9} y={lineY + 4}>{value.toLocaleString('zh-CN')}</text></g>; })}
    {snapshots.length > 1 && <polyline className="chart-line" fill="none" points={points} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />}
    {snapshots.map((snapshot, index) => <g key={snapshot.id}><circle className="chart-dot" cx={x(index)} cy={y(snapshot[metric])} fill={color} r="5" /><text className="chart-date-label" textAnchor={index === 0 ? 'start' : index === snapshots.length - 1 ? 'end' : 'middle'} x={x(index)} y={height - 10}>{snapshot.date.slice(5)}</text></g>)}
  </svg></div>;
}

function MediaRow({ item, onUpdate, onDelete }: {
  item: MediaContent;
  onUpdate(id: string, patch: Partial<MediaContent>): void;
  onDelete(item: MediaContent): void;
}) {
  return (
    <article className="domain-record media-record">
      <div className="record-leading-icon" aria-hidden="true">◉</div>
      <div className="domain-record-body">
        <div className="record-title-line"><strong>{item.title}</strong><span className={`stage-pill stage-${item.stage}`}>{stageLabels[item.stage]}</span></div>
        <div className="record-meta-line">
          {item.platform && <span>{item.platform}</span>}{item.format && <span>{item.format}</span>}
          {item.plannedPublishDate && <span>计划发布 · {formatDate(item.plannedPublishDate)}</span>}
        </div>
        <div className="record-row-tools">
          <Field label="更新阶段"><select aria-label={`更新阶段：${item.title}`} onChange={(event) => onUpdate(item.id, { stage: event.target.value as MediaStage })} value={item.stage}>{MEDIA_STAGES.map((value) => <option key={value} value={value}>{stageLabels[value]}</option>)}</select></Field>
          <details className="record-edit" key={item.updatedAt}><summary>编辑详情</summary>
            <form className="record-edit-form" onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              onUpdate(item.id, {
                title: String(form.get('title')).trim(),
                platform: String(form.get('platform')).trim() || undefined,
                format: String(form.get('format')).trim() || undefined,
                stage: String(form.get('stage')) as MediaStage,
                plannedPublishDate: String(form.get('date')) || undefined,
                notes: String(form.get('notes')).trim() || undefined,
                draftUrl: String(form.get('draftUrl')).trim() || undefined,
              });
              event.currentTarget.closest('details')?.removeAttribute('open');
            }}>
              <Field label="标题"><input aria-label={`编辑内容标题：${item.title}`} defaultValue={item.title} name="title" required /></Field>
              <Field label="平台"><input defaultValue={item.platform ?? ''} name="platform" /></Field>
              <Field label="形式"><input defaultValue={item.format ?? ''} name="format" /></Field>
              <Field label="阶段"><select defaultValue={item.stage} name="stage">{MEDIA_STAGES.map((value) => <option key={value} value={value}>{stageLabels[value]}</option>)}</select></Field>
              <Field label="发布日期"><input defaultValue={item.plannedPublishDate ?? ''} name="date" type="date" /></Field>
              <Field label="草稿链接"><input defaultValue={item.draftUrl ?? ''} name="draftUrl" type="url" /></Field>
              <Field label="备注"><input defaultValue={item.notes ?? ''} name="notes" /></Field>
              <button className="button button-primary" type="submit">保存修改</button>
            </form>
          </details>
        </div>
      </div>
      <button aria-label={`删除内容：${item.title}`} className="icon-button danger-button" onClick={() => onDelete(item)} type="button">×</button>
    </article>
  );
}
