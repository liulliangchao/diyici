import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useDataFile } from '../../app/DataContext';
import { syncLinkedPlanItems } from '../../domain/agenda';
import type { Client, Consultation } from '../../domain/model';
import { EmptyState, Field, formatDate, localDateValue, newRecordBase, SectionPanel } from '../../shared/ModuleUi';

export default function ConsultingPage() {
  const { data, updateData } = useDataFile();
  const [clientName, setClientName] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [date, setDate] = useState(localDateValue());
  const [topic, setTopic] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [notes, setNotes] = useState('');

  const clients = data?.clients ?? [];
  useEffect(() => {
    if (!selectedClientId && clients[0]) setSelectedClientId(clients[0].id);
    if (selectedClientId && !clients.some((client) => client.id === selectedClientId)) setSelectedClientId(clients[0]?.id ?? '');
  }, [clients, selectedClientId]);

  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;
  const consultations = useMemo(() => (data?.consultations ?? [])
    .filter((entry) => entry.clientId === selectedClientId)
    .sort((a, b) => b.date.localeCompare(a.date)), [data?.consultations, selectedClientId]);

  function addClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !clientName.trim()) return;
    const client: Client = { ...newRecordBase(), displayName: clientName.trim() };
    updateData((current) => ({ ...current, clients: [...current.clients, client] }));
    setClientName('');
    setSelectedClientId(client.id);
  }

  function updateClient(id: string, patch: Partial<Client>) {
    updateData((current) => ({ ...current, clients: current.clients.map((client) => client.id === id ? { ...client, ...patch, updatedAt: new Date().toISOString() } : client) }));
  }

  function deleteClient(client: Client) {
    const childIds = data?.consultations.filter((entry) => entry.clientId === client.id).map((entry) => entry.id) ?? [];
    if (!window.confirm(`删除客户“${client.displayName}”及其 ${childIds.length} 条咨询记录？`)) return;
    updateData((current) => ({
      ...current,
      clients: current.clients.filter((row) => row.id !== client.id),
      consultations: current.consultations.filter((row) => row.clientId !== client.id),
      planItems: current.planItems.filter((row) => !(row.linkedRecord?.type === 'consultation-follow-up' && childIds.includes(row.linkedRecord.id))),
    }));
  }

  function addConsultation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !selectedClientId || !topic.trim()) return;
    const entry: Consultation = {
      ...newRecordBase(), clientId: selectedClientId, date, topic: topic.trim(),
      ...(followUpDate ? { followUpDate } : {}),
      followUpStatus: followUpDate ? 'pending' : 'done',
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    updateData((current) => ({ ...current, consultations: [...current.consultations, entry] }));
    setTopic(''); setFollowUpDate(''); setNotes('');
  }

  function updateConsultation(id: string, patch: Partial<Consultation>) {
    updateData((current) => {
      const consultations = current.consultations.map((entry) => entry.id === id ? { ...entry, ...patch, updatedAt: new Date().toISOString() } : entry);
      const updated = consultations.find((entry) => entry.id === id)!;
      const clientName = current.clients.find((client) => client.id === updated.clientId)?.displayName ?? '客户';
      return syncLinkedPlanItems({ ...current, consultations }, { type: 'consultation-follow-up', id }, { title: `${clientName} · ${updated.topic}`, date: updated.followUpDate, completed: updated.followUpStatus === 'done' });
    });
  }

  function deleteConsultation(entry: Consultation) {
    if (!window.confirm(`删除咨询记录“${entry.topic}”？`)) return;
    updateData((current) => ({
      ...current,
      consultations: current.consultations.filter((row) => row.id !== entry.id),
      planItems: current.planItems.filter((row) => !(row.linkedRecord?.type === 'consultation-follow-up' && row.linkedRecord.id === entry.id)),
    }));
  }

  const pendingCount = data?.consultations.filter((entry) => entry.followUpDate && entry.followUpStatus === 'pending').length ?? 0;

  return (
    <div className="module-page consulting-layout">
      <div className="consulting-main-column">
        <SectionPanel title="客户档案" detail={`${clients.length} 位客户 · ${pendingCount} 项待跟进`} className="form-panel">
          <form className="client-create-form" onSubmit={addClient}>
            <Field label="客户名称 / 称呼"><input aria-label="新客户名称" onChange={(event) => setClientName(event.target.value)} placeholder="例如：林先生" required value={clientName} /></Field>
            <button className="button button-primary" type="submit">添加客户</button>
          </form>
          {clients.length === 0 ? <EmptyState title="还没有客户档案" detail="添加客户后，可以持续记录咨询和跟进情况。" /> : (
            <div className="client-list">{clients.map((client) => (
              <article className={`client-card${selectedClientId === client.id ? ' is-selected' : ''}`} key={client.id}>
                <button aria-pressed={selectedClientId === client.id} className="client-select" onClick={() => setSelectedClientId(client.id)} type="button"><span className="client-avatar">{client.displayName.slice(0, 1)}</span><span><strong>{client.displayName}</strong><small>{data?.consultations.filter((entry) => entry.clientId === client.id).length ?? 0} 条咨询记录</small></span></button>
                <details className="record-edit" key={client.updatedAt}><summary>编辑</summary><form className="record-edit-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); updateClient(client.id, { displayName: String(form.get('name')).trim(), notes: String(form.get('notes')).trim() || undefined }); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Field label="客户称呼"><input defaultValue={client.displayName} name="name" required /></Field><Field label="客户备注"><input defaultValue={client.notes ?? ''} name="notes" /></Field><button className="button button-primary" type="submit">保存</button></form></details>
                <button aria-label={`删除客户：${client.displayName}`} className="icon-button danger-button" onClick={() => deleteClient(client)} type="button">×</button>
              </article>
            ))}</div>
          )}
        </SectionPanel>

        <SectionPanel title={selectedClient ? `${selectedClient.displayName} · 咨询记录` : '咨询记录'} detail="按沟通主题记录咨询内容，并为需要继续跟进的事项设置日期。" className="form-panel">
          {!selectedClient ? <EmptyState title="先选择或添加客户" detail="咨询记录会归属到对应的客户档案。" /> : <>
            <form className="consultation-create-form" onSubmit={addConsultation}>
              <Field label="咨询日期"><input aria-label="咨询日期" onChange={(event) => setDate(event.target.value)} type="date" value={date} /></Field>
              <Field label="咨询主题"><input aria-label="咨询主题" onChange={(event) => setTopic(event.target.value)} placeholder="例如：产品定位讨论" required value={topic} /></Field>
              <Field label="下次跟进"><input aria-label="下次跟进日期" onChange={(event) => setFollowUpDate(event.target.value)} type="date" value={followUpDate} /></Field>
              <Field className="consultation-notes" label="沟通摘要"><textarea aria-label="沟通摘要" onChange={(event) => setNotes(event.target.value)} placeholder="记录关键结论和后续事项" value={notes} /></Field>
              <button className="button button-primary" type="submit">保存咨询记录</button>
            </form>
            {consultations.length === 0 ? <EmptyState title="还没有咨询记录" detail="记录一次沟通，后续跟进会显示在这里。" /> : (
              <div className="domain-record-list">{consultations.map((entry) => <ConsultationRow item={entry} key={entry.id} onDelete={deleteConsultation} onUpdate={updateConsultation} />)}</div>
            )}
          </>}
        </SectionPanel>
      </div>
      <aside className="followup-card" aria-label="待跟进摘要">
        <div className="followup-card-top"><span aria-hidden="true">↗</span><small>跟进总览</small></div>
        <strong>{pendingCount}</strong><p>项待跟进</p>
        <div className="followup-upcoming">{(data?.consultations ?? []).filter((entry) => entry.followUpDate && entry.followUpStatus === 'pending').sort((a, b) => a.followUpDate!.localeCompare(b.followUpDate!)).slice(0, 3).map((entry) => <div key={entry.id}><small>{formatDate(entry.followUpDate!)}</small><strong>{data?.clients.find((client) => client.id === entry.clientId)?.displayName ?? '客户'}</strong><span>{entry.topic}</span></div>)}</div>
      </aside>
    </div>
  );
}

