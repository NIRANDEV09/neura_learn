// Configured model choices. The learner's choice is tried first; transient
// provider errors then move through the remaining configured providers.
import { AsyncLocalStorage } from 'node:async_hooks';

const GEMINI_KNOWN = {
  'gemini-3.5-flash': { label: 'Gemini 3.5 Flash', note: 'Balanced' },
  'gemini-3.8-flash': { label: 'Gemini 3.8 Flash', note: 'Most capable, slower' },
  'gemini-flash-lite-latest': { label: 'Gemini Flash-Lite', note: 'Fastest' },
};

const split = value => String(value || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 6);
const geminiIds = env => split(env.GEMINI_MODELS || Object.keys(GEMINI_KNOWN).join(','));
const providerModelIds = (env, listKey, modelKey, fallback) => split(env[listKey] || env[modelKey] || fallback);
const xaiKey = env => env.XAI_API_KEY || env.GROK_API_KEY || '';
const normalizeProvider = value => ({ grok: 'xai', 'openai-compatible': 'openai-compatible' }[String(value || '').toLowerCase()] || String(value || '').toLowerCase());

export function modelList(env = process.env) {
  const provider = normalizeProvider(env.LLM_PROVIDER || 'gemini');
  const list = [];
  // Show known providers in the picker even before their server-side key has
  // been added. modelOrder below still excludes unconfigured providers, so
  // these informational entries can never be called as fallback candidates.
  const geminiConfigured = modelProviderConfigured('gemini', env);
  const geminiModels = split(env.GEMINI_MODELS || env.GEMINI_MODEL || (geminiConfigured || provider === 'gemini' ? 'gemini-flash-latest' : ''));
  list.push(...geminiModels.map(id => ({
    id, model: id, provider: 'gemini', label: GEMINI_KNOWN[id]?.label || `Gemini · ${id}`,
    note: GEMINI_KNOWN[id]?.note || 'Gemini API', configured: geminiConfigured, keyName: 'GEMINI_API_KEY',
  })));
  list.push(...providerModelIds(env, 'OPENAI_MODELS', 'OPENAI_MODEL', 'gpt-5.4-mini').map(model => ({
    id: `openai:${model}`, model, provider: 'openai', label: `OpenAI · ${model}`, note: 'OpenAI API',
    configured: modelProviderConfigured('openai', env), keyName: 'OPENAI_API_KEY',
  })));
  list.push(...providerModelIds(env, 'XAI_MODELS', 'XAI_MODEL', 'grok-4.7').map(model => ({
    id: `xai:${model}`, model, provider: 'xai', label: `Grok · ${model}`, note: 'xAI API',
    configured: modelProviderConfigured('xai', env), keyName: 'XAI_API_KEY',
  })));
  if (provider === 'openai-compatible' && env.LLM_BASE_URL && env.LLM_MODEL) {
    list.push({ id: `compatible:${env.LLM_MODEL}`, model: env.LLM_MODEL, provider: 'openai-compatible', label: `Custom · ${env.LLM_MODEL}`, note: 'OpenAI-compatible API', configured: true });
  }
  return list;
}

export function modelDetails(id, env = process.env) {
  return modelList(env).find(item => item.id === id || (item.provider === 'gemini' && item.model === id)) || null;
}

const store = new AsyncLocalStorage();
let fallbackChoice = null;
let fallbackReport = null;

// deadline (a Date.now() value) is set where the host cuts requests off, such as
// Netlify's 60 second limit; model calls then stop trying new models in time.
export const withModelChoice = (choice, fn, deadline = null) => store.run({ choice: choice ? String(choice).slice(0, 120) : null, used: null, skipped: [], deadline, start: Date.now(), usage: { calls: 0, in: 0, out: 0, think: 0 } }, fn);
export function timeLeft() {
  const deadline = store.getStore()?.deadline;
  return deadline ? deadline - Date.now() : Infinity;
}
export function setModelChoice(choice) {
  fallbackChoice = choice ? String(choice).slice(0, 120) : null;
  fallbackReport = null;
}

