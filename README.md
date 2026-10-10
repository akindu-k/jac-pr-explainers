<p align="center">
  <img src="site/favicon.svg" width="72" height="72" alt="">
</p>

<h1 align="center">jac-pr-explainers</h1>

<p align="center">
  A plain-language explainer for every pull request I open in <a href="https://github.com/jaseci-labs/jac">jaseci-labs/jac</a>,<br>
  written automatically and published as a small website.
</p>

<p align="center">
  <a href="https://akindu-k.github.io/jac-pr-explainers/"><strong>Read the explainers →</strong></a>
</p>

## What it does

Every hour a GitHub Actions job:

1. Finds every PR by [@akindu-k](https://github.com/akindu-k) in `jaseci-labs/jac`.
2. Writes an explainer for any PR that doesn't have one yet, or that has new commits since its explainer was written. It sends the PR's description, commits and diff to a language model and asks for these sections: *In short*, *Why it was needed*, *What changed*, *How it works*, *Tests* and *Worth knowing*.
3. Commits the result to [`site/explainers/`](site/explainers): one `<number>.md` per PR, plus `index.json` listing every PR.
4. Publishes [`site/`](site) to GitHub Pages. The page lists the PRs (search, filter by open, merged or closed) and renders each `.md` file.

The `.md` files are also readable on GitHub.

## Setup

The job works with any provider that has an OpenAI-compatible chat completions API. The default is Google's Gemini API, whose free tier needs no card:

1. Create a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Add it to the repo as the secret **`LLM_API_KEY`** (Settings → Secrets and variables → Actions).
3. Run **Explain PRs** from the Actions tab, or wait for the next hourly run.

Until the key is set, the job still updates the PR list and the site, and every PR shows as *Pending*.

### Using another provider

Set these as repository **variables**, and put the provider's key in the `LLM_API_KEY` secret:

| Provider | `LLM_BASE_URL` | `LLM_MODEL` (example) | Notes |
| --- | --- | --- | --- |
| Google Gemini (default) | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-3.8-flash` | Free tier, large context |
| Groq | `https://api.groq.com/openai/v1` | `openai/gpt-oss-120b` | Free tier; set `MAX_INPUT_CHARS` to about `20000` |
| OpenRouter | `https://openrouter.ai/api/v1` | any model ending in `:free` | 50 free requests a day |
| OpenAI | `https://api.openai.com/v1` | `gpt-5-mini` | Needs API billing; a ChatGPT plan doesn't include API use |
| Ollama (local) | `http://localhost:11434/v1` | `qwen3` | For running `npm run explain` on your own machine |

Other variables: `SOURCE_REPO` and `PR_AUTHOR` (whose PRs, where), `MAX_PER_RUN` (default 10) and `MAX_INPUT_CHARS` (default 120000). If a request is too long for the model, the job retries it with less of the diff. If the provider returns a rate limit, the remaining PRs wait for the next run.

### Re-explaining a PR

Run **Explain PRs** manually and enter PR numbers in *prs* (for example `9923, 9911`).

## Run locally

Requires Node.js 22.13 or newer. There are no dependencies to install.

```sh
cp .env.example .env              # fill in LLM_API_KEY
GITHUB_TOKEN=$(gh auth token) npm run explain
npm run preview                   # http://localhost:8080
npm test
```

## Layout

```
src/run.js        sync PRs, pick what needs explaining, write the files
src/github.js     GitHub REST calls
src/llm.js        OpenAI-compatible chat client
src/prompt.js     prompt (fitted to a size budget) and the .md format
src/store.js      index.json and the queue of PRs to explain
site/             the website, published as-is to GitHub Pages
```
