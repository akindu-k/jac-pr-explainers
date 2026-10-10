import { createGitHub } from '../src/github.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { createContent } from './content.js';
import { createRefresher } from './refresh.js';

if (!config.password) {
  console.error('Set AUTH_PASSWORD. The site is private and will not start without a password.');
  process.exit(1);
}

const github = createGitHub(config.githubToken);
const content = createContent({ repo: config.contentRepo, branch: config.contentBranch, token: config.githubToken });
const refresher = createRefresher({ github, content, config });

createApp({ config, content, refresher }).listen(config.port, () => {
  const source = config.contentRepo ? `${config.contentRepo}@${config.contentBranch}` : 'local files';
  console.log(`jac-pr-explainers on http://localhost:${config.port} (explainers from ${source})`);
});
