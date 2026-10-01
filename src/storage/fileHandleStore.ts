import type { LocalDataFileHandle } from './fileData.ts';

const STORE_NAME = 'file-handles';
const HANDLE_KEY = 'primary-data-file';
const DEFAULT_DATABASE_NAME = 'personal-work-life-app';

function openDatabase(factory: IDBFactory, databaseName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地文件句柄存储。'));
    request.onblocked = () => reject(new Error('本地文件句柄存储被其他页面占用。'));
  });
}

function getFactory(factory?: IDBFactory): IDBFactory {
  const resolved = factory ?? globalThis.indexedDB;
  if (!resolved) throw new Error('当前浏览器不支持本地文件句柄记忆。');
  return resolved;
}

async function withHandleStore<T>(
  operation: IDBRequest<T> | ((store: IDBObjectStore) => IDBRequest<T>),
  mode: IDBTransactionMode,
  factory: IDBFactory | undefined,
  databaseName: string,
): Promise<T> {
  const database = await openDatabase(getFactory(factory), databaseName);
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = typeof operation === 'function' ? operation(transaction.objectStore(STORE_NAME)) : operation;
      let result: T;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new Error('本地文件句柄存储失败。'));
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error('本地文件句柄事务失败。'));
      transaction.onabort = () => reject(transaction.error ?? new Error('本地文件句柄事务已取消。'));
    });
  } finally {
    database.close();
  }
}

export function rememberFileHandle(
  handle: LocalDataFileHandle,
  factory?: IDBFactory,
  databaseName = DEFAULT_DATABASE_NAME,
): Promise<unknown> {
  return withHandleStore((store) => store.put(handle, HANDLE_KEY), 'readwrite', factory, databaseName);
}

export async function recallFileHandle<T extends LocalDataFileHandle = LocalDataFileHandle>(
  factory?: IDBFactory,
  databaseName = DEFAULT_DATABASE_NAME,
): Promise<T | null> {
  const handle = await withHandleStore((store) => store.get(HANDLE_KEY), 'readonly', factory, databaseName);
  return (handle as T | undefined) ?? null;
}

export async function forgetFileHandle(
  factory?: IDBFactory,
  databaseName = DEFAULT_DATABASE_NAME,
): Promise<void> {
  await withHandleStore((store) => store.delete(HANDLE_KEY), 'readwrite', factory, databaseName);
}
