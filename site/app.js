const MARKER = '<!-- explainer -->';
const PAGE = 50;
const app = document.getElementById('app');
const foot = document.getElementById('foot');

let index = null;
const view = { query: '', state: 'all', shown: PAGE };

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

function explainerTag(pr) {
  if (!pr.explained) return el('span', { class: 'tag' }, 'Pending');
  if (pr.explained.sha !== pr.headSha) return el('span', { class: 'tag outdated' }, 'Outdated');
  return null;
}

// List view

function matches(pr) {
  if (view.state !== 'all' && pr.state !== view.state) return false;
  if (!view.query) return true;
  const q = view.query.toLowerCase();
  return pr.title.toLowerCase().includes(q) || String(pr.number).includes(q.replace('#', ''));
}

function renderList() {
  document.title = 'Jac PRs Explained';
  const prs = index.prs;
  const count = (state) => prs.filter((p) => p.state === state).length;
  const explained = prs.filter((p) => p.explained).length;

  const list = el('ul', { class: 'list' });
  const more = el('button', { class: 'more', type: 'button', onclick: () => { view.shown += PAGE; fill(); } }, 'Show more');

  function fill() {
    const rows = prs.filter(matches);
    list.replaceChildren(
      ...rows.slice(0, view.shown).map((pr) =>
        el('li', {},
          el('a', { class: 'row', href: `#/${pr.number}` },
            el('span', { class: `dot ${pr.state}`, title: stateLabel(pr) }),
            el('span', { class: 'body' },
              el('span', { class: 'title' }, pr.title),
              el('span', { class: 'meta' },
                `#${pr.number} · ${stateLabel(pr)} · opened ${date(pr.createdAt)} · +${pr.additions} −${pr.deletions}`),
            ),
            explainerTag(pr),
          ),
        ),
      ),
    );
    if (!rows.length) list.append(el('li', { class: 'empty' }, 'No PRs match.'));
    more.hidden = rows.length <= view.shown;
  }

  const chip = (value, label) =>
    el('button', {
      type: 'button',
      'aria-pressed': String(view.state === value),
      onclick: (e) => {
        view.state = value;
        view.shown = PAGE;
        for (const b of e.target.parentNode.children) b.setAttribute('aria-pressed', String(b === e.target));
        fill();
      },
    }, label);

  const stat = (value, label) => el('div', { class: 'stat' }, el('b', {}, String(value)), el('span', {}, label));

  app.replaceChildren(
    el('section', { class: 'intro' },
      el('h1', {}, 'My Jac pull requests, explained'),
      el('p', {}, 'A plain-language write-up of every pull request I have opened in ',
        el('a', { href: `https://github.com/${index.repo}` }, index.repo),
        ': what was wrong, what changed and how the fix works.'),
    ),
    el('div', { class: 'stats' },
      stat(prs.length, 'pull requests'),
      stat(count('merged'), 'merged'),
      stat(count('open'), 'open'),
      stat(explained, 'explained'),
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
      el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by state' },
        chip('all', 'All'), chip('open', 'Open'), chip('merged', 'Merged'), chip('closed', 'Closed'),
      ),
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
      el('span', { class: `pill ${pr.state}` }, stateLabel(pr)),
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

try {
  const res = await fetch('explainers/index.json', { cache: 'no-cache' });
  index = await res.json();
  foot.replaceChildren(
    `Updated ${new Date(index.syncedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} · `,
    el('a', { href: 'https://github.com/akindu-k/jac-pr-explainers' }, 'Source'),
    ' · ',
    el('a', { href: 'https://akindukalhan.is-a.dev' }, 'Akindu Kalhan'),
  );
  route();
} catch {
  app.replaceChildren(el('p', { class: 'muted' }, 'The list of pull requests could not be loaded.'));
}
