'use strict';
// Servidor estático de vista previa: npm start → http://127.0.0.1:4173 (solo local, sin dependencias).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const portIndex = process.argv.indexOf('--port');
const port = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 4173;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8' };
const server = http.createServer((req, res) => {
  let resource;
  try { resource = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Invalid URL'); return; }
  const file = path.resolve(root, '.' + (resource.endsWith('/') ? resource + 'index.html' : resource));
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some((part) => part.startsWith('.'))) {
    res.writeHead(403).end('Forbidden'); return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end('Method not allowed'); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
server.listen(port, '127.0.0.1', () => console.log('Local: http://127.0.0.1:' + port));
server.on('error', (error) => { console.error(error.message); process.exitCode = 1; });
