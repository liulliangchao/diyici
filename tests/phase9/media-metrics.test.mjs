import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEmptyData, parseAppData } from '../../src/storage/dataCodec.ts';
import { deleteMediaSnapshot, upsertMediaSnapshot } from '../../src/domain/mediaMetrics.ts';

function snapshot(id, date, counts = {}) {
  const now = '2026-10-01T00:00:00.000Z';
  return { id, createdAt: now, updatedAt: now, date, views: 0, likes: 0, comments: 0, saves: 0, shares: 0, ...counts };
}

test('media snapshots validate all five non-negative integer engagement counts', () => {
  const data = createEmptyData();
  data.mediaItems.push({ id: 'video-1', createdAt: data.createdAt, updatedAt: data.updatedAt, title: '已发布作品', stage: 'published', metricsSnapshots: [snapshot('stats-1', '2026-09-30', { views: 1200, likes: 86, comments: 9, saves: 27, shares: 11 })] });
  assert.equal(parseAppData(JSON.stringify(data)).mediaItems[0].metricsSnapshots[0].views, 1200);

  const invalidCount = structuredClone(data);
  invalidCount.mediaItems[0].metricsSnapshots[0].likes = -1;
  assert.throws(() => parseAppData(JSON.stringify(invalidCount)), /大于或等于零/);
  const fractionalCount = structuredClone(data);
  fractionalCount.mediaItems[0].metricsSnapshots[0].views = 2.5;
  assert.throws(() => parseAppData(JSON.stringify(fractionalCount)), /非负整数/);
});

test('a video cannot contain two snapshots for the same day', () => {
  const data = createEmptyData();
  data.mediaItems.push({ id: 'video-1', createdAt: data.createdAt, updatedAt: data.updatedAt, title: '已发布作品', stage: 'published', metricsSnapshots: [snapshot('stats-1', '2026-09-30'), snapshot('stats-2', '2026-09-30')] });
  assert.throws(() => parseAppData(JSON.stringify(data)), /同一视频同一天/);
});

test('upserting a date edits its snapshot while preserving identity and chronological order', () => {
  const item = { id: 'video-1', createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z', title: '视频', stage: 'published', metricsSnapshots: [snapshot('later', '2026-09-30'), snapshot('first', '2026-09-28')] };
  const edited = upsertMediaSnapshot(item, snapshot('new-id', '2026-09-28', { views: 500 }));
  assert.deepEqual(edited.metricsSnapshots.map((row) => row.date), ['2026-09-28', '2026-09-30']);
  assert.equal(edited.metricsSnapshots[0].id, 'first');
  assert.equal(edited.metricsSnapshots[0].views, 500);
  assert.equal(deleteMediaSnapshot(edited, 'first').metricsSnapshots.length, 1);
});