function preferredId(env, list) {
  const provider = normalizeProvider(env.LLM_PROVIDER || 'gemini');
  if (provider === 'openai-compatible') return `compatible:${env.LLM_MODEL || ''}`;
  if (provider === 'openai') return `openai:${env.OPENAI_MODEL || 'gpt-5.4-mini'}`;
  if (provider === 'xai') return `xai:${env.XAI_MODEL || 'grok-4.7'}`;
  if (provider === 'ollama') return null;
  const geminiModel = env.GEMINI_MODEL || list.find(item => item.provider === 'gemini')?.id;
  return geminiModel || list[0]?.id || null;
}

// Return a preferred candidate followed by the remaining configured choices.
export function modelOrder(env = process.env) {
  const all = modelList(env);
  const hasAnyKey = !!(env.GEMINI_API_KEY || env.OPENAI_API_KEY || xaiKey(env) || (env.LLM_BASE_URL && env.LLM_MODEL));
  const list = all.filter(item => modelProviderConfigured(item.provider, env) || (!hasAnyKey && !env.LLM_PROVIDER && item.provider === 'gemini'));
  const ids = list.map(item => item.id);
  const wanted = store.getStore()?.choice ?? fallbackChoice;
  const first = ids.includes(wanted) ? wanted : ids.includes(preferredId(env, list)) ? preferredId(env, list) : ids[0];
  const order = first ? [first, ...ids.filter(id => id !== first)] : [];
  // A model to avoid (the writer, during its own fact check) is only tried last.
  const avoid = store.getStore()?.avoid;
  return avoid && order.includes(avoid) ? [...order.filter(id => id !== avoid), avoid] : order;
}

// why: one short reason per skipped model, e.g. "gemini-x: HTTP 429 quota".
// The fact check should not be done by the model that wrote the answer, so
// they don't share blind spots: prefer another provider, then another model.
export function reviewerFor(writer, env = process.env) {
  const order = modelOrder(env), w = modelDetails(writer, env);
  if (!w) return null;
  const other = order.map(id => modelDetails(id, env)).filter(m => m && m.id !== w.id);
  return (other.find(m => m.provider !== w.provider) || other[0] || null)?.id || null;
}
// Makes the rest of this request try id first (the reviewer, for a fact check)
// and avoid until every other model has been tried (the writer).
export function preferModel(id, avoid = null) { const s = store.getStore(); if (!s) return; if (id) s.choice = id; if (avoid) s.avoid = avoid; }

export function noteModel(used, skipped, why = []) {
  const report = { used, skipped: [...skipped], why: [...why] };
  const s = store.getStore();
  if (s) Object.assign(s, report);
  else fallbackReport = report;
}
export function modelReport() { return store.getStore() || fallbackReport; }

// Token counts for the current request, added up over every model call it
// makes (a fact check makes several). Sent back to the browser as x-usage.
const count = n => (Number.isFinite(+n) && +n > 0 ? Math.round(+n) : 0);
export function noteUsage(counts) {
  const { input, output, thinking } = counts || {}, u = store.getStore()?.usage;
  if (!u) return;
  u.calls += 1; u.in += count(input); u.out += count(output); u.think += count(thinking);
}
export function usageReport() {
  const s = store.getStore();
  return s?.usage ? { ...s.usage, ms: Date.now() - s.start } : null;
}
// Each provider reports its counts in its own shape.
export const geminiUsage = m => m && ({ input: m.promptTokenCount, output: m.candidatesTokenCount, thinking: m.thoughtsTokenCount });
export function chatUsage(u) {
  if (!u) return null;
  const thinking = count(u.completion_tokens_details?.reasoning_tokens);
  return { input: u.prompt_tokens, output: count(u.completion_tokens) - thinking, thinking };
}

export function modelProviderConfigured(provider, env = process.env) {
  if (provider === 'gemini') return !!env.GEMINI_API_KEY;
  if (provider === 'openai') return !!env.OPENAI_API_KEY;
  if (provider === 'xai') return !!xaiKey(env);
  if (provider === 'openai-compatible') return !!(env.LLM_BASE_URL && env.LLM_MODEL);
  return false;
}
