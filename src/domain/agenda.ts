import type { AppData, LinkedRecord } from './model.ts';

export interface DatedModuleEvent {
  key: string;
  date: string;
  title: string;
  source: string;
  completed: boolean;
  linkedRecord: LinkedRecord;
  notes?: string;
}

function allDatedModuleEvents(data: AppData): DatedModuleEvent[] {
  const events: DatedModuleEvent[] = [];
  for (const item of data.mediaItems) {
    if (item.plannedPublishDate) events.push({ key: `media:${item.id}`, linkedRecord: { type: 'media', id: item.id }, date: item.plannedPublishDate, title: item.title, source: '自媒体发布', completed: item.stage === 'published', ...(item.notes ? { notes: item.notes } : {}) });
  }
  for (const task of data.developmentTasks) {
    if (task.dueDate) events.push({ key: `development-task:${task.id}`, linkedRecord: { type: 'development-task', id: task.id }, date: task.dueDate, title: task.title, source: '开发事项', completed: task.status === 'done', ...(task.notes ? { notes: task.notes } : {}) });
  }
  for (const entry of data.consultations) {
    if (!entry.followUpDate) continue;
    const clientName = data.clients.find((client) => client.id === entry.clientId)?.displayName ?? '客户';
    events.push({ key: `consultation-follow-up:${entry.id}`, linkedRecord: { type: 'consultation-follow-up', id: entry.id }, date: entry.followUpDate, title: `${clientName} · ${entry.topic}`, source: '咨询跟进', completed: entry.followUpStatus === 'done', ...(entry.notes ? { notes: entry.notes } : {}) });
  }
  for (const workout of data.workouts) {
    events.push({ key: `workout:${workout.id}`, linkedRecord: { type: 'workout', id: workout.id }, date: workout.date, title: workout.name, source: '健身训练', completed: workout.completed, ...(workout.notes ? { notes: workout.notes } : {}) });
  }
  return events;
}

function linkedKeys(data: AppData): Set<string> {
  return new Set(data.planItems.flatMap((item) => item.linkedRecord ? [`${item.linkedRecord.type}:${item.linkedRecord.id}`] : []));
}

export function getDatedModuleEvents(data: AppData, date: string): DatedModuleEvent[] {
  const linked = linkedKeys(data);
  const order = ['media', 'development-task', 'consultation-follow-up', 'workout'];
  return allDatedModuleEvents(data)
    .filter((event) => event.date === date && !linked.has(event.key))
    .sort((a, b) => order.indexOf(a.linkedRecord.type) - order.indexOf(b.linkedRecord.type) || a.title.localeCompare(b.title, 'zh-CN'));
}

export function getLinkableModuleEvents(data: AppData): DatedModuleEvent[] {
  const linked = linkedKeys(data);
  return allDatedModuleEvents(data)
    .filter((event) => !event.completed && !linked.has(event.key))
    .sort((a, b) => a.date.localeCompare(b.date) || a.source.localeCompare(b.source, 'zh-CN') || a.title.localeCompare(b.title, 'zh-CN'));
}

interface LinkedProjection {
  title: string;
  date?: string;
  completed: boolean;
}

function projectionFor(data: AppData, reference: LinkedRecord): LinkedProjection | null {
  switch (reference.type) {
    case 'media': {
      const item = data.mediaItems.find((row) => row.id === reference.id);
      return item ? { title: item.title, date: item.plannedPublishDate, completed: item.stage === 'published' } : null;
    }
    case 'development-task': {
      const item = data.developmentTasks.find((row) => row.id === reference.id);
      return item ? { title: item.title, date: item.dueDate, completed: item.status === 'done' } : null;
    }
    case 'consultation-follow-up': {
      const item = data.consultations.find((row) => row.id === reference.id);
      const client = item ? data.clients.find((row) => row.id === item.clientId) : null;
      return item ? { title: `${client?.displayName ?? '客户'} · ${item.topic}`, date: item.followUpDate, completed: item.followUpStatus === 'done' } : null;
    }
    case 'workout': {
      const item = data.workouts.find((row) => row.id === reference.id);
      return item ? { title: item.name, date: item.date, completed: item.completed } : null;
    }
  }
}

export function syncLinkedPlanItems(data: AppData, reference: LinkedRecord, projection: LinkedProjection): AppData {
  const now = new Date().toISOString();
  const planItems = data.planItems.map((item) => {
    if (item.linkedRecord?.type !== reference.type || item.linkedRecord.id !== reference.id) return item;
    if (!projection.date) {
      const { linkedRecord: _linkedRecord, ...standalone } = item;
      return { ...standalone, title: projection.title, completed: projection.completed, updatedAt: now };
    }
    return { ...item, title: projection.title, date: projection.date, completed: projection.completed, updatedAt: now };
  });
  return { ...data, planItems };
}

