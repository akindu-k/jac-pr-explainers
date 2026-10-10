const MARKER = '<!-- explainer -->';
const PAGE = 50;
const app = document.getElementById('app');
const foot = document.getElementById('foot');

let index = null;
// Open PRs first: they're the ones still being reviewed.
const view = { query: '', state: 'open', shown: PAGE };

const date = (iso) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value);
  }
  node.append(...children.flat().filter((c) => c != null && c !== false));
  return node;
}

function stateLabel(pr) {
  if (pr.state === 'open' && pr.draft) return 'Draft';
  return { open: 'Open', merged: 'Merged', closed: 'Closed' }[pr.state];
}

const STATES = [['open', 'Open'], ['merged', 'Merged'], ['closed', 'Closed'], ['all', 'All']];

// Plain text with `code` spans, as the explainer summaries use.
function inline(text) {
  return text
    .replace(/\*\*/g, '')
    .split(/(`[^`]+`)/)
    .map((part) => (/^`[^`]+`$/.test(part) ? el('code', {}, part.slice(1, -1)) : part));
}

function statePill(pr) {
  const draft = pr.state === 'open' && pr.draft;
  return el('span', { class: `state ${draft ? 'draft' : pr.state}` }, stateLabel(pr));
}

// List view

function matches(pr) {
  if (view.state !== 'all' && pr.state !== view.state) return false;
  if (!view.query) return true;
  const q = view.query.toLowerCase();
  return pr.title.toLowerCase().includes(q) || String(pr.number).includes(q.replace('#', ''));
}

function row(pr) {
  const outdated = pr.explained && pr.explained.sha !== pr.headSha;
  return el('li', {},
    el('a', { class: `row ${pr.state}`, href: `#/${pr.number}` },
      el('span', { class: 'line' },
        statePill(pr),
        el('span', { class: 'title' }, pr.title),
      ),
      pr.summary
        ? el('span', { class: 'summary' }, ...inline(pr.summary))
        : el('span', { class: 'summary pending' }, pr.explained ? 'Open to read the explainer.' : 'Explainer not written yet.'),
      el('span', { class: 'meta' },
        `#${pr.number} · opened ${date(pr.createdAt)}`,
        pr.mergedAt ? ` · merged ${date(pr.mergedAt)}` : '',
        ` · +${pr.additions} −${pr.deletions}`,
        outdated ? el('span', { class: 'flag' }, 'New commits since the explainer') : null,
      ),
    ),
  );
}

