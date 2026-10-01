import {
  DATA_SCHEMA_VERSION,
  DEVELOPMENT_TASK_STATUSES,
  GAME_STATUSES,
  LINKED_RECORD_TYPES,
  MEDIA_STAGES,
  MEAL_TYPES,
  PROJECT_STATUSES,
  type AppData,
} from '../domain/model.ts';

export class DataFileError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DataFileError';
  }
}

const COLLECTION_NAMES = [
  'planItems', 'quickMemos', 'mediaItems', 'developmentProjects', 'developmentTasks',
  'clients', 'consultations', 'workouts', 'meals', 'games', 'playSessions',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, label: string, allowEmpty = false): asserts value is string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0)) {
    throw new DataFileError(`${label}必须是${allowEmpty ? '' : '非空'}文本。`);
  }
}

function requireDate(value: unknown, label: string): asserts value is string {
  requireText(value, label);
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new DataFileError(`${label}必须是有效的 YYYY-MM-DD 日期。`);
  }
}

function requireTimestamp(value: unknown, label: string): asserts value is string {
  requireText(value, label);
  if (!Number.isFinite(Date.parse(value))) throw new DataFileError(`${label}必须是有效的时间戳。`);
}

function requireOneOf<T extends string>(value: unknown, values: readonly T[], label: string): asserts value is T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new DataFileError(`${label}包含不支持的状态。`);
  }
}

function requireOptionalText(record: Record<string, unknown>, key: string, label: string) {
  if (record[key] !== undefined) requireText(record[key], label, true);
}

function requireBaseRecord(record: Record<string, unknown>, label: string) {
  requireText(record.id, `${label}.id`);
  requireTimestamp(record.createdAt, `${label}.createdAt`);
  requireTimestamp(record.updatedAt, `${label}.updatedAt`);
}

function requireArray(value: unknown, label: string): asserts value is unknown[] {
  if (!Array.isArray(value)) throw new DataFileError(`${label}必须是数组。`);
}

function requireFiniteOptionalNumber(value: unknown, label: string) {
  if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new DataFileError(`${label}必须是大于或等于零的数字。`);
  }
}

export function createEmptyData(now = new Date()): AppData {
  const timestamp = now.toISOString();
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    planItems: [],
    quickMemos: [],
    mediaItems: [],
    developmentProjects: [],
    developmentTasks: [],
    clients: [],
    consultations: [],
    workouts: [],
    meals: [],
    games: [],
    playSessions: [],
  };
}

