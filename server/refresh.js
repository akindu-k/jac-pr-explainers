import { mergeLive } from '../src/store.js';
import { syncPrs } from '../src/sync.js';

const DONE = new Set(['completed']);

// The refresh button: fetches the current PRs right away so the list is up to
// date immediately, then starts the workflow to write any missing explainers.
export function createRefresher({ github, content, config }) {
  let live = [];
  let dispatchedAt = null;
  let finished = false;

  const saved = async () => JSON.parse((await content.read('index.json')) ?? '{"prs":[]}');

  return {
    // The saved index with the latest refresh layered on top.
    async index() {
      const index = await saved();
      return { ...index, prs: mergeLive(index.prs, live) };
    },

    async refresh() {
      const index = await this.index();
      ({ prs: live } = await syncPrs(github, { repo: config.sourceRepo, author: config.author, prs: index.prs }));

      let dispatched = false;
      if (config.githubToken && config.contentRepo) {
        await github.dispatchWorkflow(config.contentRepo, config.workflow, config.contentBranch);
        dispatchedAt = Date.now();
        finished = false;
        dispatched = true;
      }
      return { dispatched };
    },

    // State of the workflow run the last refresh started.
    async status() {
      if (!dispatchedAt) return { state: 'idle' };
      const run = await github.latestRun(config.contentRepo, config.workflow, 'workflow_dispatch');
      // The new run can take a few seconds to show up.
      if (!run || Date.parse(run.created_at) < dispatchedAt - 10_000) return { state: 'queued' };
      if (!DONE.has(run.status)) return { state: run.status, url: run.html_url };

      if (!finished) {
        finished = true;
        content.expire();
      }
      return { state: run.conclusion === 'success' ? 'done' : 'failed', url: run.html_url };
    },
  };
}
