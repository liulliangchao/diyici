import type { MediaContent, MediaMetricsSnapshot } from './model';

export const MEDIA_METRICS = [
  { key: 'views', label: '播放量', color: '#7459c5' },
  { key: 'likes', label: '点赞', color: '#e47a71' },
  { key: 'comments', label: '评论', color: '#4f90bb' },
  { key: 'saves', label: '收藏', color: '#d5a343' },
  { key: 'shares', label: '分享', color: '#519b7d' },
] as const;

export type MediaMetricKey = typeof MEDIA_METRICS[number]['key'];

export function upsertMediaSnapshot(item: MediaContent, next: MediaMetricsSnapshot): MediaContent {
  const snapshots = item.metricsSnapshots ?? [];
  const existing = snapshots.find((snapshot) => snapshot.date === next.date);
  const snapshot = existing
    ? { ...next, id: existing.id, createdAt: existing.createdAt }
    : next;
  return {
    ...item,
    metricsSnapshots: [...snapshots.filter((row) => row.date !== next.date), snapshot].sort((a, b) => a.date.localeCompare(b.date)),
    updatedAt: new Date().toISOString(),
  };
}

export function deleteMediaSnapshot(item: MediaContent, snapshotId: string): MediaContent {
  return {
    ...item,
    metricsSnapshots: (item.metricsSnapshots ?? []).filter((snapshot) => snapshot.id !== snapshotId),
    updatedAt: new Date().toISOString(),
  };
}
