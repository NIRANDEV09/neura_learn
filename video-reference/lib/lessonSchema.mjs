// The scene format every computed lesson uses, plus its validator. The AI only
// ever fills this structure (narration, and for inserted scenes a choice of
// actions); it never writes SVG. Anything that fails validation is rejected.
//
// Lesson
//   { lessonId, title, level, algorithm,
//     visual:{type:'tree'|'array'|'graph'|'stack'|'queue'|'recursion', data, target?, start?, calls?},
//     trace:{ initial, steps:[{op, fact, phase, state}] }, scenes:[Scene] }
// Scene
//   { id, kind, title, visual:{type, data}, beats:[Beat], checkpoint? }
// Beat
//   { id, say, action }
//   action.op = 'show'      -> the state at action.at (or the initial state)
//             | 'step'      -> trace step action.index: a real execution state
//             | 'pulse'     -> pulse action.target
//             | 'highlight' -> highlight action.targets
//             | 'traverse'  -> move a pointer along action.path
//   Targets are node values for trees and graphs, array indices for arrays,
//   operation indices for stacks and queues (the item that operation added),
//   and call ids for recursion trees (calls numbered in the order they are made).
//   A traverse path must follow real edges: tree edges, graph edges, or
//   caller-to-callee edges. Stacks and queues have no paths, so no traverse.
// Checkpoint
//   { q, options:[2-4 strings], answer (one of options), onWrong? (scene id) }
import { isTreeEdge, treeValues, graphNodes, isGraphEdge, recursionCalls, isCallEdge, VISUAL_TYPES } from './tracers.mjs';

export const SCENE_KINDS = ['intro', 'trace', 'misconception', 'remedial', 'recap', 'answer'];
export const ACTION_OPS = ['show', 'step', 'pulse', 'highlight', 'traverse'];
const MAX_SAY = 400;

const indexChecker = (n, what) => ({ ok: t => Number.isInteger(t) && t >= 0 && t < n, describe: `${what} from 0 to ${n - 1}` });
// What a target means for each visual, and which pairs a traverse may step between.
// Everything is derived from visual.data, never from extra fields a client sent.
export function targetChecker(visual) {
  if (visual.type === 'tree') {
    const values = new Set(treeValues(visual.data));
    return { ok: t => values.has(t), describe: 'a node value in the tree', edge: (a, b) => isTreeEdge(visual.data, a, b) };
  }
  if (visual.type === 'graph') {
    const values = new Set(graphNodes(visual.data));
    return { ok: t => values.has(t), describe: 'a node value in the graph', edge: (a, b) => isGraphEdge(visual.data, a, b) };
  }
  if (visual.type === 'recursion') {
    const calls = recursionCalls(visual.data);
    return { ...indexChecker(calls.length, 'a call id'), edge: (a, b) => isCallEdge(calls, a, b) };
  }
  if (visual.type === 'stack' || visual.type === 'queue') return { ...indexChecker(visual.data.length, 'an operation index'), edge: null };
  return { ...indexChecker(visual.data.length, 'an array index'), edge: () => true };
}

export function validateAction(action, ctx, where) {
  const errors = [];
  if (!action || typeof action !== 'object') return [`${where}: action is missing.`];
  if (!ACTION_OPS.includes(action.op)) return [`${where}: action.op must be one of ${ACTION_OPS.join(', ')}.`];
  const inTrace = k => Number.isInteger(k) && k >= 0 && k < ctx.traceLength;
  const target = targetChecker(ctx.visual);
  if (action.op === 'step' && !inTrace(action.index)) errors.push(`${where}: step index must be an integer from 0 to ${ctx.traceLength - 1}.`);
  if (action.at !== undefined && action.at !== null && !inTrace(action.at)) errors.push(`${where}: "at" must be a trace step from 0 to ${ctx.traceLength - 1}.`);
  if (action.op === 'pulse' && !target.ok(action.target)) errors.push(`${where}: pulse target must be ${target.describe}.`);
  if (action.op === 'highlight') {
    if (!Array.isArray(action.targets) || !action.targets.length) errors.push(`${where}: highlight needs a non-empty targets list.`);
    else if (action.targets.some(t => !target.ok(t))) errors.push(`${where}: every highlight target must be ${target.describe}.`);
  }
  if (action.op === 'traverse') {
    const p = action.path;
    if (!target.edge) errors.push(`${where}: traverse is not available for a ${ctx.visual.type}; use pulse or highlight.`);
    else if (!Array.isArray(p) || p.length < 2) errors.push(`${where}: traverse needs a path of at least 2 targets.`);
    else if (p.some(t => !target.ok(t))) errors.push(`${where}: every path entry must be ${target.describe}.`);
    else {
      for (let k = 1; k < p.length; k++) if (!target.edge(p[k - 1], p[k])) { errors.push(`${where}: ${p[k - 1]} and ${p[k]} are not connected by an edge.`); break; }
    }
  }
  return errors;
}

