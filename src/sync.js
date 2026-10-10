import { toEntry } from './store.js';

// Brings a PR list up to date with GitHub, fetching details only for PRs that
// are new or changed since the list was made.
export async function syncPrs(github, { repo, author, prs, force = [] }) {
  const known = new Map(prs.map((pr) => [pr.number, pr]));
  const pulls = new Map();
  const found = await github.searchPulls(repo, author);
  for (const item of found) {
    const previous = known.get(item.number);
    if (previous && previous.updatedAt === item.updated_at && !force.includes(item.number)) continue;
    const pr = await github.getPull(repo, item.number);
    pulls.set(pr.number, pr);
    known.set(pr.number, toEntry(pr, previous));
  }
  return {
    prs: [...known.values()].sort((a, b) => b.number - a.number),
    pulls,
    found: found.length,
  };
}
