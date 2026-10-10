import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMessages, cleanAnswer, orderFiles, renderExplainer, MARKER } from '../src/prompt.js';

const pr = {
  number: 42,
  title: 'fix(scale): keep the secret',
  state: 'open',
  merged_at: null,
  draft: false,
  body: 'It was lost on redeploy.',
  user: { login: 'akindu-k' },
  head: { ref: 'fix/secret', sha: 'abcdef1234567890' },
  base: { ref: 'main' },
  additions: 10,
  deletions: 2,
  changed_files: 2,
  html_url: 'https://github.com/o/r/pull/42',
  created_at: '2026-10-01T10:00:00Z',
};
const file = (filename, patch, changes = 10) => ({ filename, patch, changes, status: 'modified', additions: changes, deletions: 0 });

test('source files come before tests, larger changes first', () => {
  const ordered = orderFiles([file('tests/test_a.py', '', 99), file('src/a.py', '', 1), file('src/b.py', '', 5)]);
  assert.deepEqual(ordered.map((f) => f.filename), ['src/b.py', 'src/a.py', 'tests/test_a.py']);
});

test('the prompt stays within the character budget', () => {
  const files = Array.from({ length: 20 }, (_, i) => file(`src/f${i}.py`, '+x\n'.repeat(2000)));
  const [, user] = buildMessages({ repo: 'o/r', pr, files, commits: [], maxChars: 12000 });
  assert.ok(user.content.length < 13000, `prompt was ${user.content.length} chars`);
  assert.match(user.content, /Diffs not shown/);
});

test('lockfile diffs are left out', () => {
  const [, user] = buildMessages({ repo: 'o/r', pr, files: [file('package-lock.json', '+lock')], commits: [], maxChars: 12000 });
  assert.doesNotMatch(user.content, /\+lock/);
});

test('cleanAnswer drops a code fence and a leading title', () => {
  assert.equal(cleanAnswer('```markdown\n# Title\n\n## In short\nHi\n```'), '## In short\nHi');
  assert.equal(cleanAnswer('## In short\nHi'), '## In short\nHi');
});

test('the explainer links the PR and the commit it describes', () => {
  const md = renderExplainer({ repo: 'o/r', pr, body: '## In short\nHi', model: 'm', now: new Date('2026-10-10T00:00:00Z') });
  assert.match(md, /^# fix\(scale\): keep the secret/);
  assert.ok(md.includes(MARKER));
  assert.match(md, /pull\/42\/commits\/abcdef1234567890/);
  assert.match(md, /on 10 Oct 2026/);
});
