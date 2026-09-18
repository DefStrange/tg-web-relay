function workerScopePatch() {
  'use strict';
  var CREATOR_HOST = '__CREATOR_HOST__';
  var CREATOR_PROTO = '__CREATOR_PROTO__';
  var PROXY_BASE = '__PROXY_BASE__';

  function isTgHost(host) {
    if (!host) return false;
    host = String(host).toLowerCase();
    if (host.slice(-13) === '.telegram.org') return true;
    if (host.slice(-17) === '.telegram-cdn.org') return true;
    if (host.indexOf('cdn-telegram.') >= 0) return true;
    return host === 't.me' || host.slice(-5) === '.t.me' || host.slice(-12) === 'telegram.me';
  }
  function proxied(input, isWs) {
    try {
      var u = new URL(input, PROXY_BASE);
      if (u.host === CREATOR_HOST && (u.pathname.indexOf('/proxy/') === 0 || u.pathname.indexOf('/proxy-ws/') === 0)) {
        return u.toString();
      }
      if (!isTgHost(u.host)) return u.toString();
      var ws = isWs || u.protocol === 'wss:' || u.protocol === 'ws:';
      var prefix = ws ? '/proxy-ws/' : '/proxy/';
      var scheme = ws ? (CREATOR_PROTO === 'https:' ? 'wss://' : 'ws://') : CREATOR_PROTO + '//';
      return scheme + CREATOR_HOST + prefix + u.host + u.pathname + u.search + u.hash;
    } catch (e) { return input; }
  }
  try {
    var of = self.fetch;
    if (of) {
      self.fetch = function (input, init) {
        if (typeof input === 'string') input = proxied(input, false);
        else if (typeof URL !== 'undefined' && input instanceof URL) input = proxied(input.toString(), false);
        else if (typeof Request !== 'undefined' && input instanceof Request) {
          input = new Request(proxied(input.url, false), input);
        }
        return of.call(this, input, init);
      };
    }
  } catch (e) {}
  try {
    if (typeof XMLHttpRequest !== 'undefined') {
      var oo = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function (m, url) {
        if (typeof url === 'string') url = proxied(url, false);
        else if (typeof URL !== 'undefined' && url instanceof URL) url = proxied(url.toString(), false);
        return oo.apply(this, [m, url].concat([].slice.call(arguments, 2)));
      };
    }
  } catch (e) {}
  try {
    var OWS = self.WebSocket;
    if (OWS) {
      self.WebSocket = function (url, protocols) {
        if (typeof url === 'string') url = proxied(url, true);
        else if (typeof URL !== 'undefined' && url instanceof URL) url = proxied(url.toString(), true);
        return protocols ? new OWS(url, protocols) : new OWS(url);
      };
      self.WebSocket.prototype = OWS.prototype;
    }
  } catch (e) {}
  try {
    var ois = self.importScripts;
    if (ois) {
      self.importScripts = function () {
        var args = [].map.call(arguments, function (u) {
          return typeof u === 'string' ? proxied(u, false) : u;
        });
        try {
          return ois.apply(this, args);
        } catch (e) {
          if (e && e.message && e.message.indexOf('Module scripts') >= 0 && args.length) {
            return import(args[0]);
          }
          throw e;
        }
      };
    }
  } catch (e) {}
}

function buildWorkerPatch(creatorHost, creatorProto, proxyBase) {
  var src = workerScopePatch.toString();
  src = src.slice(src.indexOf('{') + 1, src.lastIndexOf('}'));
  return '"use strict";\n' + src
    .split('__CREATOR_HOST__').join(creatorHost)
    .split('__CREATOR_PROTO__').join(creatorProto)
    .split('__PROXY_BASE__').join(proxyBase);
}

function isWorkerScript(targetPath) {
  return /worker/i.test(targetPath);
}

module.exports = { buildWorkerPatch, isWorkerScript };