function renderList() {
  document.title = 'Jac PRs Explained';
  const prs = index.prs;
  const count = (state) => (state === 'all' ? prs.length : prs.filter((p) => p.state === state).length);
  const explained = prs.filter((p) => p.explained).length;

  const list = el('ul', { class: 'list' });
  const more = el('button', { class: 'more', type: 'button', onclick: () => { view.shown += PAGE; fill(); } }, 'Show more');

  function fill() {
    const rows = prs.filter(matches);
    list.replaceChildren(...rows.slice(0, view.shown).map(row));
    if (!rows.length) list.append(el('li', { class: 'empty' }, 'No PRs match.'));
    more.hidden = rows.length <= view.shown;
  }

  const chip = ([value, label]) =>
    el('button', {
      type: 'button',
      'data-state': value,
      'aria-pressed': String(view.state === value),
      onclick: (e) => {
        view.state = value;
        view.shown = PAGE;
        for (const b of e.currentTarget.parentNode.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        fill();
      },
    }, label, el('span', { class: 'count' }, String(count(value))));

  const stat = (value, label, tone) => el('div', { class: `stat ${tone}` }, el('b', {}, String(value)), el('span', {}, label));

  app.replaceChildren(
    el('section', { class: 'intro' },
      el('h1', {}, 'My Jac pull requests, explained'),
      el('p', {}, 'A plain-language write-up of every pull request I have opened in ',
        el('a', { href: `https://github.com/${index.repo}` }, index.repo),
        ': what was wrong, what changed and how the fix works.'),
    ),
    el('div', { class: 'stats' },
      stat(count('open'), 'open', 'open'),
      stat(count('merged'), 'merged', 'merged'),
      stat(count('closed'), 'closed', 'closed'),
      stat(`${explained} / ${prs.length}`, 'explained', 'explained'),
    ),
    el('div', { class: 'controls' },
      el('input', {
        class: 'search',
        type: 'search',
        placeholder: 'Search titles or #number',
        'aria-label': 'Search pull requests',
        value: view.query,
        oninput: (e) => { view.query = e.target.value.trim(); view.shown = PAGE; fill(); },
      }),
      el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by state' }, STATES.map(chip)),
    ),
    list,
    more,
  );
  fill();
}

// Detail view

async function renderDetail(number) {
  const pr = index.prs.find((p) => p.number === number);
  const back = el('a', { class: 'back', href: '#/' }, '← All pull requests');
  if (!pr) {
    app.replaceChildren(back, el('p', { class: 'muted' }, `#${number} is not one of these pull requests.`));
    return;
  }
  document.title = `#${pr.number} · Jac PRs Explained`;
  window.scrollTo(0, 0);

  const article = el('article', { class: 'article' }, el('p', { class: 'muted' }, 'Loading…'));
  app.replaceChildren(
    back,
    el('section', { class: 'detail' },
      statePill(pr),
      el('h1', {}, pr.title),
      el('div', { class: 'meta' },
        `#${pr.number} · opened ${date(pr.createdAt)}`,
        pr.mergedAt ? ` · merged ${date(pr.mergedAt)}` : '',
        pr.closedAt && !pr.mergedAt ? ` · closed ${date(pr.closedAt)}` : '',
        ` · +${pr.additions} −${pr.deletions} in ${pr.changedFiles} files · `,
        el('a', { href: pr.url }, 'View on GitHub ↗'),
      ),
      pr.explained && pr.explained.sha !== pr.headSha
        ? el('p', { class: 'notice' }, 'This PR has new commits since the explainer was written. It will be rewritten on the next run.')
        : null,
      pr.explained ? article : el('p', { class: 'notice' }, 'No explainer yet. It will be written on the next run.'),
    ),
  );
  if (!pr.explained) return;

  try {
    const res = await fetch(`explainers/${pr.number}.md?v=${pr.explained.sha.slice(0, 7)}`);
    if (!res.ok) throw new Error(res.status);
    const text = await res.text();
    const body = text.includes(MARKER) ? text.slice(text.indexOf(MARKER) + MARKER.length) : text;
    article.innerHTML = DOMPurify.sanitize(marked.parse(body));
    for (const a of article.querySelectorAll('a[href^="http"]')) a.rel = 'noopener';
  } catch {
    article.replaceChildren(el('p', { class: 'muted' }, 'The explainer could not be loaded.'));
  }
}

// Routing

function route() {
  if (!index) return;
  const match = location.hash.match(/^#\/(\d+)$/);
  if (match) renderDetail(Number(match[1]));
  else renderList();
}

document.getElementById('theme').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('theme', root.dataset.theme); } catch {}
});

window.addEventListener('hashchange', route);

async function load() {
  const res = await fetch('explainers/index.json', { cache: 'no-store' });
  if (res.status === 401) return location.assign('/login');
  if (!res.ok) throw new Error(res.status);
  index = await res.json();
  foot.replaceChildren(
    `Updated ${new Date(index.syncedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · `,
    el('a', { href: 'https://github.com/akindu-k/jac-pr-explainers' }, 'Source'),
  );
  route();
}

// Refresh: the server fetches the current PRs at once, then starts the job
// that writes explainers; poll that job and reload when it finishes.

const refreshButton = document.getElementById('refresh');
const statusLine = document.getElementById('status');

function say(text, url) {
  statusLine.hidden = !text;
  statusLine.replaceChildren(text ?? '', url ? ' ' : '', url ? el('a', { href: url }, 'View the job ↗') : '');
}

function busy(on) {
  refreshButton.disabled = on;
  refreshButton.classList.toggle('spinning', on);
}

async function poll() {
  let state;
  let url;
  try {
    ({ state, url } = await (await fetch('/api/refresh', { cache: 'no-store' })).json());
  } catch {
    state = 'unknown';
  }
  if (state === 'idle') return busy(false);
  if (state === 'done') {
    await load();
    say('Explainers are up to date.');
    return busy(false);
  }
  if (state === 'failed' || state === 'unknown') {
    say('The explainer job did not finish.', url);
    return busy(false);
  }
  busy(true);
  say(state === 'in_progress' ? 'PR list updated. Writing explainers for anything new…' : 'PR list updated. Waiting for the explainer job to start…', url);
  setTimeout(poll, 5000);
}

refreshButton.addEventListener('click', async () => {
  busy(true);
  say('Checking GitHub for your latest PRs…');
  try {
    const res = await fetch('/api/refresh', { method: 'POST' });
    if (res.status === 401) return location.assign('/login');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    await load();
    if (data.dispatched) return poll();
    say('PR list updated. New explainers are written on the next hourly run.');
  } catch (err) {
    say(`Refresh failed: ${err.message}`);
  }
  busy(false);
});

try {
  await load();
  poll();
} catch {
  app.replaceChildren(el('p', { class: 'muted' }, 'The list of pull requests could not be loaded.'));
}
