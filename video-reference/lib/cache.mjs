// Small in-memory cache for AI answers. Asking the same thing twice (replaying
// a lecture, a second student opening the same topic) is answered instantly
// instead of waiting for the model again. Lives as long as the server process,
// or the warm serverless instance.
export function memo(limit = 60) {
  const map = new Map();
  return {
    get(key) { if (!map.has(key)) return undefined; const v = map.get(key); map.delete(key); map.set(key, v); return v; },
    set(key, value) { map.set(key, value); while (map.size > limit) map.delete(map.keys().next().value); return value; },
  };
}
