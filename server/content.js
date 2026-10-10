import { readFile } from 'node:fs/promises';

const LOCAL_DIR = new URL('../site/explainers/', import.meta.url);
const FRESH_MS = 30_000;

// Reads files from site/explainers: from the GitHub repo the workflow commits
// to, or from disk when no repo is set. Repo reads are cached briefly and
// revalidated with ETags, which don't count against GitHub's rate limit.
export function createContent({ repo, branch, token }) {
  const cache = new Map();

  async function fromGitHub(name) {
    const cached = cache.get(name);
    if (cached && Date.now() - cached.at < FRESH_MS) return cached.body;

    const url = token
      ? `https://api.github.com/repos/${repo}/contents/site/explainers/${name}?ref=${branch}`
      : `https://raw.githubusercontent.com/${repo}/${branch}/site/explainers/${name}`;
    const res = await fetch(url, {
      headers: {
        accept: 'application/vnd.github.raw',
        'user-agent': 'jac-pr-explainers',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(cached?.etag ? { 'if-none-match': cached.etag } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 304 && cached) {
      cached.at = Date.now();
      return cached.body;
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      if (cached) return cached.body;
      throw new Error(`GitHub ${res.status} reading ${name}`);
    }
    const body = await res.text();
    cache.set(name, { at: Date.now(), etag: res.headers.get('etag'), body });
    return body;
  }

  async function fromDisk(name) {
    try {
      return await readFile(new URL(name, LOCAL_DIR), 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  return {
    read: repo ? fromGitHub : fromDisk,
    // Make the next read of every file check GitHub again.
    expire() {
      for (const entry of cache.values()) entry.at = 0;
    },
  };
}
