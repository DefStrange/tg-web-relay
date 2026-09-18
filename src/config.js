require('dotenv').config();
const { URL } = require('url');

const PORT = parseInt(process.env.PORT || '5050', 10);
const PUBLIC_DOMAIN = (process.env.PUBLIC_DOMAIN || 'https://gram.defstrange.ru').replace(/\/$/, '');
const TELEGRAM_ROOT = (process.env.TELEGRAM_ROOT || 'https://web.telegram.org').replace(/\/$/, '');

const publicHost = new URL(PUBLIC_DOMAIN).host;
const telegramHost = new URL(TELEGRAM_ROOT).host;

const KNOWN_HOSTS = new Set([
  'web.telegram.org',
  'telegram.org',
  'www.telegram.org',
  'telegram-cdn.org',
  'cdn-telegram.org',
  't.me',
  'telegram.me',
  'telegra.ph',
  'td.telegram.org',
  'pluto.web.telegram.org',
  'venus.web.telegram.org',
  'flora.web.telegram.org',
  'aurora.web.telegram.org',
  'vesta.web.telegram.org',
]);

function isTelegramHost(host) {
  if (!host) return false;
  host = host.toLowerCase();
  if (KNOWN_HOSTS.has(host)) return true;
  return /(^|\.)telegram(-cdn)?\.org$/.test(host) ||
    /(^|\.)cdn-telegram\./.test(host) ||
    /(^|\.)web\.telegram\.org$/.test(host) ||
    host === 't.me' || host.endsWith('.t.me');
}

function parseProxyWsPath(urlPath) {
  const m = /^\/proxy-ws\/([^\/]+)(\/.*)?$/.exec(urlPath.split('?')[0]);
  if (!m) return null;
  const qIndex = urlPath.indexOf('?');
  const query = qIndex >= 0 ? urlPath.slice(qIndex) : '';
  return { targetHost: m[1], targetPath: (m[2] || '/') + query };
}

module.exports = {
  PORT,
  PUBLIC_DOMAIN,
  publicHost,
  TELEGRAM_ROOT,
  telegramHost,
  isTelegramHost,
  parseProxyWsPath,
};
