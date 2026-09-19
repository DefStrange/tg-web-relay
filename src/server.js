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

const AGREE_COOKIE = 'tgw_agree=1';
const AGREE_MAX_AGE = 365 * 24 * 3600 * 1000;

function wantsHtml(req) {
  const accept = req.headers.accept || '';
  return req.method === 'GET' && accept.includes('text/html');
}

function agreed(req) {
  const cookie = req.headers.cookie || '';
  return cookie.split(';').some((p) => p.trim() === AGREE_COOKIE);
}

function safeNext(value) {
  const next = String(value || '/a/');
  if (!next.startsWith('/') || next.startsWith('//')) return '/a/';
  return next;
}

function interstitialPage(target) {
  const next = encodeURIComponent(safeNext(target));
  return '<!DOCTYPE html>' +
    '<html lang="ru"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex,nofollow">' +
    '<title>tg-web-relay</title>' +
    '<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0e1621;color:#fff;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}main{max-width:560px;padding:32px}h1{font-size:24px;margin:0 0 16px}a{color:#5eb8f0}.btn{display:inline-block;margin-top:16px;padding:12px 24px;background:#2aabee;color:#fff !important;border-radius:8px;text-decoration:none;font-weight:600}p{line-height:1.6;color:#c9d4e0}</style>' +
    '</head><body><main>' +
    '<h1>tg-web-relay</h1>' +
    '<p>Это прокси-версия Telegram Web на сервере ' + config.publicHost + '. ' +
    'Оригинальный клиент находится здесь: <a href="https://web.telegram.org">web.telegram.org</a>.</p>' +
    '<p>Входя дальше, вы используете Telegram через посредника. ' +
    'Исходный код этого прокси открыт: <a href="https://github.com/DefStrange/tg-web-relay">GitHub</a>.</p>' +
    '<p><a class="btn" href="/__proxy__/agree?next=' + next + '">Продолжить к Telegram Web</a></p>' +
    '</main></body></html>';
}

app.get('/__proxy__/health', (req, res) => res.json({ ok: true, host: config.publicHost }));

app.get('/__proxy__/agree', (req, res) => {
  const next = safeNext(req.query.next);
  res.cookie('tgw_agree', '1', { maxAge: AGREE_MAX_AGE, path: '/', sameSite: 'lax', secure: true });
  res.redirect(302, next);
});

app.get('/__proxy__/client-patch.js', (req, res) => {
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.sendFile(path.join(__dirname, '..', 'public', 'client-patch.js'));
});

app.get('/robots.txt', (req, res) => {
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.send('User-agent: *\nDisallow: /\n');
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
  if (wantsHtml(req) && !agreed(req)) {
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.send(interstitialPage(req.originalUrl));
    return;
  }
  let targetPath = req.originalUrl.split('?')[0];
  if (!targetPath) targetPath = '/a/';
  handleProxy(req, res, config.telegramHost, targetPath).catch((e) => {
    console.error('[proxy] fatal root', e);
    if (!res.headersSent) res.status(500).send('proxy error');
  });
});

app.use((req, res, next) => {
  if (!req.path.startsWith('/proxy')) {
    if (wantsHtml(req) && !agreed(req) && !req.path.startsWith('/__proxy__/')) {
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.send(interstitialPage(req.originalUrl));
      return;
    }
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
