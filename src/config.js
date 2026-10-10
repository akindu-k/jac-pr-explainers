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

export const config = {
  repo: env.SOURCE_REPO || 'jaseci-labs/jac',
  author: env.PR_AUTHOR || 'akindu-k',
  githubToken: env.GITHUB_TOKEN || '',
  llm: {
    // Google's Gemini API through its OpenAI-compatible endpoint; free with an
    // AI Studio key. Any other OpenAI-compatible provider works the same way.
    baseUrl: env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: env.LLM_MODEL || 'gemini-3.8-flash',
    apiKey: env.LLM_API_KEY || '',
    // Generous, because thinking models spend part of it before answering.
    maxOutputTokens: int(env.MAX_OUTPUT_TOKENS, 8000),
  },
  maxPerRun: int(env.MAX_PER_RUN, 10),
  // About 35k tokens. Lower it for providers with small context or per-minute token limits.
  maxInputChars: int(env.MAX_INPUT_CHARS, 120000),
  // Pause between model requests so a backfill stays under per-minute limits.
  requestGapMs: int(env.REQUEST_GAP_MS, 7000),
  // Explain these PRs again even if nothing changed.
  onlyPrs: list(env.ONLY_PRS),
  outDir: new URL('../site/explainers/', import.meta.url),
};