export function validateScenes(scenes, ctx, { allIds } = {}) {
  const errors = [];
  if (!Array.isArray(scenes) || !scenes.length) return ['scenes must be a non-empty array.'];
  const ids = allIds || new Set(scenes.map(s => s && s.id));
  const seen = new Set();
  scenes.forEach((s, i) => {
    const where = `scene ${i + 1}`;
    if (!s || typeof s !== 'object') { errors.push(`${where} is not an object.`); return; }
    if (typeof s.id !== 'string' || !s.id) errors.push(`${where}: id is required.`);
    else if (seen.has(s.id)) errors.push(`${where}: duplicate id ${s.id}.`);
    seen.add(s.id);
    if (!SCENE_KINDS.includes(s.kind)) errors.push(`${where}: kind must be one of ${SCENE_KINDS.join(', ')}.`);
    if (typeof s.title !== 'string' || !s.title.trim() || s.title.length > 90) errors.push(`${where}: title must be 1-90 characters.`);
    if (!s.visual || s.visual.type !== ctx.visual.type || JSON.stringify(s.visual.data) !== JSON.stringify(ctx.visual.data)) errors.push(`${where}: visual must be the lesson's own ${ctx.visual.type} and data.`);
    if (!Array.isArray(s.beats) || !s.beats.length || s.beats.length > 30) { errors.push(`${where}: needs 1-30 beats.`); return; }
    s.beats.forEach((b, j) => {
      const bw = `${where}, beat ${j + 1}`;
      if (!b || typeof b.say !== 'string' || !b.say.trim()) errors.push(`${bw}: say is required.`);
      else if (b.say.length > MAX_SAY) errors.push(`${bw}: say is longer than ${MAX_SAY} characters.`);
      errors.push(...validateAction(b && b.action, ctx, bw));
    });
    if (s.checkpoint !== undefined && s.checkpoint !== null) {
      const c = s.checkpoint;
      if (typeof c.q !== 'string' || !c.q.trim()) errors.push(`${where}: checkpoint.q is required.`);
      if (!Array.isArray(c.options) || c.options.length < 2 || c.options.length > 4 || new Set(c.options).size !== c.options.length || c.options.some(o => typeof o !== 'string' || !o)) errors.push(`${where}: checkpoint needs 2-4 distinct string options.`);
      else if (!c.options.includes(c.answer)) errors.push(`${where}: checkpoint.answer must be one of its options.`);
      if (c.onWrong !== undefined && c.onWrong !== null && !ids.has(c.onWrong)) errors.push(`${where}: checkpoint.onWrong must name an existing scene id.`);
    }
  });
  return errors;
}

export function validateLesson(lesson) {
  if (!lesson || typeof lesson !== 'object') return ['lesson must be an object.'];
  const errors = [];
  if (typeof lesson.title !== 'string' || !lesson.title.trim()) errors.push('title is required.');
  if (!lesson.visual || !VISUAL_TYPES.includes(lesson.visual.type) || !Array.isArray(lesson.visual.data)) errors.push(`visual must be one of ${VISUAL_TYPES.join(', ')} with data.`);
  if (!lesson.trace || !Array.isArray(lesson.trace.steps) || !lesson.trace.steps.length) errors.push('trace.steps is required.');
  if (errors.length) return errors;
  return validateScenes(lesson.scenes, { visual: lesson.visual, traceLength: lesson.trace.steps.length });
}

// Numbers a sentence mentions. Used to stop narration from naming values that
// are not in the computed step it describes.
// A dash right after a digit is a range or an edge ("1-2"), not a minus sign.
export const numbersIn = text => (String(text).match(/(?<![\d.])-?\d+(?:\.\d+)?/g) || []).map(Number);
