const cheerio = require('cheerio');
const config = require('./config');

const { publicHost, isTelegramHost } = config;

function rewriteAbsoluteUrl(url, isWsContext) {
  if (!url || typeof url !== 'string') return url;
  url = url.trim();
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('#')) return url;

  if (url.startsWith('//')) {
    try {
      const u = new URL('https:' + url);
      if (!isTelegramHost(u.host)) return url;
      const ws = isWsContext || u.protocol === 'wss:';
      const scheme = ws ? 'wss://' : 'https://';
      return scheme + publicHost + (ws ? '/proxy-ws/' : '/proxy/') + u.host + u.pathname + u.search + u.hash;
    } catch { return url; }
  }

  if (/^(https?|wss?):\/\//i.test(url)) {
    try {
      const u = new URL(url);
      if (!isTelegramHost(u.host)) return url;
      const isWs = u.protocol === 'wss:' || u.protocol === 'ws:' || isWsContext;
      const scheme = isWs ? 'wss://' : 'https://';
      const prefix = isWs ? '/proxy-ws/' : '/proxy/';
      return scheme + publicHost + prefix + u.host + u.pathname + u.search + u.hash;
    } catch { return url; }
  }
  return url;
}

function rewriteSrcset(srcset) {
  if (!srcset) return srcset;
  return srcset.split(',').map((part) => {
    const tokens = part.trim().split(/\s+/);
    if (!tokens[0]) return part;
    tokens[0] = rewriteAbsoluteUrl(tokens[0]);
    return tokens.join(' ');
  }).join(', ');
}

function rewriteCssText(css) {
  if (!css) return css;
  css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, inner) => {
    const t = inner.trim();
    if (t.startsWith('data:') || t.startsWith('blob:') || t.startsWith('#')) return m;
    if (/^(https?:)?\/\//i.test(t)) {
      return `url(${q}${rewriteAbsoluteUrl(t)}${q})`;
    }
    return m;
  });
  css = css.replace(/@import\s+(['"])((?:https?:)?\/\/[^'"]+)\1/gi, (m, q, u) => {
    return `@import ${q}${rewriteAbsoluteUrl(u)}${q}`;
  });
  return css;
}

function rewriteJsText(js) {
  if (!js) return js;
  js = js.replace(/(['"`])((?:https?:\/\/|\/\/)[a-z0-9.-]*(?:telegram[a-z0-9.-]*\.org|t\.me|telegram\.me)(?:\/[^'"`\s)\\]*)?)\1/gi,
    (m, q, u) => `${q}${rewriteAbsoluteUrl(u)}${q}`);
  js = js.replace(/(['"`])((?:wss?:\/\/|\/\/)[a-z0-9.-]*(?:telegram[a-z0-9.-]*\.org|t\.me)(?:\/[^'"`\s)\\]*)?)\1/gi,
    (m, q, u) => `${q}${rewriteAbsoluteUrl(u, true)}${q}`);
  return js;
}

const URL_ATTRS = ['src', 'href', 'action', 'poster', 'data-src', 'data-href', 'content'];

function rewriteHtml(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $('meta[http-equiv]').each((_, el) => {
    const v = ($(el).attr('http-equiv') || '').toLowerCase();
    if (v === 'content-security-policy' || v === 'content-security-policy-report-only') {
      $(el).remove();
    }
  });

  $('*').each((_, el) => {
    const attribs = el.attribs || {};
    for (const name of Object.keys(attribs)) {
      const lower = name.toLowerCase();
      if (URL_ATTRS.includes(lower)) {
        if (lower === 'content') {
          const v = attribs[name];
          if (/^(https?:)?\/\//i.test(v)) $(el).attr(name, rewriteAbsoluteUrl(v));
          continue;
        }
        $(el).attr(name, rewriteAbsoluteUrl(attribs[name]));
      } else if (lower === 'srcset') {
        $(el).attr(name, rewriteSrcset(attribs[name]));
      } else if (lower === 'style') {
        $(el).attr(name, rewriteCssText(attribs[name]));
      }
    }
  });

  $('style').each((_, el) => {
    const inner = $(el).html();
    if (inner) $(el).text(rewriteCssText(inner));
  });

  $('script:not([src])').each((_, el) => {
    const inner = $(el).html();
    if (inner && !el.attribs['data-proxy-skip']) $(el).text(rewriteJsText(inner));
  });

  $('script[src]').each((_, el) => {
    $(el).attr('src', rewriteAbsoluteUrl($(el).attr('src')));
  });
  $('link[href]').each((_, el) => {
    $(el).attr('href', rewriteAbsoluteUrl($(el).attr('href')));
  });

  const head = $('head');
  if (head.length) {
    head.prepend('<script src="/__proxy__/client-patch.js" data-proxy-skip="1"></script>');
  }

  return $.html();
}

module.exports = {
  rewriteAbsoluteUrl,
  rewriteSrcset,
  rewriteCssText,
  rewriteJsText,
  rewriteHtml,
};