export function assertAppData(value: unknown): asserts value is AppData {
  if (!isObject(value)) throw new DataFileError('数据文件根节点必须是 JSON 对象。');
  if (value.schemaVersion !== DATA_SCHEMA_VERSION) {
    throw new DataFileError(`数据文件版本 ${String(value.schemaVersion)} 不受支持。`);
  }
  requireTimestamp(value.createdAt, 'createdAt');
  requireTimestamp(value.updatedAt, 'updatedAt');
  for (const name of COLLECTION_NAMES) requireArray(value[name], name);

  const idsByCollection = new Map<string, Set<string>>();
  for (const name of COLLECTION_NAMES) {
    const rows = value[name] as unknown[];
    const ids = new Set<string>();
    for (const row of rows) {
      if (!isObject(row)) throw new DataFileError(`${name} 中的记录必须是对象。`);
      requireBaseRecord(row, name);
      const id = row.id as string;
      if (ids.has(id)) throw new DataFileError(`${name} 中存在重复记录 ID。`);
      ids.add(id);
    }
    idsByCollection.set(name, ids);
  }

  for (const row of value.planItems as Record<string, unknown>[]) {
    requireDate(row.date, 'planItems.date');
    requireText(row.title, 'planItems.title');
    if (row.plannedTime !== undefined && (typeof row.plannedTime !== 'string' || !/^\d{2}:\d{2}$/.test(row.plannedTime))) {
      throw new DataFileError('planItems.plannedTime 必须是 HH:MM 时间。');
    }
    requireOptionalText(row, 'category', 'planItems.category');
    requireOptionalText(row, 'notes', 'planItems.notes');
    if (typeof row.completed !== 'boolean') throw new DataFileError('planItems.completed 必须是布尔值。');
    requireFiniteOptionalNumber(row.sortOrder, 'planItems.sortOrder');
    if (row.sortOrder === undefined) throw new DataFileError('planItems.sortOrder 为必填数字。');
    if (row.linkedRecord !== undefined) {
      if (!isObject(row.linkedRecord)) throw new DataFileError('planItems.linkedRecord 必须是对象。');
      requireOneOf(row.linkedRecord.type, LINKED_RECORD_TYPES, 'planItems.linkedRecord.type');
      requireText(row.linkedRecord.id, 'planItems.linkedRecord.id');
    }
  }

  for (const row of value.quickMemos as Record<string, unknown>[]) requireText(row.content, 'quickMemos.content');

  for (const row of value.mediaItems as Record<string, unknown>[]) {
    requireText(row.title, 'mediaItems.title');
    requireOneOf(row.stage, MEDIA_STAGES, 'mediaItems.stage');
    for (const key of ['platform', 'format', 'notes', 'draftUrl']) requireOptionalText(row, key, `mediaItems.${key}`);
    if (row.plannedPublishDate !== undefined) requireDate(row.plannedPublishDate, 'mediaItems.plannedPublishDate');
    if (row.metricsSnapshots !== undefined) {
      requireArray(row.metricsSnapshots, 'mediaItems.metricsSnapshots');
      const snapshotIds = new Set<string>();
      const snapshotDates = new Set<string>();
      for (const snapshot of row.metricsSnapshots) {
        if (!isObject(snapshot)) throw new DataFileError('视频数据快照必须是对象。');
        requireBaseRecord(snapshot, 'mediaItems.metricsSnapshots');
        if (snapshotIds.has(snapshot.id as string)) throw new DataFileError('同一视频中存在重复数据快照 ID。');
        snapshotIds.add(snapshot.id as string);
        requireDate(snapshot.date, 'mediaItems.metricsSnapshots.date');
        if (snapshotDates.has(snapshot.date as string)) throw new DataFileError('同一视频同一天只能有一条数据快照。');
        snapshotDates.add(snapshot.date as string);
        for (const key of ['views', 'likes', 'comments', 'saves', 'shares']) {
          requireFiniteOptionalNumber(snapshot[key], `mediaItems.metricsSnapshots.${key}`);
          if (typeof snapshot[key] !== 'number' || !Number.isInteger(snapshot[key])) {
            throw new DataFileError(`mediaItems.metricsSnapshots.${key} 必须是非负整数。`);
          }
        }
      }
    }
  }

  for (const row of value.developmentProjects as Record<string, unknown>[]) {
    requireText(row.name, 'developmentProjects.name');
    requireOneOf(row.status, PROJECT_STATUSES, 'developmentProjects.status');
    requireOptionalText(row, 'notes', 'developmentProjects.notes');
  }

  const projectIds = idsByCollection.get('developmentProjects')!;
  for (const row of value.developmentTasks as Record<string, unknown>[]) {
    requireText(row.projectId, 'developmentTasks.projectId');
    if (!projectIds.has(row.projectId as string)) throw new DataFileError('开发事项关联的项目不存在。');
    requireText(row.title, 'developmentTasks.title');
    requireOneOf(row.status, DEVELOPMENT_TASK_STATUSES, 'developmentTasks.status');
    if (row.dueDate !== undefined) requireDate(row.dueDate, 'developmentTasks.dueDate');
    requireOptionalText(row, 'notes', 'developmentTasks.notes');
  }

  for (const row of value.clients as Record<string, unknown>[]) {
    requireText(row.displayName, 'clients.displayName');
    requireOptionalText(row, 'notes', 'clients.notes');
  }

  const clientIds = idsByCollection.get('clients')!;
  for (const row of value.consultations as Record<string, unknown>[]) {
    requireText(row.clientId, 'consultations.clientId');
    if (!clientIds.has(row.clientId as string)) throw new DataFileError('咨询记录关联的客户不存在。');
    requireDate(row.date, 'consultations.date');
    requireText(row.topic, 'consultations.topic');
    requireOptionalText(row, 'notes', 'consultations.notes');
    if (row.followUpDate !== undefined) requireDate(row.followUpDate, 'consultations.followUpDate');
    requireOneOf(row.followUpStatus, ['pending', 'done'], 'consultations.followUpStatus');
  }

  for (const row of value.workouts as Record<string, unknown>[]) {
    requireDate(row.date, 'workouts.date');
    requireText(row.name, 'workouts.name');
    if (!Array.isArray(row.exercises)) throw new DataFileError('workouts.exercises 必须是数组。');
    for (const exercise of row.exercises) {
      if (!isObject(exercise)) throw new DataFileError('训练动作必须是对象。');
      requireText(exercise.id, 'workouts.exercises.id');
      requireOptionalText(exercise, 'bodyPart', 'workouts.exercises.bodyPart');
      requireText(exercise.name, 'workouts.exercises.name');
      for (const key of ['sets', 'reps', 'weight']) requireFiniteOptionalNumber(exercise[key], `workouts.exercises.${key}`);
    }
    if (typeof row.completed !== 'boolean') throw new DataFileError('workouts.completed 必须是布尔值。');
    if (row.actualDate !== undefined) requireDate(row.actualDate, 'workouts.actualDate');
    requireOptionalText(row, 'notes', 'workouts.notes');
  }

  for (const row of value.meals as Record<string, unknown>[]) {
    requireDate(row.date, 'meals.date');
    requireOneOf(row.mealType, MEAL_TYPES, 'meals.mealType');
    requireText(row.content, 'meals.content');
    requireOptionalText(row, 'notes', 'meals.notes');
  }

  for (const row of value.games as Record<string, unknown>[]) {
    requireText(row.name, 'games.name');
    requireOneOf(row.status, GAME_STATUSES, 'games.status');
    requireOptionalText(row, 'platform', 'games.platform');
    requireOptionalText(row, 'notes', 'games.notes');
  }

  const gameIds = idsByCollection.get('games')!;
  for (const row of value.playSessions as Record<string, unknown>[]) {
    requireText(row.gameId, 'playSessions.gameId');
    if (!gameIds.has(row.gameId as string)) throw new DataFileError('游玩记录关联的游戏不存在。');
    requireDate(row.date, 'playSessions.date');
    requireFiniteOptionalNumber(row.durationMinutes, 'playSessions.durationMinutes');
    requireOptionalText(row, 'notes', 'playSessions.notes');
  }

  const linkedCollections: Record<string, string> = {
    media: 'mediaItems',
    'development-task': 'developmentTasks',
    'consultation-follow-up': 'consultations',
    workout: 'workouts',
  };
  const linkedTargets = new Set<string>();
  for (const row of value.planItems as Record<string, unknown>[]) {
    const linkedRecord = row.linkedRecord as Record<string, unknown> | undefined;
    if (!linkedRecord) continue;
    const collection = linkedCollections[linkedRecord.type as string];
    if (!collection || !idsByCollection.get(collection)?.has(linkedRecord.id as string)) {
      throw new DataFileError('今日计划关联的模块记录不存在。');
    }
    const key = `${linkedRecord.type}:${linkedRecord.id}`;
    if (linkedTargets.has(key)) throw new DataFileError('同一模块记录不能重复关联到多条今日计划。');
    linkedTargets.add(key);
  }
}

export function parseAppData(text: string): AppData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new DataFileError('数据文件不是有效的 JSON。', { cause });
  }
  assertAppData(parsed);
  return parsed;
}

export function serializeAppData(data: AppData): string {
  assertAppData(data);
  return `${JSON.stringify(data, null, 2)}\n`;
}
