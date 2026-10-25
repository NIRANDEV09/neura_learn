// Netlify entry point: turns a web Request into the small part of Node's
// req/res that server.mjs uses, so Netlify runs exactly the same code as the
// local server. The response body is a stream, so streamed answers (the
// explanation's NDJSON) reach the browser as they are written.
import { Readable } from 'node:stream';
import { requestHandler } from '../server.mjs';

// Netlify stops synchronous and streaming functions after 60 seconds; leave
// room to send a clear error before that.
const TIME_LIMIT_MS = Number(process.env.NL_TIME_LIMIT_MS || 55_000);
const NO_BODY = new Set([101, 204, 205, 304]);
const bytes = chunk => typeof chunk === 'string' ? new TextEncoder().encode(chunk) : new Uint8Array(chunk);

export default async function netlifyHandler(request) {
  const url = new URL(request.url);
  const hasBody = !['GET', 'HEAD'].includes(request.method);
  const body = hasBody ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);
  const req = Object.assign(Readable.from(body.length ? [body] : []), {
    method: request.method,
    url: url.pathname + url.search,
    headers: Object.fromEntries(request.headers),
  });

  return new Promise(resolve => {
    let controller, status = 200, headers = {}, started = false, ended = false;
    const stream = new ReadableStream({ start(c) { controller = c; } });
    const start = () => {
      if (started) return;
      started = true;
      const h = new Headers();
      for (const [k, v] of Object.entries(headers)) if (v !== undefined) h.set(k, String(v));
      resolve(new Response(NO_BODY.has(status) ? null : stream, { status, headers: h }));
    };
    const res = {
      get headersSent() { return started; },
      writeHead(code, extra = {}) { status = code; headers = { ...headers, ...extra }; start(); return res; },
      setHeader(k, v) { headers[k.toLowerCase()] = v; },
      write(chunk) { start(); if (!ended && chunk != null) controller.enqueue(bytes(chunk)); return true; },
      end(chunk) {
        start();
        if (ended) return res;
        if (chunk != null) controller.enqueue(bytes(chunk));
        ended = true;
        controller.close();
        return res;
      },
    };
    Promise.resolve(requestHandler(req, res, { timeLimitMs: TIME_LIMIT_MS })).catch(e => {
      if (!started) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(started ? '' : JSON.stringify({ error: e.message || 'Unexpected server error.' }));
    });
  });
}
