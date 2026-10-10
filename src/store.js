import { readFile, writeFile } from 'node:fs/promises';

// site/explainers/index.json: one entry per PR, read by the website and by
// the next run to see which explainers are missing or out of date.

const MAX_FAILURES = 3;

export async function loadIndex(dir) {
  try {
    return JSON.parse(await readFile(new URL('index.json', dir), 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    return { prs: [] };
  }
}

export async function saveIndex(dir, index) {
  index.prs.sort((a, b) => b.number - a.number);
  // One PR per line keeps the commits that update it readable.
  const { prs, ...rest } = index;
  const lines = Object.entries(rest).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`);
  const rows = prs.map((pr) => `    ${JSON.stringify(pr)}`).join(',\n');
  await writeFile(new URL('index.json', dir), `{\n${lines.join('\n')}\n  "prs": [\n${rows}\n  ]\n}\n`);
}

export function toEntry(pr, previous) {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.merged_at ? 'merged' : pr.state,
    draft: Boolean(pr.draft),
    url: pr.html_url,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at ?? null,
    closedAt: pr.closed_at ?? null,
    headSha: pr.head.sha,
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changed_files,
    explained: previous?.explained ?? null,
    summary: previous?.summary ?? null,
    failures: previous?.headSha === pr.head.sha ? (previous?.failures ?? 0) : 0,
  };
}

// PRs with no explainer, or whose explainer was written for an older commit or
// an older prompt; newest first.
export function pickQueue(prs, { only = [], max, prompt }) {
  if (only.length) return prs.filter((pr) => only.includes(pr.number));
  const stale = (pr) => pr.explained?.sha !== pr.headSha || pr.explained?.prompt !== prompt;
  return prs
    .filter((pr) => stale(pr) && (pr.failures ?? 0) < MAX_FAILURES)
    .sort((a, b) => b.number - a.number)
    .slice(0, max);
}

// The saved list with fresher PR details layered on top (from the site's
// refresh button). Explainer state always comes from the saved list, since
// only the workflow writes explainers.
export function mergeLive(saved, live) {
  const byNumber = new Map(saved.map((pr) => [pr.number, pr]));
  for (const pr of live) {
    const current = byNumber.get(pr.number);
    if (current && current.updatedAt >= pr.updatedAt) continue;
    byNumber.set(pr.number, {
      ...pr,
      explained: current?.explained ?? null,
      summary: current?.summary ?? null,
      failures: current?.failures ?? 0,
    });
  }
  return [...byNumber.values()].sort((a, b) => b.number - a.number);
}
