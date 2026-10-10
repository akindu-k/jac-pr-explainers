const API = 'https://api.github.com';

export function createGitHub(token) {
  async function request(path) {
    const res = await fetch(path.startsWith('http') ? path : API + path, {
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
    return { data: await res.json(), next: nextLink(res.headers.get('link')) };
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
  };
}

function nextLink(header) {
  const match = header?.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}
