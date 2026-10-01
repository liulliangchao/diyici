import { useDataFile } from './DataContext';

export function FileConnectionPanel() {
  const { status, fileName, error, connectNewFile, connectExistingFile, reconnectFile, retrySave } = useDataFile();
  const busy = status === 'connecting' || status === 'loading';

  let heading = '先连接你的数据文件';
  let description = '数据会保存在电脑上的独立文件中。你可以创建新文件，或打开已有文件继续使用。';
  if (status === 'loading') {
    heading = '正在检查本地数据文件';
    description = '正在查找上次使用的文件及其访问权限。';
  } else if (status === 'permission-required') {
    heading = '需要重新授权数据文件';
    description = `浏览器需要你的许可，才能继续读写“${fileName ?? '数据文件'}”。`;
  } else if (status === 'unsupported') {
    heading = '当前浏览器不支持直接保存文件';
    description = '请使用最新版 Microsoft Edge 或 Google Chrome，以便把数据持续写入电脑上的文件。';
  } else if (status === 'error') {
    heading = '数据文件暂时无法使用';
    description = error ?? '请检查文件和授权状态后重试。';
  }

  if (status === 'saved' || status === 'saving') return null;

  return (
    <section aria-labelledby="file-gate-title" className="file-gate">
      <div className="file-gate-mark" aria-hidden="true">▤</div>
      <p className="eyebrow">本地数据</p>
      <h2 id="file-gate-title">{heading}</h2>
      <p className="file-gate-description">{description}</p>
      {status === 'error' && error && <div role="alert" className="inline-error">{error}</div>}
      <div className="file-gate-actions">
        {status === 'permission-required' && (
          <button className="button button-primary" disabled={busy} onClick={() => void reconnectFile()} type="button">重新授权</button>
        )}
        {status !== 'unsupported' && status !== 'loading' && (
          <>
            <button className="button button-primary" disabled={busy} onClick={() => void connectNewFile()} type="button">创建新数据文件</button>
            <button className="button button-secondary" disabled={busy} onClick={() => void connectExistingFile()} type="button">打开已有文件</button>
          </>
        )}
        {status === 'error' && fileName && (
          <button className="button button-secondary" disabled={busy} onClick={() => void retrySave()} type="button">重试保存</button>
        )}
      </div>
      <div className="file-gate-footnote"><span className="privacy-dot" />文件只保存在这台电脑，不会上传</div>
    </section>
  );
}