export function setLinkedRecordComplete(data: AppData, reference: LinkedRecord, completed: boolean, actualDate: string): AppData {
  const now = new Date().toISOString();
  let next = data;
  switch (reference.type) {
    case 'media':
      next = { ...data, mediaItems: data.mediaItems.map((item) => item.id === reference.id ? { ...item, stage: completed ? 'published' : 'ready', updatedAt: now } : item) };
      break;
    case 'development-task':
      next = { ...data, developmentTasks: data.developmentTasks.map((item) => item.id === reference.id ? { ...item, status: completed ? 'done' : 'todo', updatedAt: now } : item) };
      break;
    case 'consultation-follow-up':
      next = { ...data, consultations: data.consultations.map((item) => item.id === reference.id ? { ...item, followUpStatus: completed ? 'done' : 'pending', updatedAt: now } : item) };
      break;
    case 'workout':
      next = { ...data, workouts: data.workouts.map((item) => item.id === reference.id ? { ...item, completed, actualDate: completed ? actualDate : undefined, updatedAt: now } : item) };
      break;
  }
  const projection = projectionFor(next, reference);
  return projection ? syncLinkedPlanItems(next, reference, projection) : next;
}

export interface DashboardSummary {
  plan: { total: number; completed: number; items: Array<{ key: string; title: string; completed: boolean; source?: string; linkedRecord?: LinkedRecord }> };
  todayEvents: DatedModuleEvent[];
  memos: AppData['quickMemos'];
  work: { mediaActive: number; mediaReady: number; developmentOpen: number; developmentBlocked: number; followUps: number; upcomingFollowUps: Array<{ title: string; client: string; date: string }> };
  life: { workouts: number; workoutsCompleted: number; meals: number; mealTypes: Record<string, number>; gamesPlaying: number; recentSessions: Array<{ gameName: string; date: string; durationMinutes?: number }> };
}

export function getDashboardSummary(data: AppData, today: string): DashboardSummary {
  const todayEvents = getDatedModuleEvents(data, today);
  const planItems = data.planItems.filter((item) => item.date === today);
  const plan = [
    ...planItems.map((item) => ({ key: `plan:${item.id}`, title: item.title, completed: item.completed, ...(item.linkedRecord ? { linkedRecord: item.linkedRecord, source: '关联事项' } : {}) })),
    ...todayEvents.map((event) => ({ key: event.key, title: event.title, completed: event.completed, linkedRecord: event.linkedRecord, source: event.source })),
  ];
  const nextWeek = new Date(`${today}T12:00:00`);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const endDate = `${nextWeek.getFullYear()}-${`${nextWeek.getMonth() + 1}`.padStart(2, '0')}-${`${nextWeek.getDate()}`.padStart(2, '0')}`;
  const upcomingFollowUps = data.consultations
    .filter((entry) => entry.followUpDate && entry.followUpDate >= today && entry.followUpDate <= endDate && entry.followUpStatus === 'pending')
    .sort((a, b) => a.followUpDate!.localeCompare(b.followUpDate!))
    .map((entry) => ({ title: entry.topic, client: data.clients.find((client) => client.id === entry.clientId)?.displayName ?? '客户', date: entry.followUpDate! }));
  const meals = data.meals.filter((meal) => meal.date === today);
  const mealTypes: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0, snack: 0 };
  for (const meal of meals) mealTypes[meal.mealType] += 1;
  const recentSessions = data.playSessions
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)
    .map((session) => ({ gameName: data.games.find((game) => game.id === session.gameId)?.name ?? '已删除的游戏', date: session.date, ...(session.durationMinutes !== undefined ? { durationMinutes: session.durationMinutes } : {}) }));

  return {
    plan: { total: plan.length, completed: plan.filter((item) => item.completed).length, items: plan },
    todayEvents,
    memos: data.quickMemos.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    work: {
      mediaActive: data.mediaItems.filter((item) => item.stage !== 'published').length,
      mediaReady: data.mediaItems.filter((item) => item.stage === 'ready').length,
      developmentOpen: data.developmentTasks.filter((item) => item.status !== 'done').length,
      developmentBlocked: data.developmentTasks.filter((item) => item.status === 'blocked').length,
      followUps: upcomingFollowUps.length,
      upcomingFollowUps,
    },
    life: {
      workouts: data.workouts.filter((workout) => workout.date === today).length,
      workoutsCompleted: data.workouts.filter((workout) => workout.date === today && workout.completed).length,
      meals: meals.length,
      mealTypes,
      gamesPlaying: data.games.filter((game) => game.status === 'playing').length,
      recentSessions,
    },
  };
}
