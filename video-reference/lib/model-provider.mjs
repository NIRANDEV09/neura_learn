import { modelDetails, modelOrder, noteModel, noteUsage, geminiUsage, chatUsage } from './models.mjs';

const fail = (message, status = 503, options = {}) => Object.assign(new Error(message), { status, ...options });

function responseText(data) {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(part => part.text || '').join('');
  return '';
}

function providerKey(provider, env) {
  if (provider === 'gemini') return env.GEMINI_API_KEY || '';
  if (provider === 'openai') return env.OPENAI_API_KEY || '';
  if (provider === 'xai') return env.XAI_API_KEY || env.GROK_API_KEY || '';
  if (provider === 'openai-compatible') return env.LLM_API_KEY || '';
  return '';
}

async function fetchGemini(candidate, system, user, jsonMode, maxTokens, options, env, signal) {
  const key = providerKey('gemini', env);
  if (!key) throw fail('GEMINI_API_KEY is not configured.', 503);
  const base = (env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const body = thinking => JSON.stringify({
    system_instruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: maxTokens,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
      ...(thinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
    },
  });
  const request = thinking => fetch(`${base}/models/${candidate.model}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: body(thinking), signal,
  });
  let response;
  try { response = await request(options.thinking); }
  catch (error) { throw fail(`Gemini request failed: ${error.message}`, 503, { retryable: true }); }
  if (response.status === 400 && options.thinking) {
    const err = await response.clone().json().catch(() => ({}));
    if (/thinking/i.test(err.error?.message || '')) {
      try { response = await request(null); }
      catch (error) { throw fail(`Gemini request failed: ${error.message}`, 503, { retryable: true }); }
    }
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `Gemini returned HTTP ${response.status}`;
    if (response.status === 400 && /api key/i.test(message)) throw fail('Invalid GEMINI_API_KEY. Check the Netlify secret.', 502);
    throw fail(`Gemini ${candidate.model}: ${message}`, response.status, { retryable: true });
  }
  if (data.promptFeedback?.blockReason) throw fail(`Gemini blocked the prompt (${data.promptFeedback.blockReason}). Simplify the topic and retry.`, 422, { fatal: true });
  const text = data.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || '';
  if (!text.trim()) throw fail(`Gemini ${candidate.model} returned an empty response.`, 503, { retryable: true });
  noteUsage(geminiUsage(data.usageMetadata));
  return text;
}

async function fetchChatCompletion(candidate, system, user, jsonMode, maxTokens, env, signal) {
  const { provider, model } = candidate;
  const key = providerKey(provider, env);
  if (!key && provider !== 'openai-compatible') throw fail(`${provider === 'xai' ? 'XAI_API_KEY' : 'OPENAI_API_KEY'} is not configured.`, 503);
  const bases = {
    openai: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    xai: env.XAI_BASE_URL || 'https://api.x.ai/v1',
    'openai-compatible': env.LLM_BASE_URL || '',
  };
  const base = String(bases[provider] || '').replace(/\/$/, '');
  if (!base) throw fail('Set LLM_BASE_URL for the configured OpenAI-compatible provider.', 503);
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    ...(provider === 'openai' ? { max_completion_tokens: maxTokens } : { max_tokens: maxTokens, temperature: 0.35 }),
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };
  const headers = { 'content-type': 'application/json' };
  if (key) headers.authorization = `Bearer ${key}`;
  let response;
  try {
    response = await fetch(`${base}/chat/completions`, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (error) {
    throw fail(`${provider === 'xai' ? 'Grok' : provider === 'openai' ? 'OpenAI' : 'Model endpoint'} request failed: ${error.message}`, 503, { retryable: true });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error?.message || `${provider} returned HTTP ${response.status}`;
    throw fail(`${candidate.label}: ${message}`, response.status, { retryable: true });
  }
  const text = responseText(data);
  if (!text.trim()) throw fail(`${candidate.label} returned an empty response.`, 503, { retryable: true });
  noteUsage(chatUsage(data.usage));
  return text;
}

export async function generateWithModel(id, system, user, jsonMode = false, maxTokens = 8000, options = {}, env = process.env) {
  const candidate = modelDetails(id, env);
  if (!candidate) throw fail(`Model "${id}" is not configured.`, 503);
  const signal = options.signal || AbortSignal.timeout(options.timeoutMs || 120_000);
  if (candidate.provider === 'gemini') return fetchGemini(candidate, system, user, jsonMode, maxTokens, options, env, signal);
  return fetchChatCompletion(candidate, system, user, jsonMode, maxTokens, env, signal);
}

export async function callModelFallback(system, user, jsonMode = false, maxTokens = 8000, options = {}, env = process.env, ids = modelOrder(env)) {
  let lastError = null;
  const skipped = [];
  for (const id of ids) {
    try {
      const text = await generateWithModel(id, system, user, jsonMode, maxTokens, options, env);
      noteModel(id, skipped);
      return text;
    } catch (error) {
      if (error.fatal) throw error;
      lastError = error;
      skipped.push(id);
    }
  }
  if (!ids.length) throw fail('No AI provider is configured. Add GEMINI_API_KEY, OPENAI_API_KEY, or XAI_API_KEY to the server environment.', 503);
  const allBusy = skipped.length > 1 || lastError?.retryable;
  throw fail(allBusy
    ? 'All configured AI models are busy or unavailable. Try again shortly, or add another provider key for fallback.'
    : (lastError?.message || 'The AI request failed.'), 503, { retryable: true });
}
