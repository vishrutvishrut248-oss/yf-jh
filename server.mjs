import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(__dirname, 'dist')
const PORT = Number(process.env.PORT || 5173)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.ttf':  'font/ttf',
  '.webp': 'image/webp',
}

function send(res, code, body, type = 'text/plain', headers = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*', ...headers })
  res.end(body)
}

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0])
  if (urlPath === '/') urlPath = '/index.html'

  const filePath = path.normalize(path.join(DIST, urlPath))
  if (!filePath.startsWith(DIST)) return send(res, 403, 'Forbidden')

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      return fs.readFile(path.join(DIST, 'index.html'), (e2, d2) => {
        if (e2) return send(res, 404, 'Not found')
        send(res, 200, d2, MIME['.html'])
      })
    }
    const ext = path.extname(filePath).toLowerCase()
    send(res, 200, data, MIME[ext] || 'application/octet-stream', {
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
  })
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`arcin static server listening on http://0.0.0.0:${PORT}`)
})
