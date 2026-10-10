const API = 'https://api.github.com';

export function createGitHub(token) {
  async function request(path, { method = 'GET', body } = {}) {
    const res = await fetch(path.startsWith('http') ? path : API + path, {
      method,
      body: body && JSON.stringify(body),
      headers: {
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'jac-pr-explainers',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`GitHub ${res.status} for ${path}: ${(await res.text()).slice(0, 200)}`);
    }
    const text = await res.text();
    return { data: text ? JSON.parse(text) : null, next: nextLink(res.headers.get('link')) };
  }

  async function paginate(path, maxPages = 10) {
    const items = [];
    for (let url = path, page = 0; url && page < maxPages; page++) {
      const { data, next } = await request(url);
      items.push(...(Array.isArray(data) ? data : data.items));
      url = next;
    }
    return items;
  }

  return {
    // Every PR the author opened in the repo, newest first.
    searchPulls(repo, author) {
      const q = encodeURIComponent(`repo:${repo} is:pr author:${author}`);
      return paginate(`/search/issues?q=${q}&sort=created&order=desc&per_page=100`);
    },
    async getPull(repo, number) {
      return (await request(`/repos/${repo}/pulls/${number}`)).data;
    },
    getPullFiles(repo, number) {
      return paginate(`/repos/${repo}/pulls/${number}/files?per_page=100`, 3);
    },
    getPullCommits(repo, number) {
      return paginate(`/repos/${repo}/pulls/${number}/commits?per_page=100`, 1);
    },
    async getIssue(repo, number) {
      return (await request(`/repos/${repo}/issues/${number}`)).data;
    },
    // Review verdicts, inline review comments and conversation comments, oldest first.
    async getDiscussion(repo, number) {
      const [reviews, inline, conversation] = await Promise.all([
        paginate(`/repos/${repo}/pulls/${number}/reviews?per_page=100`, 2),
        paginate(`/repos/${repo}/pulls/${number}/comments?per_page=100`, 3),
        paginate(`/repos/${repo}/issues/${number}/comments?per_page=100`, 2),
      ]);
      return [
        ...reviews.filter((r) => r.body?.trim() || r.state !== 'COMMENTED').map((r) => ({ kind: 'review', ...r, created_at: r.submitted_at })),
        ...inline.map((c) => ({ kind: 'inline', ...c })),
        ...conversation.map((c) => ({ kind: 'comment', ...c })),
      ].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    },
    async getCheckRuns(repo, sha) {
      const { data } = await request(`/repos/${repo}/commits/${sha}/check-runs?per_page=100`);
      return data.check_runs;
    },
    async dispatchWorkflow(repo, workflow, ref = 'main') {
      await request(`/repos/${repo}/actions/workflows/${workflow}/dispatches`, { method: 'POST', body: { ref } });
    },
    async latestRun(repo, workflow, event) {
      const { data } = await request(`/repos/${repo}/actions/workflows/${workflow}/runs?event=${event}&per_page=1`);
      return data.workflow_runs[0] ?? null;
    },
  };
}

function nextLink(header) {
  const match = header?.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}
