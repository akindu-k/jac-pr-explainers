import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMessages, cleanAnswer, linkedIssues, orderFiles, renderExplainer, summaryOf, MARKER } from '../src/prompt.js';

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
  const files = [file('src/a.py', '', 10), file('tests/test_a.py', '', 4), file('release_notes/x.md', '', 1)];
  const issues = [{ number: 7, title: 'Secret lost', html_url: 'https://github.com/o/r/issues/7' }];
  const md = renderExplainer({ repo: 'o/r', pr, body: '## 1. The short version\nHi', model: 'm', issues, files, now: new Date('2026-10-10T00:00:00Z') });
  assert.match(md, /^# PR #42 explained: fix\(scale\): keep the secret/);
  assert.match(md, /\*\*Issue it refers to:\*\* \[#7\]\(https:\/\/github.com\/o\/r\/issues\/7\), “Secret lost”/);
  assert.match(md, /10 lines of production code \(\+10 \/ −0 across 1 file\), 4 lines of tests, 1 line of release notes and docs/);
  assert.ok(md.includes(MARKER));
  assert.match(md, /pull\/42\/commits\/abcdef1234567890/);
  assert.match(md, /on 10 Oct 2026/);
});

test('summaryOf takes the In short paragraph', () => {
  const md = '# T\n\n<!-- explainer -->\n\n## In short\n\nIt was\nbroken. Now `x` works.\n\n## Words to know\n- a';
  assert.equal(summaryOf(md), 'It was broken. Now `x` works.');
  assert.equal(summaryOf('no sections'), null);
  assert.ok(summaryOf(`## In short\n${'word '.repeat(200)}`).length <= 400);
});

test('linked issues come from the title and description, not the PR itself', () => {
  const linked = linkedIssues({
    number: 42,
    title: 'fix: keep the secret (#9080)',
    body: 'Fixes https://github.com/o/r/issues/9001. Also see #42, #9080 and &#123; markup.',
  });
  assert.deepEqual(linked, [9080, 9001]);
});

test('the prompt carries reviews, checks and linked issues', () => {
  const [, user] = buildMessages({
    repo: 'o/r',
    pr,
    files: [file('src/a.py', '+x')],
    commits: [{ sha: 'abcdef1', commit: { message: 'first\nbody', author: { date: '2026-10-01T00:00:00Z' } } }],
    issues: [{ number: 7, title: 'Secret lost', state: 'open', body: 'It vanishes.' }],
    discussion: [{ kind: 'review', state: 'CHANGES_REQUESTED', user: { login: 'senior' }, body: 'Add a test', created_at: '2026-10-02T00:00:00Z' }],
    checks: [{ name: 'tests', status: 'completed', conclusion: 'failure' }],
    maxChars: 20000,
  });
  assert.match(user.content, /### #7: Secret lost \(open\)\nIt vanishes\./);
  assert.match(user.content, /@senior \(review, changes requested\): Add a test/);
  assert.match(user.content, /- tests: failure/);
  assert.match(user.content, /- abcdef1 \[2026-10-01\] first/);
});

test('summaryOf reads the numbered short version', () => {
  assert.equal(summaryOf('## 1. The short version\n\nFirst para.\n\nSecond.\n\n## 2. Words'), 'First para.');
  const md = '## 1. The short version\n\nBackground on v0.37 here.\n\n**The bug: it broke. More.** Then.\n\n**The fix: it works.**\n\n**Status:** merged.\n\n## 2. Words';
  assert.equal(summaryOf(md), 'The bug: it broke. The fix: it works.');
});
