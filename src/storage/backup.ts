import { readDataFile, writeDataFile, type LocalDataFileHandle } from './fileData.ts';
import type { AppData } from '../domain/model.ts';
import type { LocalFilePicker, PermissionedDataFileHandle } from './fileConnection.ts';

const JSON_FILE_TYPES = [{ description: '工作生活数据备份', accept: { 'application/json': ['.json'] } }];

function timestampSuffix(now: Date): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  const hour = `${now.getHours()}`.padStart(2, '0');
  const minute = `${now.getMinutes()}`.padStart(2, '0');
  const second = `${now.getSeconds()}`.padStart(2, '0');
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

export function backupSuggestedName(kind: 'regular' | 'safety' = 'regular', now = new Date()): string {
  const prefix = kind === 'safety' ? '恢复前安全备份' : '工作生活备份';
  return `${prefix}-${timestampSuffix(now)}.json`;
}

async function isSameFile(left: LocalDataFileHandle, right: LocalDataFileHandle): Promise<boolean> {
  if (left === right) return true;
  const comparable = left as LocalDataFileHandle & { isSameEntry?(other: LocalDataFileHandle): Promise<boolean> };
  return comparable.isSameEntry ? comparable.isSameEntry(right) : false;
}

function requireSavePicker(picker: LocalFilePicker) {
  if (!picker.showSaveFilePicker) throw new Error('当前浏览器无法选择本地备份保存位置，请使用最新版 Edge 或 Chrome。');
  return picker.showSaveFilePicker.bind(picker);
}

function requireOpenPicker(picker: LocalFilePicker) {
  if (!picker.showOpenFilePicker) throw new Error('当前浏览器无法选择本地备份文件，请使用最新版 Edge 或 Chrome。');
  return picker.showOpenFilePicker.bind(picker);
}

export async function saveBackupFile(
  data: AppData,
  picker: LocalFilePicker = window as LocalFilePicker,
  currentFile?: PermissionedDataFileHandle | null,
  kind: 'regular' | 'safety' = 'regular',
): Promise<PermissionedDataFileHandle> {
  const handle = await requireSavePicker(picker)({
    suggestedName: backupSuggestedName(kind),
    types: JSON_FILE_TYPES,
    excludeAcceptAllOption: true,
  });
  if (currentFile && await isSameFile(handle, currentFile)) {
    throw new Error('备份文件必须与当前数据文件分开保存。');
  }
  await writeDataFile(handle, data);
  return handle;
}

export async function readBackupFile(
  picker: LocalFilePicker = window as LocalFilePicker,
  currentFile?: PermissionedDataFileHandle | null,
): Promise<{ handle: PermissionedDataFileHandle; data: AppData }> {
  const [handle] = await requireOpenPicker(picker)({
    types: JSON_FILE_TYPES,
    excludeAcceptAllOption: true,
    multiple: false,
    mode: 'read',
  });
  if (!handle) throw new Error('未选择备份文件。');
  if (currentFile && await isSameFile(handle, currentFile)) {
    throw new Error('请选择独立备份文件，不能把当前主数据文件作为恢复来源。');
  }
  return { handle, data: await readDataFile(handle) };
}
