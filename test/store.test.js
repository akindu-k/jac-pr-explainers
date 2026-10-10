import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { loadIndex, mergeLive, pickQueue, saveIndex } from '../src/store.js';

const entry = (number, headSha, explainedSha, failures = 0) => ({
  number,
  headSha,
  explained: explainedSha ? { sha: explainedSha } : null,
  failures,
});

test('queues missing and outdated explainers, newest first', () => {
  const prs = [entry(1, 'a', null), entry(3, 'b', 'b'), entry(2, 'c', 'old'), entry(4, 'd', null, 3)];
  assert.deepEqual(pickQueue(prs, { max: 10 }).map((p) => p.number), [2, 1]);
  assert.deepEqual(pickQueue(prs, { max: 1 }).map((p) => p.number), [2]);
});

test('named PRs are queued even when up to date', () => {
  const prs = [entry(1, 'a', 'a'), entry(2, 'b', 'b')];
  assert.deepEqual(pickQueue(prs, { only: [2], max: 10 }).map((p) => p.number), [2]);
});

test('the index round-trips with one PR per line', async () => {
  const dir = pathToFileURL(`${await mkdtemp(`${tmpdir()}/idx-`)}/`);
  assert.deepEqual(await loadIndex(dir), { prs: [] });
  const index = { repo: 'o/r', prs: [entry(1, 'a', null), entry(2, 'b', 'b')] };
  await saveIndex(dir, index);
  const text = await readFile(new URL('index.json', dir), 'utf8');
  assert.equal(text.split('\n').filter((l) => l.includes('"number"')).length, 2);
  assert.deepEqual(await loadIndex(dir), index);
});

test('a refresh updates PR details but keeps saved explainer state', () => {
  const saved = [
    { number: 1, title: 'a', updatedAt: '2026-10-01', explained: { sha: 'x' }, failures: 0 },
    { number: 2, title: 'b', updatedAt: '2026-10-05', explained: null, failures: 1 },
  ];
  const live = [
    { number: 3, title: 'new', updatedAt: '2026-10-06', explained: null },
    { number: 1, title: 'a2', updatedAt: '2026-10-02', explained: null },
    { number: 2, title: 'stale', updatedAt: '2026-10-04', explained: null },
  ];
  assert.deepEqual(
    mergeLive(saved, live).map((p) => [p.number, p.title, p.explained]),
    [[3, 'new', null], [2, 'b', null], [1, 'a2', { sha: 'x' }]],
  );
});

test('explainers from an older prompt are written again', () => {
  const prs = [
    { number: 1, headSha: 'a', explained: { sha: 'a', prompt: 2 } },
    { number: 2, headSha: 'b', explained: { sha: 'b', prompt: 1 } },
  ];
  assert.deepEqual(pickQueue(prs, { max: 10, prompt: 2 }).map((p) => p.number), [2]);
});
