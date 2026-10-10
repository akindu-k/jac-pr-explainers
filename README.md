<p align="center">
  <img src="site/favicon.svg" width="72" height="72" alt="">
</p>

<h1 align="center">jac-pr-explainers</h1>

<p align="center">
  A plain-language explainer for every pull request I open in <a href="https://github.com/jaseci-labs/jac">jaseci-labs/jac</a>,<br>
  written automatically and shown on a small private website.
</p>

## What it does

**Every hour**, a GitHub Actions job:

1. Finds every PR by [@akindu-k](https://github.com/akindu-k) in `jaseci-labs/jac`.
2. Writes an explainer for any PR that doesn't have one yet, or that has new commits since its explainer was written. It sends the PR's description, commits and diff to the model and asks for these sections: *In short*, *Why it was needed*, *What changed*, *How it works*, *Tests* and *Worth knowing*.
3. Commits the result to [`site/explainers/`](site/explainers): one `<number>.md` per PR, plus `index.json` listing every PR.

**The website** (an Express server on Render) needs a username and password. It lists the PRs, with search and open/merged/closed filters, and renders each explainer. It reads the explainers from this repo when a page is requested, so new explainers appear without a redeploy.

**Refresh** fetches your current PRs from GitHub straight away, so new PRs show up at once. It then starts the job, and the page follows the job and reloads when the new explainers are written.

## Setup

### 1. Let the job use your Claude subscription

Explainers are written by Claude through the Claude Code CLI, signed in with your Pro or Max plan rather than a paid API key. Usage counts toward your plan's limits. By default the job writes at most 3 explainers an hour, which leaves room for your own use while it works through older PRs.

```sh
claude setup-token        # sign in in the browser; prints a token valid for one year
gh secret set CLAUDE_CODE_OAUTH_TOKEN -R akindu-k/jac-pr-explainers   # paste it
```

Until the secret is set, the job only updates the PR list, and every PR shows as *Pending*.

### 2. Make a token for the website

Create a [fine-grained personal access token](https://github.com/settings/personal-access-tokens/new) with these settings:

- **Repository access:** only `akindu-k/jac-pr-explainers`
- **Permissions:** Contents *Read-only*, Actions *Read and write*

The site uses it to read explainers and to start the job from the Refresh button.

### 3. Deploy the website on Render

**New → Blueprint** on Render, then pick this repo. [`render.yaml`](render.yaml) sets up a free web service. When asked, fill in:

| Variable | Value |
| --- | --- |
| `AUTH_PASSWORD` | the password you'll sign in with (the username is `akindu-k`) |
| `GITHUB_TOKEN` | the token from step 2 |

The server refuses to start without a password, so the site is never public by accident. Sessions last 30 days.

## Configuration

**Job** (repository variables and secrets):

| Name | Default | |
| --- | --- | --- |
| `CLAUDE_CODE_OAUTH_TOKEN` (secret) | | From `claude setup-token` |
| `LLM_MODEL` | `sonnet` | Any model name Claude Code accepts, for example `opus` or `haiku` |
| `MAX_PER_RUN` | `3` | Most explainers per hourly run |
| `MAX_INPUT_CHARS` | `120000` | How much PR text to send; long diffs are trimmed, source files before tests |
| `SOURCE_REPO`, `PR_AUTHOR` | `jaseci-labs/jac`, `akindu-k` | Whose PRs, and where |

If you hit the plan's usage limit, the job stops and the rest wait for the next run. To explain specific PRs again, run **Explain PRs** from the Actions tab and enter their numbers in *prs*.

The job can also use any OpenAI-compatible API instead. Set `LLM_PROVIDER=openai` with `LLM_BASE_URL`, `LLM_MODEL` and an `LLM_API_KEY` secret. For example, Gemini's free tier uses `https://generativelanguage.googleapis.com/v1beta/openai` with `gemini-3.8-flash`.

**Website** (environment variables): `AUTH_USERNAME` (default `akindu-k`), `AUTH_PASSWORD`, `GITHUB_TOKEN`, and `CONTENT_REPO`, the repo to read explainers from. When `CONTENT_REPO` is unset, the site reads the local `site/explainers/`.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm install
cp .env.example .env                            # set AUTH_PASSWORD
GITHUB_TOKEN=$(gh auth token) npm run explain   # uses your local Claude Code login
npm start                                       # http://localhost:3000
npm test
```

## Layout

```
src/run.js        the job: sync PRs, pick what needs explaining, write the files
src/sync.js       bring the PR list up to date with GitHub
src/llm.js        Claude Code CLI, or any OpenAI-compatible API
src/prompt.js     the prompt (fitted to a size budget) and the .md format
src/store.js      index.json, the queue, and merging a refresh into it
server/           the website: sign-in, explainers from the repo, refresh
site/             the pages the server serves
```
