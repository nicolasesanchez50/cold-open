// Cold-Open demo server — zero-dependency Node http server.
// Serves a single-page UI and a /api/leads?brand=X endpoint.
// Usage: node src/web/server.mjs [port]   (default 3737)

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../agent/coldopen.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] || process.env.PORT || 3737);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname === '/api/leads') {
    const brand = (url.searchParams.get('brand') || '').trim();
    const category = (url.searchParams.get('category') || '').trim() || undefined;
    if (!brand) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'brand query param required' }));
      return;
    }
    try {
      const result = await run(brand, { subjectCategory: category });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: String(e.message || e) }));
    }
    return;
  }

  if (url.pathname === '/' || url.pathname === '/index.html') {
    const html = await readFile(path.join(__dirname, 'index.html'), 'utf8');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`cold-open demo: http://localhost:${PORT}`);
});
