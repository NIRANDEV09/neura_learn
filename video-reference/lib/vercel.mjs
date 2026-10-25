// Entry point for the Vercel functions in api/. Each one forwards the request to
// the local server's handler, so both deployments run exactly the same code.
import { requestHandler } from '../server.mjs';

export default function handler(req, res) {
  return requestHandler(req, res);
}
