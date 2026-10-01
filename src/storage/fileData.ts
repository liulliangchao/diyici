import { parseAppData, serializeAppData } from './dataCodec.ts';
import type { AppData } from '../domain/model.ts';

export interface WritableFileLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
  abort?(): Promise<void>;
}

export interface LocalDataFileHandle {
  readonly name: string;
  getFile(): Promise<{ text(): Promise<string> }>;
  createWritable(): Promise<WritableFileLike>;
}

const writeQueues = new WeakMap<LocalDataFileHandle, Promise<void>>();

async function writeSerializedDataFile(handle: LocalDataFileHandle, serialized: string): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(serialized);
    await writable.close();
  } catch (error) {
    try { await writable.abort?.(); } catch { /* Preserve the original write error. */ }
    throw error;
  }
}

export async function readDataFile(handle: LocalDataFileHandle): Promise<AppData> {
  const file = await handle.getFile();
  return parseAppData(await file.text());
}

export async function writeDataFile(handle: LocalDataFileHandle, data: AppData): Promise<void> {
  const serialized = serializeAppData(data);
  await writeSerializedDataFile(handle, serialized);
}

export function enqueueDataFileWrite(handle: LocalDataFileHandle, data: AppData): Promise<void> {
  const serialized = serializeAppData(data);
  const previous = writeQueues.get(handle) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => writeSerializedDataFile(handle, serialized));
  writeQueues.set(handle, next);
  void next.then(
    () => { if (writeQueues.get(handle) === next) writeQueues.delete(handle); },
    () => { if (writeQueues.get(handle) === next) writeQueues.delete(handle); },
  );
  return next;
}
