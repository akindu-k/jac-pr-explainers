import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createApp } from '../server/app.js';
import { createRefresher } from '../server/refresh.js';

const config = {
  username: 'me',
  password: 'secret',
  githubToken: 'token',
  contentRepo: 'me/explainers',
  contentBranch: 'main',
  workflow: 'explain.yml',
  sourceRepo: 'o/r',
  author: 'me',
};

const saved = {
  syncedAt: '2026-10-01T00:00:00Z',
  prs: [{ number: 1, title: 'old title', updatedAt: '2026-10-01T00:00:00Z', headSha: 'a', explained: { sha: 'a' } }],
};
const files = { 'index.json': JSON.stringify(saved), '1.md': '# one' };
const content = { read: async (name) => files[name] ?? null, expire() { this.expired = true; } };

let run = null;
const dispatched = [];
const github = {
  searchPulls: async () => [
    { number: 1, updated_at: '2026-10-02T00:00:00Z' },
    { number: 2, updated_at: '2026-10-02T00:00:00Z' },
  ],
  getPull: async (repo, number) => ({
    number,
    title: `title ${number}`,
    state: 'open',
    html_url: '',
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-02T00:00:00Z',
    head: { sha: number === 1 ? 'b' : 'c' },
  }),
  dispatchWorkflow: async (...args) => dispatched.push(args),
  latestRun: async () => run,
};

let server;
let base;
before(async () => {
  const refresher = createRefresher({ github, content, config });
  server = createApp({ config, content, refresher }).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

const get = (path, cookie) => fetch(base + path, { redirect: 'manual', headers: cookie ? { cookie } : {} });

async function signIn(username = 'me', password = 'secret') {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    redirect: 'manual',
    body: new URLSearchParams({ username, password, next: '/#/1' }),
  });
  return { res, cookie: res.headers.get('set-cookie')?.split(';')[0] };
}

test('pages and data need a session', async () => {
  assert.equal((await get('/')).headers.get('location'), '/login');
  assert.equal((await get('/explainers/index.json', 'jpe_session=1.forged')).status, 401);
  assert.equal((await get('/healthz')).status, 200);
  assert.equal((await get('/styles.css')).status, 200);
});

test('a wrong username or password is refused', async () => {
  for (const [u, p] of [['me', 'nope'], ['you', 'secret']]) {
    const { res, cookie } = await signIn(u, p);
    assert.match(res.headers.get('location'), /^\/login\?error=1/);
    assert.equal(cookie, undefined);
  }
});

test('signing in opens the site and the explainers', async () => {
  const { res, cookie } = await signIn();
  assert.equal(res.headers.get('location'), '/#/1');
  assert.equal((await get('/', cookie)).status, 200);
  assert.equal(await (await get('/explainers/1.md', cookie)).text(), '# one');
  assert.equal((await get('/explainers/x.json', cookie)).status, 404);
  assert.equal((await get('/explainers/9.md', cookie)).status, 404);
});

test('refresh shows new PRs at once and follows the job it starts', async () => {
  const { cookie } = await signIn();
  const post = await fetch(`${base}/api/refresh`, { method: 'POST', headers: { cookie } });
  assert.deepEqual(await post.json(), { dispatched: true });
  assert.deepEqual(dispatched, [['me/explainers', 'explain.yml', 'main']]);

  const index = await (await get('/explainers/index.json', cookie)).json();
  assert.deepEqual(index.prs.map((p) => [p.number, p.title, p.explained]), [
    [2, 'title 2', null],
    [1, 'title 1', { sha: 'a' }],
  ]);

  const status = async () => (await get('/api/refresh', cookie)).json();
  assert.equal((await status()).state, 'queued');
  run = { created_at: new Date().toISOString(), status: 'in_progress', html_url: 'u' };
  assert.equal((await status()).state, 'in_progress');
  run = { ...run, status: 'completed', conclusion: 'success' };
  assert.equal((await status()).state, 'done');
  assert.equal(content.expired, true);
});
