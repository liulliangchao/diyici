import { useState } from 'react';
import { useDataFile } from '../../app/DataContext';
import { DATA_SCHEMA_VERSION, type AppData } from '../../domain/model';
import { readBackupFile, saveBackupFile } from '../../storage/backup';
import type { LocalFilePicker, PermissionedDataFileHandle } from '../../storage/fileConnection';
import { formatDate, SectionPanel } from '../../shared/ModuleUi';

interface RestoreCandidate {
  fileName: string;
  data: AppData;
}

type DataCollection = Exclude<keyof AppData, 'schemaVersion' | 'createdAt' | 'updatedAt'>;
const collectionLabels: Array<[DataCollection, string]> = [
  ['planItems', '今日计划'], ['quickMemos', '快速备忘'], ['mediaItems', '自媒体内容'],
  ['developmentProjects', '开发项目'], ['developmentTasks', '开发事项'], ['clients', '客户'],
  ['consultations', '咨询记录'], ['workouts', '训练记录'], ['meals', '饮食记录'],
  ['games', '游戏'], ['playSessions', '游玩记录'],
];

function collectionCounts(data: AppData): Array<[string, number]> {
  return collectionLabels.map(([key, label]) => [label, data[key].length]);
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function isCancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export default function SettingsPage() {
  const { data, status, fileName, fileHandle, error: fileError, connectExistingFile, connectNewFile, replaceData } = useDataFile();
  const [message, setMessage] = useState('');
  const [operationError, setOperationError] = useState('');
  const [restoreCandidate, setRestoreCandidate] = useState<RestoreCandidate | null>(null);
  const [busy, setBusy] = useState(false);

  if (!data) return <div className="stage-card"><div><strong>还没有连接数据文件</strong><p>先创建或打开一个主数据文件，然后即可在这里管理备份与恢复。</p></div></div>;
  const connectedData = data;
  const picker = window as LocalFilePicker;

  async function createBackup() {
    setBusy(true); setOperationError(''); setMessage('');
    try {
      const handle = await saveBackupFile(connectedData, picker, fileHandle);
      setMessage(`独立备份已保存：${handle.name}`);
    } catch (caught) {
      if (isCancelled(caught)) setMessage('已取消备份。');
      else setOperationError(caught instanceof Error ? caught.message : '备份失败，请重试。');
    } finally { setBusy(false); }
  }

  async function chooseRestore() {
    setBusy(true); setOperationError(''); setMessage('');
    try {
      const result = await readBackupFile(picker, fileHandle);
      setRestoreCandidate({ fileName: result.handle.name, data: result.data });
    } catch (caught) {
      if (isCancelled(caught)) setMessage('已取消选择备份。');
      else setOperationError(caught instanceof Error ? caught.message : '无法读取所选备份。');
    } finally { setBusy(false); }
  }

  async function confirmRestore() {
    if (!restoreCandidate || !fileHandle) return;
    setBusy(true); setOperationError(''); setMessage('');
    let safetyCopy: PermissionedDataFileHandle | null = null;
    try {
      safetyCopy = await saveBackupFile(connectedData, picker, fileHandle, 'safety');
      await replaceData(restoreCandidate.data);
      setMessage(`恢复完成。恢复前的数据已另存为：${safetyCopy.name}`);
      setRestoreCandidate(null);
    } catch (caught) {
      if (isCancelled(caught)) setMessage('已取消恢复，当前数据未更改。');
      else if (safetyCopy) setOperationError(`恢复失败。恢复前的数据安全备份已保存为“${safetyCopy.name}”，当前数据保持不变。原因：${caught instanceof Error ? caught.message : '未知错误'}`);
      else setOperationError(`未能创建恢复前安全备份，当前数据未更改。原因：${caught instanceof Error ? caught.message : '未知错误'}`);
    } finally { setBusy(false); }
  }

  function switchToNewFile() {
    if (!window.confirm('将创建一份新的空数据文件并切换到它。当前文件会保留在原位置，是否继续？')) return;
    setMessage('请在文件对话框中选择新数据文件的位置。');
    setOperationError('');
    void connectNewFile();
  }

  function switchToExistingFile() {
    setMessage('请在文件对话框中选择要连接的数据文件。');
    setOperationError('');
    void connectExistingFile();
  }

  const counts = collectionCounts(connectedData);
  const totalRecords = counts.reduce((sum, [, count]) => sum + count, 0);

  return (
    <div className="module-page settings-page">
      <SectionPanel title="主数据文件" detail="你的记录持续保存在电脑上的独立 JSON 文档中。">
        <div className="settings-file-card">
          <div className="settings-file-mark" aria-hidden="true">▤</div>
          <div className="settings-file-main"><strong>{fileName ?? '未连接'}</strong><span>格式版本 {connectedData.schemaVersion} · 最近更新 {formatTimestamp(connectedData.updatedAt)}</span><span>当前状态：{status === 'saved' ? '已保存' : status === 'saving' ? '正在保存' : status === 'error' ? '保存失败' : '已连接'}</span></div>
          <span className={`settings-status-dot settings-status-${status}`} aria-hidden="true" />
        </div>
        {fileError && <div role="alert" className="inline-error settings-context-error">{fileError}</div>}
        <div className="settings-actions"><button className="button button-secondary" disabled={busy} onClick={switchToExistingFile} type="button">切换到已有数据文件</button><button className="button button-secondary" disabled={busy} onClick={switchToNewFile} type="button">创建新的主数据文件</button></div>
      </SectionPanel>

      <SectionPanel title="备份与恢复" detail="备份是完整且独立的文件，可复制到电脑上的其他位置保存。">
        <div className="settings-backup-grid">
          <article className="settings-action-card"><span className="settings-action-icon" aria-hidden="true">↗</span><div><strong>制作独立备份</strong><p>包含所有模块记录和格式版本信息，不会移动或更改当前主数据文件。</p></div><button className="button button-primary" disabled={busy || status === 'saving'} onClick={() => void createBackup()} type="button">保存备份文件</button></article>
          <article className="settings-action-card"><span className="settings-action-icon restore-icon" aria-hidden="true">↙</span><div><strong>从备份恢复</strong><p>先检查备份并展示其中的记录数量。确认后会先保存当前数据的安全副本。</p></div><button className="button button-secondary" disabled={busy || status === 'saving'} onClick={() => void chooseRestore()} type="button">选择备份文件</button></article>
        </div>
        <div aria-live="polite" className="settings-feedback">{message && <p className="settings-success">{message}</p>}{operationError && <p className="inline-error" role="alert">{operationError}</p>}</div>
      </SectionPanel>

      <SectionPanel title="当前数据概况" detail={`共 ${totalRecords} 条记录 · 创建于 ${formatDate(connectedData.createdAt.slice(0, 10))}`}>
        <div className="settings-count-grid">{counts.map(([label, count]) => <div className="settings-count" key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
        <p className="settings-local-note"><span className="privacy-dot" />数据文件与备份仅保存在你选择的本机位置，不会上传。</p>
      </SectionPanel>

      {restoreCandidate && <div className="dialog-backdrop" role="presentation"><section aria-labelledby="restore-title" aria-modal="true" className="restore-dialog" role="dialog">
        <p className="eyebrow">恢复预览</p><h2 id="restore-title">确认从备份恢复？</h2><p className="restore-source">备份文件：<strong>{restoreCandidate.fileName}</strong></p>
        <p className="restore-warning">确认后，当前主数据文件会被备份中的内容替换。替换前将让你选择位置，保存一份当前数据的安全备份。</p>
        <div className="restore-metadata"><span>备份格式版本</span><strong>{restoreCandidate.data.schemaVersion === DATA_SCHEMA_VERSION ? '兼容' : '不兼容'}</strong><span>备份最近更新</span><strong>{formatTimestamp(restoreCandidate.data.updatedAt)}</strong></div>
        <div className="restore-count-grid">{collectionCounts(restoreCandidate.data).map(([label, count]) => <div className="settings-count" key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
        <div className="restore-dialog-actions"><button className="button button-secondary" disabled={busy} onClick={() => setRestoreCandidate(null)} type="button">取消</button><button className="button button-primary" disabled={busy} onClick={() => void confirmRestore()} type="button">{busy ? '正在恢复…' : '先保存安全备份，再恢复'}</button></div>
      </section></div>}
    </div>
  );
}
