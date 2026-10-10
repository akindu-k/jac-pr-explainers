const env = process.env;

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: int(env.PORT, 3000),
  // The one account that can sign in.
  username: env.AUTH_USERNAME || 'akindu-k',
  password: env.AUTH_PASSWORD || null,
  // Fine-grained token for this repo (Contents: read, Actions: read and write).
  // Without it the refresh button only updates the PR list, and reads are
  // limited to GitHub's 60 unauthenticated requests an hour.
  githubToken: env.GITHUB_TOKEN || null,
  // Where explainers are read from. Unset: the local site/explainers folder.
  contentRepo: env.CONTENT_REPO || null,
  contentBranch: env.CONTENT_BRANCH || 'main',
  workflow: env.WORKFLOW_FILE || 'explain.yml',
  // Whose PRs the refresh button looks for, and where.
  sourceRepo: env.SOURCE_REPO || 'jaseci-labs/jac',
  author: env.PR_AUTHOR || 'akindu-k',
};
