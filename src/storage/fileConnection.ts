import { createEmptyData } from './dataCodec.ts';
import { readDataFile, writeDataFile, type LocalDataFileHandle } from './fileData.ts';
import { recallFileHandle, rememberFileHandle } from './fileHandleStore.ts';
import type { AppData } from '../domain/model.ts';

export interface PermissionedDataFileHandle extends LocalDataFileHandle {
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
}

export interface LocalFilePickerOptions {
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
  suggestedName?: string;
  excludeAcceptAllOption?: boolean;
  multiple?: boolean;
  mode?: 'read' | 'readwrite';
}

export interface LocalFilePicker {
  showSaveFilePicker?(options?: LocalFilePickerOptions): Promise<PermissionedDataFileHandle>;
  showOpenFilePicker?(options?: LocalFilePickerOptions): Promise<PermissionedDataFileHandle[]>;
}

export interface FileConnectionOptions {
  factory?: IDBFactory;
  databaseName?: string;
  handleStore?: {
    remember(handle: PermissionedDataFileHandle): Promise<unknown>;
    recall(): Promise<PermissionedDataFileHandle | null>;
  };
}

export type RememberedFileState =
  | { status: 'missing' }
  | { status: 'permission-required'; handle: PermissionedDataFileHandle }
  | { status: 'connected'; handle: PermissionedDataFileHandle; data: AppData };

const JSON_FILE_TYPES = [{ description: '工作生活数据文件', accept: { 'application/json': ['.json'] } }];
const READ_WRITE_MODE = { mode: 'readwrite' as const };

function rememberHandle(handle: PermissionedDataFileHandle, options: FileConnectionOptions) {
  return options.handleStore?.remember(handle)
    ?? rememberFileHandle(handle, options.factory, options.databaseName);
}

function requirePickerMethod<T extends keyof LocalFilePicker>(picker: LocalFilePicker, method: T, message: string) {
  const callback = picker[method];
  if (typeof callback !== 'function') throw new Error(message);
  return callback.bind(picker) as NonNullable<LocalFilePicker[T]>;
}

async function verifyWritePermission(handle: PermissionedDataFileHandle, allowPrompt: boolean): Promise<void> {
  const state = await handle.queryPermission?.(READ_WRITE_MODE);
  if (state === 'granted') return;
  if (!allowPrompt || !handle.requestPermission) throw new Error('需要重新授权数据文件。');
  const requested = await handle.requestPermission(READ_WRITE_MODE);
  if (requested !== 'granted') throw new Error('没有获得数据文件的读写权限。');
}

export function isLocalFilePickerAvailable(picker: LocalFilePicker = window as LocalFilePicker): boolean {
  return typeof picker.showOpenFilePicker === 'function' && typeof picker.showSaveFilePicker === 'function';
}

export async function connectNewDataFile(
  picker: LocalFilePicker,
  options: FileConnectionOptions = {},
): Promise<{ handle: PermissionedDataFileHandle; data: AppData }> {
  const saveFile = requirePickerMethod(picker, 'showSaveFilePicker', '当前浏览器不支持直接保存本地文件，请使用最新版 Edge 或 Chrome。');
  const handle = await saveFile({
    suggestedName: '个人工作生活数据.json',
    types: JSON_FILE_TYPES,
    excludeAcceptAllOption: true,
  });
  const data = createEmptyData();
  await writeDataFile(handle, data);
  await rememberHandle(handle, options);
  return { handle, data };
}

export async function connectExistingDataFile(
  picker: LocalFilePicker,
  options: FileConnectionOptions = {},
): Promise<{ handle: PermissionedDataFileHandle; data: AppData }> {
  const openFile = requirePickerMethod(picker, 'showOpenFilePicker', '当前浏览器不支持直接打开本地文件，请使用最新版 Edge 或 Chrome。');
  const [handle] = await openFile({ types: JSON_FILE_TYPES, excludeAcceptAllOption: true, multiple: false, mode: 'readwrite' });
  if (!handle) throw new Error('未选择数据文件。');
  await verifyWritePermission(handle, true);
  const data = await readDataFile(handle);
  await rememberHandle(handle, options);
  return { handle, data };
}

export async function inspectRememberedDataFile(options: FileConnectionOptions = {}): Promise<RememberedFileState> {
  const handle = options.handleStore
    ? await options.handleStore.recall()
    : await recallFileHandle<PermissionedDataFileHandle>(options.factory, options.databaseName);
  if (!handle) return { status: 'missing' };
  if (await handle.queryPermission?.(READ_WRITE_MODE) !== 'granted') return { status: 'permission-required', handle };
  return { status: 'connected', handle, data: await readDataFile(handle) };
}

export async function reconnectRememberedDataFile(
  handle: PermissionedDataFileHandle,
): Promise<{ handle: PermissionedDataFileHandle; data: AppData }> {
  await verifyWritePermission(handle, true);
  return { handle, data: await readDataFile(handle) };
}
