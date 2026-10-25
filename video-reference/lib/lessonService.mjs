// The computed-lesson API in one place, shared by server.mjs and the Netlify
// functions so both deployments behave the same.
//
// A lesson can be requested two ways:
//   { topic }                     free text from a search box or the chat
//   { algorithm, input, target }  the topic page's input editor
// Either way the tracer runs the algorithm and the director builds the scenes;
// the model (when asked) only rewrites narration afterwards.
import { ALGORITHMS } from './tracers.mjs';
import { matchTopic, buildLesson, narrateLesson } from './director.mjs';
import { parseInput, formatInput, catalog } from './catalog.mjs';

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function lessonCatalog() { return catalog(); }

// model: { modelCall, isConfigured, currentModel } from the host's engine.
export async function computedLesson(body, model) {
  const t0 = Date.now();
  let match;
  if (body && body.algorithm !== undefined) {
    if (!ALGORITHMS[body.algorithm]) throw fail('Unknown algorithm.');
    const parsed = parseInput(body.algorithm, typeof body.input === 'string' ? body.input.slice(0, 500) : '');
    if (parsed.error) throw fail(parsed.error);
    const target = body.target === undefined || body.target === null || String(body.target).trim() === '' ? undefined : String(body.target).trim();
    match = { id: body.algorithm, data: parsed.data, target };
  } else {
    const topic = body && body.topic;
    if (typeof topic !== 'string' || !topic.trim()) throw fail('Topic is required.');
    if (topic.length > 500) throw fail('Topic is too long (max 500 characters).', 413);
    match = matchTopic(topic.trim());
    if (!match) return { supported: false };
  }
  const lesson = buildLesson(match);
  const traceMs = Date.now() - t0;
  let narration = { source: 'template' };
  if (body.narrate === 'ai') {
    if (!model || !model.isConfigured()) narration = { source: 'template', reason: 'No model is configured.' };
    else {
      const t1 = Date.now();
      try {
        const r = await narrateLesson(lesson, model.modelCall);
        narration = { source: 'ai', model: model.currentModel(), replaced: r.replaced, rejected: r.rejected, ms: Date.now() - t1 };
      } catch (e) { narration = { source: 'template', reason: e.message }; }
    }
  }
  return { supported: true, lesson, input: formatInput(lesson.visual), narration, traceMs };
}
