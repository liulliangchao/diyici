import assert from 'node:assert/strict';
import test from 'node:test';
import { createEmptyData, assertAppData } from '../../src/storage/dataCodec.ts';
import {
  getDatedModuleEvents,
  getLinkableModuleEvents,
  getDashboardSummary,
  setLinkedRecordComplete,
  syncLinkedPlanItems,
} from '../../src/domain/agenda.ts';

function base(id) {
  const timestamp = '2026-09-30T08:00:00.000Z';
  return { id, createdAt: timestamp, updatedAt: timestamp };
}

function sampleData() {
  const data = createEmptyData(new Date('2026-09-30T08:00:00.000Z'));
  data.mediaItems.push({ ...base('media-1'), title: '短视频选题', stage: 'ready', plannedPublishDate: '2026-09-30' });
  data.developmentProjects.push({ ...base('project-1'), name: '本地 App', status: 'active' });
  data.developmentTasks.push({ ...base('task-1'), projectId: 'project-1', title: '完成页面', status: 'blocked', dueDate: '2026-09-30' });
  data.clients.push({ ...base('client-1'), displayName: '林先生' });
  data.consultations.push({ ...base('consult-1'), clientId: 'client-1', date: '2026-09-29', topic: '产品讨论', followUpDate: '2026-09-30', followUpStatus: 'pending' });
  data.workouts.push({ ...base('workout-1'), date: '2026-09-30', name: '力量训练', exercises: [], completed: false });
  data.meals.push({ ...base('meal-1'), date: '2026-09-30', mealType: 'breakfast', content: '鸡蛋和燕麦' });
  data.games.push({ ...base('game-1'), name: '山海旅人', status: 'playing' });
  data.playSessions.push({ ...base('session-1'), gameId: 'game-1', date: '2026-09-29', durationMinutes: 50 });
  return data;
}

test('dated module events include publishing, development, consultation, and workout records', () => {
  const events = getDatedModuleEvents(sampleData(), '2026-09-30');
  assert.deepEqual(events.map((event) => event.linkedRecord.type), ['media', 'development-task', 'consultation-follow-up', 'workout']);
  assert.deepEqual(events.map((event) => event.title), ['短视频选题', '完成页面', '林先生 · 产品讨论', '力量训练']);
  assert.deepEqual(events.map((event) => event.completed), [false, false, false, false]);
});

test('linked plan items suppress duplicate agenda events and are not offered for a second link', () => {
  const data = sampleData();
  const link = getDatedModuleEvents(data, '2026-09-30')[0];
  data.planItems.push({ ...base('plan-1'), date: link.date, title: link.title, linkedRecord: link.linkedRecord, completed: link.completed, sortOrder: 0 });
  assert.equal(getDatedModuleEvents(data, '2026-09-30').length, 3);
  assert.equal(getLinkableModuleEvents(data).some((event) => event.key === link.key), false);
});

test('completing a linked item updates its source record and linked plan state together', () => {
  const data = sampleData();
  const reference = getDatedModuleEvents(data, '2026-09-30')[1].linkedRecord;
  data.planItems.push({ ...base('plan-task'), date: '2026-09-30', title: '完成页面', linkedRecord: reference, completed: false, sortOrder: 0 });
  const completed = setLinkedRecordComplete(data, reference, true, '2026-09-30');
  assert.equal(completed.developmentTasks[0].status, 'done');
  assert.equal(completed.planItems[0].completed, true);
  assertAppData(completed);
  const reopened = setLinkedRecordComplete(completed, reference, false, '2026-09-30');
  assert.equal(reopened.developmentTasks[0].status, 'todo');
  assert.equal(reopened.planItems[0].completed, false);
});

test('source edits update linked plan title and date; removing its date unlinks it safely', () => {
  const data = sampleData();
  const event = getDatedModuleEvents(data, '2026-09-30')[0];
  data.planItems.push({ ...base('plan-media'), date: event.date, title: event.title, linkedRecord: event.linkedRecord, completed: false, sortOrder: 0 });
  const edited = syncLinkedPlanItems(data, event.linkedRecord, { title: '周五视频', date: '2026-10-02', completed: false });
  assert.equal(edited.planItems[0].title, '周五视频');
  assert.equal(edited.planItems[0].date, '2026-10-02');
  const unlinked = syncLinkedPlanItems(edited, event.linkedRecord, { title: '周五视频', completed: false });
  assert.equal(unlinked.planItems[0].linkedRecord, undefined);
  assertAppData(unlinked);
});

test('dashboard summary calculates plan, work, and life summaries from source data', () => {
  const summary = getDashboardSummary(sampleData(), '2026-09-30');
  assert.equal(summary.todayEvents.length, 4);
  assert.equal(summary.plan.total, 4);
  assert.equal(summary.plan.completed, 0);
  assert.equal(summary.work.mediaActive, 1);
  assert.equal(summary.work.developmentOpen, 1);
  assert.equal(summary.work.developmentBlocked, 1);
  assert.equal(summary.work.followUps, 1);
  assert.equal(summary.life.workouts, 1);
  assert.equal(summary.life.meals, 1);
  assert.equal(summary.life.gamesPlaying, 1);
  assert.equal(summary.life.recentSessions[0].gameName, '山海旅人');
});
