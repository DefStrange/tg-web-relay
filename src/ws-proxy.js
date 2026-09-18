const WebSocket = require('ws');
const config = require('./config');

function attachWsProxy(httpServer) {
  const wss = new WebSocket.Server({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const urlPath = req.url || '/';
    let targetHost = null;
    let targetPath = null;

    const parsed = config.parseProxyWsPath(urlPath);
    if (parsed) {
      targetHost = parsed.targetHost;
      targetPath = parsed.targetPath;
    } else {
      targetHost = config.telegramHost;
      targetPath = urlPath;
      console.warn(`[ws] no /proxy-ws/ prefix, fallback to ${targetHost}${targetPath}`);
    }

    if (!config.isTelegramHost(targetHost)) {
      try { socket.destroy(); } catch {  }
      return;
    }

    wss.handleUpgrade(req, socket, head, (client) => {
      proxyConnection(client, req, targetHost, targetPath);
    });
  });
}

function proxyConnection(client, req, targetHost, targetPath) {
  const upstreamUrl = `wss://${targetHost}${targetPath}`;
  console.log(`[ws] ${req.socket.remoteAddress} -> ${upstreamUrl}`);

  const headers = {
    'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
    'Origin': config.TELEGRAM_ROOT,
  };
  if (req.headers['cookie']) headers['Cookie'] = req.headers['cookie'];

  const protoHeader = req.headers['sec-websocket-protocol'];
  const protocols = protoHeader ? protoHeader.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const upstream = protocols && protocols.length
    ? new WebSocket(upstreamUrl, protocols, { headers })
    : new WebSocket(upstreamUrl, { headers });

  const closeBoth = (code, reason) => {
    try { if (client.readyState === 1) client.close(code, reason); } catch {  }
    try { if (upstream.readyState === 1) upstream.close(code, reason); } catch {  }
  };

  const pending = [];
  upstream.on('open', () => {
    for (const [data, isBinary] of pending.splice(0)) {
      try { upstream.send(data, { binary: isBinary }); } catch {  }
    }
  });
  client.on('message', (data, isBinary) => {
    if (upstream.readyState === 1) upstream.send(data, { binary: isBinary });
    else if (upstream.readyState === 0) pending.push([data, isBinary]);
  });
  upstream.on('message', (data, isBinary) => {
    if (client.readyState === 1) client.send(data, { binary: isBinary });
  });
  client.on('close', (code, reason) => {
    try { if (upstream.readyState <= 1) upstream.close(code, reason); } catch {  }
  });
  upstream.on('close', (code, reason) => {
    console.log(`[ws] upstream closed ${upstreamUrl}: code=${code} reason=${reason}`);
    try { if (client.readyState <= 1) client.close(code, reason); } catch {  }
  });
  client.on('error', () => closeBoth(1011, 'client error'));
  upstream.on('error', (e) => {
    console.error(`[ws] upstream error ${upstreamUrl}: ${e.message}`);
    closeBoth(1011, 'upstream error');
  });
}

module.exports = { attachWsProxy };
