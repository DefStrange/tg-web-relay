const path = require('path');
const http = require('http');
const express = require('express');
const morgan = require('morgan');

const config = require('./config');
const { handleProxy } = require('./proxy');
const { attachWsProxy } = require('./ws-proxy');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
app.use(morgan('combined'));

app.get('/__proxy__/health', (req, res) => res.json({ ok: true, host: config.publicHost }));

app.get('/__proxy__/client-patch.js', (req, res) => {
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.sendFile(path.join(__dirname, '..', 'public', 'client-patch.js'));
});

app.use('/proxy/:targetHost', (req, res) => {
  const targetHost = (req.params.targetHost || '').toLowerCase();
  if (!config.isTelegramHost(targetHost)) {
    res.status(403).send('forbidden host');
    return;
  }
  const prefix = `/proxy/${req.params.targetHost}`;
  let targetPath = req.originalUrl.slice(prefix.length);
  if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;
  const q = targetPath.indexOf('?');
  if (q >= 0) targetPath = targetPath.slice(0, q);
  handleProxy(req, res, req.params.targetHost, targetPath).catch((e) => {
    console.error('[proxy] fatal', e);
    if (!res.headersSent) res.status(500).send('proxy error');
  });
});

app.get('/', (req, res) => res.redirect(302, '/a/'));

const ROOT_PATHS = ['/k', '/a', '/k/*', '/a/*'];

app.use(ROOT_PATHS, (req, res, next) => {
  if (req.path.startsWith('/__proxy__/')) return next();
  if (req.path.startsWith('/proxy/') || req.path.startsWith('/proxy-ws/')) return next();
  let targetPath = req.originalUrl.split('?')[0];
  if (!targetPath) targetPath = '/a/';
  handleProxy(req, res, config.telegramHost, targetPath).catch((e) => {
    console.error('[proxy] fatal root', e);
    if (!res.headersSent) res.status(500).send('proxy error');
  });
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/proxy')) {
    const targetPath = req.originalUrl.split('?')[0] || '/';
    return handleProxy(req, res, config.telegramHost, targetPath).catch((e) => {
      console.error('[proxy] fatal fallback', e);
      if (!res.headersSent) res.status(500).send('proxy error');
    });
  }
  next();
});

const server = http.createServer(app);
attachWsProxy(server);

server.listen(config.PORT, () => {
  console.log(`[proxy] listening on :${config.PORT}`);
  console.log(`[proxy] public: ${config.PUBLIC_DOMAIN} -> upstream ${config.TELEGRAM_ROOT}`);
});
