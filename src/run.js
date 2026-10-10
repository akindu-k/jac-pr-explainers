import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { config } from './config.js';
import { createGitHub } from './github.js';
import { complete } from './llm.js';
import { buildMessages, cleanAnswer, linkedIssues, PROMPT_VERSION, renderExplainer, summaryOf } from './prompt.js';
import { loadIndex, pickQueue, saveIndex, toEntry } from './store.js';
import { syncPrs } from './sync.js';

const { repo, author, outDir } = config;
const github = createGitHub(config.githubToken);

// 1. Sync the list of PRs, fetching details only for ones that changed.
const index = await loadIndex(outDir);
const before = JSON.stringify(index.prs);
const { prs, pulls, found } = await syncPrs(github, { repo, author, prs: index.prs, force: config.onlyPrs });
index.repo = repo;
index.author = author;
index.syncedAt = new Date().toISOString();
index.prs = prs;
// Summaries are read from the saved explainers, so they follow summaryOf's current rules.
for (const entry of index.prs) {
  if (!entry.explained) continue;
  const markdown = await readFile(new URL(`${entry.number}.md`, outDir), 'utf8').catch(() => null);
  if (markdown != null) entry.summary = summaryOf(markdown);
}
console.log(`${found} PRs by @${author} in ${repo}, ${pulls.size} new or updated.`);

// 2. Write explainers for PRs that have none, or whose branch moved since.
const queue = config.ready ? pickQueue(index.prs, { only: config.onlyPrs, max: config.maxPerRun, prompt: PROMPT_VERSION }) : [];
if (!config.ready) console.log('No model credentials are set, so no explainers are written. The PR list is still updated.');
else console.log(queue.length ? `Explaining ${queue.map((p) => `#${p.number}`).join(', ')}` : 'All explainers are up to date.');

const done = [];
for (const [i, entry] of queue.entries()) {
  if (i > 0) await sleep(config.requestGapMs);
  const n = entry.number;
  try {
    const pr = pulls.get(n) ?? (await github.getPull(repo, n));
    const [files, commits, discussion, checks, issues] = await Promise.all([
      github.getPullFiles(repo, n),
      github.getPullCommits(repo, n),
      github.getDiscussion(repo, n),
      github.getCheckRuns(repo, pr.head.sha).catch(() => []),
      // Only real issues: a #number can also point at another PR.
      Promise.all(linkedIssues(pr).map((i) => github.getIssue(repo, i).catch(() => null)))
        .then((found) => found.filter((i) => i && !i.pull_request)),
    ]);

    let answer;
    let model;
    for (let maxChars = config.maxInputChars; ; maxChars = Math.floor(maxChars / 2)) {
      try {
        const messages = buildMessages({ repo, pr, files, commits, issues, discussion, checks, maxChars });
        ({ text: answer, model } = await complete(config.llm, messages));
        break;
      } catch (err) {
        if (!err.tooLong || maxChars < 4000) throw err;
        console.log(`  #${n}: too long for the model, retrying with less of the diff`);
      }
    }

    const body = cleanAnswer(answer);
    const markdown = renderExplainer({ repo, pr, body, model, issues, files });
    await writeFile(new URL(`${n}.md`, outDir), markdown);
    Object.assign(entry, toEntry(pr, entry), {
      explained: { sha: pr.head.sha, prompt: PROMPT_VERSION, at: new Date().toISOString(), model },
      summary: summaryOf(body),
      failures: 0,
    });
    done.push(n);
    console.log(`  #${n}: done`);
  } catch (err) {
    if (err.rateLimited) {
      console.log(`  Rate limited by the model provider; the rest waits for the next run.`);
      break;
    }
    entry.failures = (entry.failures ?? 0) + 1;
    console.error(`  #${n}: ${err.message}`);
  } finally {
    // Save after every PR so an interrupted run keeps its work.
    await saveIndex(outDir, index);
  }
}
// Skip the write when nothing changed, so quiet runs don't commit.
if (JSON.stringify(index.prs) !== before) await saveIndex(outDir, index);

if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `explained=${done.map((n) => `#${n}`).join(', ')}\n`);
}
