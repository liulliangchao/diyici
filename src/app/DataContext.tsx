import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppData } from '../domain/model.ts';
import { enqueueDataFileWrite } from '../storage/fileData.ts';
import {
  connectExistingDataFile,
  connectNewDataFile,
  inspectRememberedDataFile,
  isLocalFilePickerAvailable,
  reconnectRememberedDataFile,
  type LocalFilePicker,
  type PermissionedDataFileHandle,
} from '../storage/fileConnection.ts';

export type DataFileStatus = 'loading' | 'unsupported' | 'disconnected' | 'permission-required' | 'connecting' | 'saved' | 'saving' | 'error';

export interface DataContextValue {
  status: DataFileStatus;
  fileName: string | null;
  fileHandle: PermissionedDataFileHandle | null;
  data: AppData | null;
  error: string | null;
  connectNewFile(): Promise<void>;
  connectExistingFile(): Promise<void>;
  reconnectFile(): Promise<void>;
  retrySave(): Promise<void>;
  updateData(updater: (current: AppData) => AppData): void;
  replaceData(replacement: AppData): Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

interface StateSnapshot {
  status: DataFileStatus;
  handle: PermissionedDataFileHandle | null;
  fileName: string | null;
  data: AppData | null;
  error: string | null;
}

const initialState: StateSnapshot = {
  status: 'loading', handle: null, fileName: null, data: null, error: null,
};

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : '本地数据文件发生未知错误。';
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<StateSnapshot>(initialState);
  const snapshotRef = useRef(snapshot);
  const writeRevision = useRef(0);

  const patchSnapshot = useCallback((patch: Partial<StateSnapshot>) => {
    const next = { ...snapshotRef.current, ...patch };
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const attach = useCallback((handle: PermissionedDataFileHandle, data: AppData) => {
    writeRevision.current += 1;
    patchSnapshot({ status: 'saved', handle, fileName: handle.name, data, error: null });
  }, [patchSnapshot]);

  useEffect(() => {
    let active = true;
    if (!isLocalFilePickerAvailable()) {
      patchSnapshot({ status: 'unsupported', error: '请使用最新版 Microsoft Edge 或 Google Chrome。' });
      return () => { active = false; };
    }

    void inspectRememberedDataFile().then((result) => {
      if (!active) return;
      if (result.status === 'missing') {
        patchSnapshot({ status: 'disconnected', error: null });
      } else if (result.status === 'permission-required') {
        patchSnapshot({ status: 'permission-required', handle: result.handle, fileName: result.handle.name, error: null });
      } else {
        attach(result.handle, result.data);
      }
    }).catch((error: unknown) => {
      if (active) patchSnapshot({ status: 'error', error: messageFrom(error) });
    });

    return () => { active = false; };
  }, [attach, patchSnapshot]);

  const runConnection = useCallback(async (operation: () => Promise<{ handle: PermissionedDataFileHandle; data: AppData }>) => {
    patchSnapshot({ status: 'connecting', error: null });
    try {
      const result = await operation();
      attach(result.handle, result.data);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        patchSnapshot({ status: snapshotRef.current.handle ? 'saved' : 'disconnected', error: null });
        return;
      }
      patchSnapshot({ status: 'error', error: messageFrom(error) });
    }
  }, [attach, patchSnapshot]);

  const connectNewFile = useCallback(() => runConnection(() => connectNewDataFile(window as LocalFilePicker)), [runConnection]);
  const connectExistingFile = useCallback(() => runConnection(() => connectExistingDataFile(window as LocalFilePicker)), [runConnection]);

  const reconnectFile = useCallback(() => {
    const handle = snapshotRef.current.handle;
    if (!handle) return Promise.resolve();
    return runConnection(() => reconnectRememberedDataFile(handle));
  }, [runConnection]);

  const retrySave = useCallback(async () => {
    const { handle, data } = snapshotRef.current;
    if (!handle || !data) return;
    const revision = ++writeRevision.current;
    patchSnapshot({ status: 'saving', error: null });
    try {
      await enqueueDataFileWrite(handle, data);
      if (revision === writeRevision.current) patchSnapshot({ status: 'saved' });
    } catch (error) {
      if (revision === writeRevision.current) patchSnapshot({ status: 'error', error: messageFrom(error) });
    }
  }, [patchSnapshot]);

  const updateData = useCallback((updater: (current: AppData) => AppData) => {
    const { handle, data } = snapshotRef.current;
    if (!handle || !data) throw new Error('请先连接本地数据文件，再添加或修改记录。');

    const nextData = { ...updater(data), updatedAt: new Date().toISOString() };
    const revision = ++writeRevision.current;
    patchSnapshot({ data: nextData, status: 'saving', error: null });

    void enqueueDataFileWrite(handle, nextData).then(() => {
      if (revision === writeRevision.current) patchSnapshot({ status: 'saved' });
    }).catch((error: unknown) => {
      if (revision === writeRevision.current) patchSnapshot({ status: 'error', error: messageFrom(error) });
    });
  }, [patchSnapshot]);

  const replaceData = useCallback(async (replacement: AppData) => {
    const { handle, data } = snapshotRef.current;
    if (!handle || !data) throw new Error('请先连接本地数据文件，再恢复备份。');

    const nextData = { ...replacement, updatedAt: new Date().toISOString() };
    const revision = ++writeRevision.current;
    patchSnapshot({ status: 'saving', error: null });
    try {
      await enqueueDataFileWrite(handle, nextData);
      if (revision === writeRevision.current) patchSnapshot({ data: nextData, status: 'saved' });
    } catch (error) {
      if (revision === writeRevision.current) patchSnapshot({ data, status: 'error', error: messageFrom(error) });
      throw error;
    }
  }, [patchSnapshot]);

  const value: DataContextValue = {
    status: snapshot.status,
    fileName: snapshot.fileName,
    fileHandle: snapshot.handle,
    data: snapshot.data,
    error: snapshot.error,
    connectNewFile,
    connectExistingFile,
    reconnectFile,
    retrySave,
    updateData,
    replaceData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useDataFile(): DataContextValue {
  const context = useContext(DataContext);
  if (!context) throw new Error('useDataFile 必须在 DataProvider 内使用。');
  return context;
}
