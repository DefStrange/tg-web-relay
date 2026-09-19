const { Readable } = require('stream');
const config = require('./config');
const rewriter = require('./rewriter');
const { buildWorkerPatch, isWorkerScript } = require('./workerPatch');

const STRIP_RESPONSE_HEADERS = new Set([
  'content-security-policy',
  'content-security-policy-report-only',
  'x-frame-options',
  'cross-origin-embedder-policy',
  'cross-origin-opener-policy',
  'cross-origin-resource-policy',
  'report-to',
  'nel',
  'content-length',
  'content-encoding',
]);

function buildUpstreamHeaders(incoming, targetHost) {
  const out = {};
  for (const [k, v] of Object.entries(incoming)) {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'connection' || lk === 'content-length') continue;
    if (lk === 'referer' || lk === 'origin') {
      out[k] = String(v).replace(config.publicHost, targetHost);
      continue;
    }
    if (lk === 'accept-encoding') continue;
    out[k] = v;
  }
  out['host'] = targetHost;
  if (!out['user-agent']) out['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
  return out;
}

function rewriteRedirectLocation(value) {
  if (!value) return value;
  if (/^(https?:)?\/\//i.test(value)) {
    const abs = value.startsWith('//') ? 'https:' + value : value;
    try {
      const u = new URL(abs);
      if (config.isTelegramHost(u.host)) {
        return `https://${config.publicHost}/proxy/${u.host}${u.pathname}${u.search}${u.hash}`;
      }
    } catch {  }
  }
  return value;
}

async function handleProxy(req, res, targetHost, targetPath) {
  const qsIndex = req.originalUrl.indexOf('?');
  let upstreamPath = targetPath;
  if (qsIndex >= 0 && !upstreamPath.includes('?')) {
    upstreamPath += req.originalUrl.slice(qsIndex);
  }
  const upstreamUrl = `https://${targetHost}${upstreamPath}`;

  const method = req.method;
  const headers = buildUpstreamHeaders(req.headers, targetHost);

  let body;
  if (!['GET', 'HEAD'].includes(method)) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = Buffer.concat(chunks);
    if (body.length === 0) body = undefined;
  }

  let upstream;
  try {
    upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body,
      redirect: 'manual',
    });
  } catch (e) {
    console.error(`[proxy] upstream error ${upstreamUrl}: ${e.message}`);
    res.status(502).send('Bad gateway: ' + e.message);
    return;
  }

  res.status(upstream.status);
  upstream.headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (STRIP_RESPONSE_HEADERS.has(lk)) return;
    if (lk === 'location') {
      res.setHeader('location', rewriteRedirectLocation(v));
      return;
    }
    if (lk === 'set-cookie') return;
    try { res.setHeader(k, v); } catch {  }
  });

  const setCookies = typeof upstream.headers.getSetCookie === 'function'
    ? upstream.headers.getSetCookie()
    : [];
  for (let c of setCookies) {
    c = c.replace(/;\s*Domain=[^;]*/gi, '');
    res.append('set-cookie', c);
  }

  res.setHeader('access-control-allow-origin', config.PUBLIC_DOMAIN);
  res.setHeader('access-control-allow-credentials', 'true');
  res.setHeader('x-relayed-by', 'tg-web-relay');

  if (upstream.status === 204 || upstream.status === 304 || method === 'HEAD') {
    res.end();
    return;
  }

  const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
  const isHtml = contentType.includes('text/html');
  const isJs = contentType.includes('javascript') || contentType.includes('ecmascript') || targetPath.endsWith('.js');
  const isCss = contentType.includes('text/css') || targetPath.endsWith('.css');

  if (!isHtml && !isJs && !isCss) {
    if (!res.getHeader('content-type') && contentType) res.setHeader('content-type', contentType);
    if (!upstream.body) {
      res.end();
      return;
    }
    try {
      Readable.fromWeb(upstream.body).on('error', () => {
        try { res.destroy(); } catch {  }
      }).pipe(res);
    } catch {
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.send(buf);
    }
    return;
  }

  const buf = Buffer.from(await upstream.arrayBuffer());

  try {
    if (isHtml) {
      const text = buf.toString('utf8');
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.send(rewriter.rewriteHtml(text, `https://${targetHost}${targetPath}`));
      return;
    }
    if (isJs) {
      const text = buf.toString('utf8');
      res.setHeader('content-type', 'application/javascript; charset=utf-8');
      let out = rewriter.rewriteJsText(text);
      if (isWorkerScript(targetPath)) {
        try {
          const dir = targetPath.slice(0, targetPath.lastIndexOf('/') + 1);
          const proxyBase = config.PUBLIC_DOMAIN + dir;
          out = buildWorkerPatch(config.publicHost, 'https:', proxyBase) + '\n;' + out;
        } catch (e) {
          console.error(`[proxy] worker patch error ${upstreamUrl}: ${e.message}`);
        }
      }
      res.send(out);
      return;
    }
    const text = buf.toString('utf8');
    res.setHeader('content-type', 'text/css; charset=utf-8');
    res.send(rewriter.rewriteCssText(text));
    return;
  } catch (e) {
    console.error(`[proxy] rewrite error ${upstreamUrl}: ${e.message}`);
  }

  if (!res.getHeader('content-type') && contentType) res.setHeader('content-type', contentType);
  res.send(buf);
}

module.exports = { handleProxy };
