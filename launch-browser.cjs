// Helper used by START.bat.
//
//   node launch-browser.cjs --pick-port       -> prints "<port>" or "<port>:running"
//   node launch-browser.cjs --check-only      -> exit 0 if the picked port is already in use
//   node launch-browser.cjs --open-if-running -> open the browser only if NeuraLearn is up
//   node launch-browser.cjs                   -> wait until NeuraLearn answers, then open it
//
// Existing environment variables (set by START.bat) win over .env.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');

const env = { ...process.env };
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !match[1].startsWith('#') && env[match[1]] === undefined) {
      env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch { /* .env is optional; the server reports missing API keys itself. */ }

const FALLBACK_PORTS = [3006, 3007, 3008, 3009, 3010];

function parsePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null;
}

const requestedPort = parsePort(env.PORT) || 3003;
const port = parsePort(commandLinePort()) || requestedPort;

function commandLinePort() {
  const arg = process.argv.find(a => a.startsWith('--port='));
  return arg ? arg.slice('--port='.length) : '';
}

function base(portNumber) {
  return `http://localhost:${portNumber}/`;
}

async function isReady(portNumber) {
  try {
    const response = await fetch(base(portNumber), { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch { return false; }
}

async function isNeuraLearn(portNumber) {
  try {
    const response = await fetch(`${base(portNumber)}api/health`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return false;
    const body = await response.json();
    return !!body && body.ok === true;
  } catch { return false; }
}

function isPortInUse(portNumber) {
  return new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port: portNumber });
    socket.setTimeout(700);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => resolve(false));
  });
}

function openBrowser(portNumber) {
  const command = process.env.ComSpec || 'cmd.exe';
  const child = spawn(command, ['/d', '/s', '/c', `start "" "${base(portNumber)}"`], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
}

async function pickPort() {
  if (!await isPortInUse(port)) return { port, running: false };
  if (await isNeuraLearn(port)) return { port, running: true };
  for (const candidate of FALLBACK_PORTS) {
    if (candidate === port) continue;
    if (!await isPortInUse(candidate)) return { port: candidate, running: false };
  }
  return { port: null, running: false };
}

async function main() {
  if (process.argv.includes('--pick-port')) {
    const result = await pickPort();
    if (result.port === null) {
      console.error('Ports 3003 and 3006-3010 are all busy. Close the other servers and try again.');
      process.exitCode = 1;
      return;
    }
    console.log(result.running ? `${result.port}:running` : `${result.port}`);
    return;
  }

  if (process.argv.includes('--check-only')) {
    process.exitCode = await isPortInUse(port) ? 0 : 1;
    return;
  }

  if (process.argv.includes('--open-if-running')) {
    if (!await isNeuraLearn(port)) process.exit(1);
    openBrowser(port);
    return;
  }

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await isReady(port)) {
      openBrowser(port);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  console.error(`NeuraLearn did not start at ${base(port)} within 180 seconds.`);
  process.exitCode = 1;
}

main().catch(error => {
  console.error('Could not open NeuraLearn in the browser:', error.message);
  process.exitCode = 1;
});
