const env = process.env;

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function list(value) {
  return (value || '')
    .split(/[\s,]+/)
    .map((s) => Number.parseInt(s.replace(/^#/, ''), 10))
    .filter(Number.isFinite);
}

const provider = env.LLM_PROVIDER || 'claude-code';

export const config = {
  repo: env.SOURCE_REPO || 'jaseci-labs/jac',
  author: env.PR_AUTHOR || 'akindu-k',
  githubToken: env.GITHUB_TOKEN || '',
  llm: {
    provider,
    // claude-code: a Claude subscription through the Claude Code CLI.
    // openai: any OpenAI-compatible endpoint; the default is Gemini's free tier.
    model: env.LLM_MODEL || (provider === 'claude-code' ? 'claude-opus-5-5' : 'gemini-3.8-flash'),
    // How hard the model thinks before answering (claude-code only): low, medium, high, xhigh, max.
    effort: env.LLM_EFFORT || 'medium',
    baseUrl: env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiKey: env.LLM_API_KEY || '',
    // Generous, because thinking models spend part of it before answering.
    maxOutputTokens: int(env.MAX_OUTPUT_TOKENS, 8000),
  },
  // Whether credentials are available. Locally the CLI can use your own login.
  ready: provider === 'claude-code' ? Boolean(env.CLAUDE_CODE_OAUTH_TOKEN || !env.CI) : Boolean(env.LLM_API_KEY),
  maxPerRun: int(env.MAX_PER_RUN, 10),
  // About 35k tokens. Lower it for providers with small context or per-minute token limits.
  maxInputChars: int(env.MAX_INPUT_CHARS, 120000),
  // Pause between model requests so a backfill stays under per-minute limits.
  requestGapMs: int(env.REQUEST_GAP_MS, 7000),
  // Explain these PRs again even if nothing changed.
  onlyPrs: list(env.ONLY_PRS),
  outDir: new URL('../site/explainers/', import.meta.url),
};
