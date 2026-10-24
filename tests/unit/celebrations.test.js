// Celebration queue: one at a time, in order, merged by key, never blocked by errors.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQueue } from '../../src/features/celebrations/queue.js';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

test('plays in order and never overlaps', async () => {
  const log = [];
  let live = 0,
    maxLive = 0;
  const q = createQueue(async (c) => {
    live++;
    maxLive = Math.max(maxLive, live);
    log.push(c.title);
    await tick(5);
    live--;
  });
  ['a', 'b', 'c'].forEach((title) => q.push({ title }));
  assert.equal(q.busy, true);
  assert.equal(q.pending, 2);
  await tick(40);
  assert.deepEqual(log, ['a', 'b', 'c']);
  assert.equal(maxLive, 1);
  assert.equal(q.busy, false);
});

test('a waiting celebration with the same key is merged (newest wins)', async () => {
  const log = [];
  const q = createQueue(async (c) => (log.push(c.sub), tick(5)));
  q.push({ key: 'level', sub: 'L5' }); // starts now
  assert.equal(q.push({ key: 'water', sub: '1/8' }), true);
  assert.equal(q.push({ key: 'water', sub: '2/8' }), false);
  assert.equal(q.push({ key: 'water', sub: '3/8' }), false);
  await tick(40);
  assert.deepEqual(log, ['L5', '3/8']);
});

test('an error in one celebration does not block the next', async () => {
  const log = [];
  const q = createQueue(async (c) => {
    if (c.bad) throw new Error('boom');
    log.push(c.title);
  });
  q.push({ title: 'x', bad: true });
  q.push({ title: 'y' });
  await tick(10);
  assert.deepEqual(log, ['y']);
});

test('clear() drops what has not started', async () => {
  const log = [];
  const q = createQueue(async (c) => (log.push(c.title), tick(5)));
  q.push({ title: 'a' });
  q.push({ title: 'b' });
  q.clear();
  await tick(20);
  assert.deepEqual(log, ['a']);
});
