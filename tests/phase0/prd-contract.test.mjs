import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prdUrl = new URL('../../PRD.md', import.meta.url);
const prd = await readFile(prdUrl, 'utf8');

test('PRD lists the nine agreed navigation destinations', () => {
  const destinations = [
    '首页总览',
    '今日计划',
    '自媒体',
    '开发工作',
    '咨询工作',
    '健身计划',
    '饮食计划',
    '游戏娱乐',
    '数据与设置',
  ];

  for (const destination of destinations) {
    assert.ok(prd.includes(destination), `Missing navigation destination: ${destination}`);
  }
});

test('PRD specifies an independent local data file and backup recovery', () => {
  assert.match(prd, /独立数据文件/);
  assert.match(prd, /自动保存/);
  assert.match(prd, /制作独立备份/);
  assert.match(prd, /恢复前自动生成当前数据的安全备份/);
  assert.match(prd, /数据不发送到远端服务/);
});

test('each domain module has distinct required data and operations', () => {
  for (const section of ['5.1 今日计划', '5.2 自媒体', '5.3 开发工作', '5.4 咨询工作', '5.5 健身计划', '5.6 饮食计划', '5.7 游戏娱乐']) {
    assert.ok(prd.includes(section), `Missing module definition: ${section}`);
  }

  for (const operation of ['阶段', '所属项目', '咨询记录', '训练数据', '餐次', '游玩状态']) {
    assert.ok(prd.includes(operation), `Missing domain-specific behavior: ${operation}`);
  }
});

test('PRD includes concrete acceptance coverage for persistence, recovery, and offline use', () => {
  assert.match(prd, /13\. \*\*本地持久化\*\*/);
  assert.match(prd, /14\. \*\*独立备份\*\*/);
  assert.match(prd, /15\. \*\*恢复流程和异常保护\*\*/);
  assert.match(prd, /16\. \*\*离线与单人边界\*\*/);
});

test('PRD includes the current manual save, video metrics, and day-calendar requirements', () => {
  assert.match(prd, /手动保存/);
  assert.match(prd, /播放量、点赞、评论、收藏和分享/);
  assert.match(prd, /健身与饮食均以月历查看每日记录/);
  assert.match(prd, /月历显示每日已记录的餐次/);
});