function ConsultationRow({ item, onUpdate, onDelete }: {
  item: Consultation;
  onUpdate(id: string, patch: Partial<Consultation>): void;
  onDelete(item: Consultation): void;
}) {
  return (
    <article className="domain-record consultation-record">
      <div className="record-leading-icon consult-leading" aria-hidden="true">▧</div>
      <div className="domain-record-body">
        <div className="record-title-line"><strong>{item.topic}</strong><span className="record-date">{formatDate(item.date)}</span></div>
        {item.notes && <p className="consultation-notes-preview">{item.notes}</p>}
        {item.followUpDate && <div className={`followup-state${item.followUpStatus === 'done' ? ' followup-done' : ''}`}><span>{item.followUpStatus === 'done' ? '已完成跟进' : `待跟进 · ${formatDate(item.followUpDate)}`}</span>{item.followUpStatus === 'pending' && <button className="text-button" onClick={() => onUpdate(item.id, { followUpStatus: 'done' })} type="button">标记完成</button>}</div>}
        <details className="record-edit" key={item.updatedAt}><summary>编辑记录</summary><form className="record-edit-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const newFollowUpDate = String(form.get('followUpDate')); onUpdate(item.id, { topic: String(form.get('topic')).trim(), date: String(form.get('date')), followUpDate: newFollowUpDate || undefined, followUpStatus: newFollowUpDate ? String(form.get('followUpStatus')) as Consultation['followUpStatus'] : 'done', notes: String(form.get('notes')).trim() || undefined }); event.currentTarget.closest('details')?.removeAttribute('open'); }}><Field label="主题"><input aria-label={`编辑咨询主题：${item.topic}`} defaultValue={item.topic} name="topic" required /></Field><Field label="日期"><input defaultValue={item.date} name="date" type="date" /></Field><Field label="跟进日期"><input defaultValue={item.followUpDate ?? ''} name="followUpDate" type="date" /></Field><Field label="跟进状态"><select defaultValue={item.followUpStatus} name="followUpStatus"><option value="pending">待跟进</option><option value="done">已完成</option></select></Field><Field label="沟通摘要"><input defaultValue={item.notes ?? ''} name="notes" /></Field><button className="button button-primary" type="submit">保存修改</button></form></details>
      </div>
      <button aria-label={`删除咨询记录：${item.topic}`} className="icon-button danger-button" onClick={() => onDelete(item)} type="button">×</button>
    </article>
  );
}
