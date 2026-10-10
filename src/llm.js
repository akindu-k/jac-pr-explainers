// A minimal client for any OpenAI-compatible chat completions endpoint
// (GitHub Models, OpenAI, Gemini's OpenAI endpoint, OpenRouter, Groq, Ollama...).

export class LlmError extends Error {
  constructor(status, body) {
    super(`Model request failed (${status}): ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }

  get rateLimited() {
    return this.status === 429;
  }

  get tooLong() {
    return this.status === 413 || /tokens_limit_reached|context_length|too long|maximum context/i.test(this.body);
  }
}

export async function chat({ baseUrl, apiKey, model, messages, maxOutputTokens }) {
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
  return text;
}
