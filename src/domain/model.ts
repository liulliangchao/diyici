export const DATA_SCHEMA_VERSION = 1 as const;

export const MEDIA_STAGES = ['idea', 'preparing', 'producing', 'ready', 'published'] as const;
export const DEVELOPMENT_TASK_STATUSES = ['todo', 'in-progress', 'blocked', 'done'] as const;
export const PROJECT_STATUSES = ['active', 'paused', 'completed'] as const;
export const GAME_STATUSES = ['wishlist', 'playing', 'finished', 'paused'] as const;
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export const LINKED_RECORD_TYPES = ['media', 'development-task', 'consultation-follow-up', 'workout'] as const;

export type MediaStage = typeof MEDIA_STAGES[number];
export type DevelopmentTaskStatus = typeof DEVELOPMENT_TASK_STATUSES[number];
export type ProjectStatus = typeof PROJECT_STATUSES[number];
export type GameStatus = typeof GAME_STATUSES[number];
export type MealType = typeof MEAL_TYPES[number];
export type LinkedRecordType = typeof LINKED_RECORD_TYPES[number];

export interface RecordBase {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedRecord {
  type: LinkedRecordType;
  id: string;
}

export interface PlanItem extends RecordBase {
  date: string;
  title: string;
  plannedTime?: string;
  category?: string;
  linkedRecord?: LinkedRecord;
  notes?: string;
  completed: boolean;
  sortOrder: number;
}

export interface QuickMemo extends RecordBase {
  content: string;
}

export interface MediaMetricsSnapshot extends RecordBase {
  date: string;
  views: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
}

export interface MediaContent extends RecordBase {
  title: string;
  platform?: string;
  format?: string;
  stage: MediaStage;
  plannedPublishDate?: string;
  notes?: string;
  draftUrl?: string;
  metricsSnapshots?: MediaMetricsSnapshot[];
}

export interface DevelopmentProject extends RecordBase {
  name: string;
  status: ProjectStatus;
  notes?: string;
}

export interface DevelopmentTask extends RecordBase {
  projectId: string;
  title: string;
  status: DevelopmentTaskStatus;
  dueDate?: string;
  notes?: string;
}

export interface Client extends RecordBase {
  displayName: string;
  notes?: string;
}

export interface Consultation extends RecordBase {
  clientId: string;
  date: string;
  topic: string;
  notes?: string;
  followUpDate?: string;
  followUpStatus: 'pending' | 'done';
}

export interface ExerciseEntry {
  id: string;
  bodyPart?: string;
  name: string;
  sets?: number;
  reps?: number;
  weight?: number;
}

export interface Workout extends RecordBase {
  date: string;
  name: string;
  exercises: ExerciseEntry[];
  completed: boolean;
  actualDate?: string;
  notes?: string;
}

export interface MealEntry extends RecordBase {
  date: string;
  mealType: MealType;
  content: string;
  notes?: string;
}

export interface Game extends RecordBase {
  name: string;
  platform?: string;
  status: GameStatus;
  notes?: string;
}

export interface PlaySession extends RecordBase {
  gameId: string;
  date: string;
  durationMinutes?: number;
  notes?: string;
}

export interface AppData {
  schemaVersion: typeof DATA_SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
  planItems: PlanItem[];
  quickMemos: QuickMemo[];
  mediaItems: MediaContent[];
  developmentProjects: DevelopmentProject[];
  developmentTasks: DevelopmentTask[];
  clients: Client[];
  consultations: Consultation[];
  workouts: Workout[];
  meals: MealEntry[];
  games: Game[];
  playSessions: PlaySession[];
}
