(function () {
  'use strict';

  function isTelegramHost(host) {
    if (!host) return false;
    host = host.toLowerCase();
    if (host.endsWith('.telegram.org')) return true;
    if (host.endsWith('.telegram-cdn.org')) return true;
    if (host.indexOf('cdn-telegram.') >= 0) return true;
    return host === 't.me' || host.endsWith('.t.me') || host.endsWith('telegram.me');
  }

  function toProxied(input, isWs) {
    try {
      var u = new URL(input, location.href);
      if (u.host === location.host && (u.pathname.indexOf('/proxy/') === 0 || u.pathname.indexOf('/proxy-ws/') === 0)) {
        return u.toString();
      }
      if (!isTelegramHost(u.host)) return u.toString();
      var ws = isWs || u.protocol === 'wss:' || u.protocol === 'ws:';
      var prefix = ws ? '/proxy-ws/' : '/proxy/';
      var scheme = ws
        ? (location.protocol === 'https:' ? 'wss://' : 'ws://')
        : location.protocol + '//';
      return scheme + location.host + prefix + u.host + u.pathname + u.search + u.hash;
    } catch (e) {
      return input;
    }
  }

  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register = function () {
        console.warn('[proxy] ServiceWorker disabled under proxy');
        return Promise.reject(new Error('ServiceWorker disabled under proxy'));
      };
    }
  } catch (e) {}

  try {
    var origFetch = window.fetch;
    if (origFetch) {
      window.fetch = function (input, init) {
        if (typeof input === 'string') input = toProxied(input, false);
        else if (typeof URL !== 'undefined' && input instanceof URL) input = toProxied(input.toString(), false);
        else if (typeof Request !== 'undefined' && input instanceof Request) {
          input = new Request(toProxied(input.url, false), input);
        }
        return origFetch.call(this, input, init);
      };
    }
  } catch (e) {}

  try {
    var origOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (typeof url === 'string') url = toProxied(url, false);
      else if (typeof URL !== 'undefined' && url instanceof URL) url = toProxied(url.toString(), false);
      return origOpen.apply(this, [method, url].concat([].slice.call(arguments, 2)));
    };
  } catch (e) {}

  try {
    var OrigWS = window.WebSocket;
    if (OrigWS) {
      window.WebSocket = function (url, protocols) {
        if (typeof url === 'string') url = toProxied(url, true);
        else if (typeof URL !== 'undefined' && url instanceof URL) url = toProxied(url.toString(), true);
        return protocols ? new OrigWS(url, protocols) : new OrigWS(url);
      };
      window.WebSocket.prototype = OrigWS.prototype;
      window.WebSocket.CONNECTING = OrigWS.CONNECTING;
      window.WebSocket.OPEN = OrigWS.OPEN;
      window.WebSocket.CLOSING = OrigWS.CLOSING;
      window.WebSocket.CLOSED = OrigWS.CLOSED;
    }
  } catch (e) {}

  try {
    var OrigES = window.EventSource;
    if (OrigES) {
      window.EventSource = function (url, opts) {
        if (typeof url === 'string') url = toProxied(url, false);
        else if (typeof URL !== 'undefined' && url instanceof URL) url = toProxied(url.toString(), false);
        return new OrigES(url, opts);
      };
      window.EventSource.prototype = OrigES.prototype;
    }
  } catch (e) {}

  var WORKER_PATCH_SRC = '(' + function () {
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
          var s0 = isWs || u.protocol === 'wss:' || u.protocol === 'ws:';
          var sch0 = s0 ? (CREATOR_PROTO === 'https:' ? 'wss://' : 'ws://') : CREATOR_PROTO + '//';
          return sch0 + u.host + u.pathname + u.search + u.hash;
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
  }.toString() + ')();';

  function wrapWorkerScript(abs, opts) {
    var baseDir = abs.slice(0, abs.lastIndexOf('/') + 1);
    var patch = WORKER_PATCH_SRC
      .split('__CREATOR_HOST__').join(location.host)
      .split('__CREATOR_PROTO__').join(location.protocol)
      .split('__PROXY_BASE__').join(baseDir);
    var isModule = !!(opts && opts.type === 'module');
    var loader = isModule
      ? '\nawait import(' + JSON.stringify(abs) + ');'
      : '\nimportScripts(' + JSON.stringify(abs) + ');';
    var code = patch + loader;
    return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
  }

  function shouldWrapWorkerUrl(abs) {
    try {
      var u = new URL(abs);
      return u.host !== location.host && isTelegramHost(u.host);
    } catch (e) { return false; }
  }

  try {
    var OrigWorker = window.Worker;
    if (OrigWorker) {
      window.Worker = function (url, opts) {
        try {
          if (typeof url !== 'string') {
            if (typeof URL !== 'undefined' && url instanceof URL) url = url.toString();
            else return new OrigWorker(url, opts);
          }
          if (url.indexOf('blob:') === 0 || url.indexOf('data:') === 0) {
            return new OrigWorker(url, opts);
          }
          var abs = new URL(url, location.href).toString();
          if (!shouldWrapWorkerUrl(abs)) {
            return new OrigWorker(url, opts);
          }
          return new OrigWorker(wrapWorkerScript(abs, opts), opts);
        } catch (e) {
          return new OrigWorker(url, opts);
        }
      };
      window.Worker.prototype = OrigWorker.prototype;
    }
  } catch (e) {}

  try {
    var OrigShared = window.SharedWorker;
    if (OrigShared) {
      window.SharedWorker = function (url, opts) {
        try {
          if (typeof url !== 'string') {
            if (typeof URL !== 'undefined' && url instanceof URL) url = url.toString();
            else return new OrigShared(url, opts);
          }
          if (url.indexOf('blob:') === 0 || url.indexOf('data:') === 0) {
            return new OrigShared(url, opts);
          }
          var abs = new URL(url, location.href).toString();
          if (!shouldWrapWorkerUrl(abs)) {
            return new OrigShared(url, opts);
          }
          return new OrigShared(wrapWorkerScript(abs, opts), opts);
        } catch (e) {
          return new OrigShared(url, opts);
        }
      };
      window.SharedWorker.prototype = OrigShared.prototype;
    }
  } catch (e) {}
})();
