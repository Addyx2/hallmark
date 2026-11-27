// Tiny dependency-free static server for the Pascaal Console UI preview.
// This is a UI prototype: no auth backend, no API, no database.

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';

const FILES = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/app.js', 'app.js'],
  ['/llms.txt', 'llms.txt'],
  ['/llms-full.txt', 'llms-full.txt'],
  ['/agent', 'agent/index.html'],
  ['/agent/', 'agent/index.html'],
  ['/agent/index.html', 'agent/index.html'],
]);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

/** Create the static console server. Exported so tests can bind port 0. */
export function createConsole({ port = 4320 } = {}) {
  const server = http.createServer(async (req, res) => {
    const path = (req.url || '/').split('?')[0];
    const file = FILES.get(path);

    if (!file || req.method !== 'GET') {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ error: 'not_found', path }));
      return;
    }

    try {
      const body = await readFile(new URL(file, import.meta.url));
      res.statusCode = 200;
      res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
      res.end(body);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'read_failed', detail: String(err && err.message || err) }));
    }
  });

  return {
    server,
    start: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => resolve(server.address().port));
    }),
    close: () => new Promise((resolve, reject) => {
      server.close((err) => err ? reject(err) : resolve());
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createConsole();
  const boundPort = await app.start();
  process.stdout.write(`Pascaal Console UI preview: http://127.0.0.1:${boundPort}/\n`);
  process.stdout.write(`Agent brief: http://127.0.0.1:${boundPort}/agent/\n`);
  process.stdout.write('UI only. No auth backend, database, keys or billing.\n');
}
