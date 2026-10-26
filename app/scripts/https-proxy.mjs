#!/usr/bin/env node
/**
 * HTTPS front for the dev server so a WebXR headset on the LAN can open the app
 * (WebXR needs a secure context; plain http://<lan-ip>:3100 is not one).
 *
 *   node scripts/https-proxy.mjs [listenPort=3443] [target=http://127.0.0.1:3100]
 *
 * Uses the self-signed cert in certificates/ (cert.pem / key.pem). The headset browser warns once
 * ("connection not private"): choose Advanced → Proceed. Proxies plain requests and WebSocket
 * upgrades (Next HMR).
 */
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.argv[2] ?? 3443);
const target = new URL(process.argv[3] ?? 'http://127.0.0.1:3100');

const server = https.createServer(
  {
    key: fs.readFileSync(path.join(root, 'certificates/key.pem')),
    cert: fs.readFileSync(path.join(root, 'certificates/cert.pem')),
  },
  (req, res) => {
    const up = http.request(
      { host: target.hostname, port: target.port, method: req.method, path: req.url, headers: req.headers },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    up.on('error', (e) => {
      res.writeHead(502);
      res.end(`proxy error: ${e.message}`);
    });
    req.pipe(up);
  },
);

server.on('upgrade', (req, socket, head) => {
  const up = net.connect(Number(target.port), target.hostname, () => {
    const headers = Object.entries(req.headers).map(([k, v]) => `${k}: ${v}`).join('\r\n');
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head.length) up.write(head);
    up.pipe(socket).pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(port, '0.0.0.0', () => console.log(`https://0.0.0.0:${port} → ${target.href}`));
