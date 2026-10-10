import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

// Two ways to reach a model:
// - claude-code: the Claude Code CLI, signed in with a Claude subscription
//   (CLAUDE_CODE_OAUTH_TOKEN from `claude setup-token`, or a local login).
// - openai: any OpenAI-compatible chat completions endpoint (Gemini, Groq,
//   OpenRouter, OpenAI, Ollama...).

export class LlmError extends Error {
  constructor(status, body) {
    super(`Model request failed (${status}): ${String(body).slice(0, 300)}`);
    this.status = status;
    this.body = String(body);
  }

  get rateLimited() {
    return this.status === 429;
  }

  get tooLong() {
    return this.status === 413 || /tokens_limit_reached|context_length|too long|maximum context/i.test(this.body);
  }
}

export function complete(llm, messages) {
  return llm.provider === 'claude-code' ? claudeCode(llm, messages) : openai(llm, messages);
}

async function claudeCode({ model, effort }, messages) {
  const [system, user] = messages;
  const args = [
    '-p',
    '--model', model,
    '--effort', effort,
    '--system-prompt', system.content,
    // A single answer: no tools, no settings or memory from the machine.
    '--tools', '',
    '--setting-sources', '',
    '--no-session-persistence',
    '--output-format', 'json',
  ];
  const { code, stdout, stderr } = await run('claude', args, user.content);

  let data;
  try {
    data = JSON.parse(stdout);
  } catch {
    throw new LlmError(code, stderr || stdout || 'claude printed nothing');
  }
  if (data.is_error || !data.result?.trim()) {
    const message = data.result || data.subtype || 'error';
    throw new LlmError(/usage limit|hit your limit|rate limit|overloaded/i.test(message) ? 429 : 500, message);
  }
  // The CLI may also call a small model for housekeeping; report the one that wrote the most.
  const used = Object.entries(data.modelUsage ?? {}).sort((a, b) => b[1].outputTokens - a[1].outputTokens);
  return { text: data.result, model: used[0]?.[0] ?? model };
}

function run(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'], timeout: 600_000 });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function openai({ baseUrl, apiKey, model, maxOutputTokens }, messages) {
  const send = (limitField) =>
    fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, [limitField]: maxOutputTokens }),
      signal: AbortSignal.timeout(180_000),
    });

  let res = await send('max_tokens');
  // Newer OpenAI models only accept max_completion_tokens.
  if (res.status === 400) {
    const body = await res.text();
    if (!/max_tokens/.test(body)) throw new LlmError(res.status, body);
    res = await send('max_completion_tokens');
  }
  if (!res.ok) throw new LlmError(res.status, await res.text());

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text?.trim()) throw new LlmError(200, 'The model returned an empty answer');
  return { text, model: data.model || model };
}
