#!/usr/bin/env node

'use strict';

const express = require('express');
const fs = require('fs');
const net = require('net');
const path = require('path');
const puppeteer = require('puppeteer');
const { QRMonitorManager, parsePort } = require('./src/qr/monitor-core');

const ROOT_DIR = __dirname;
const DASHBOARD_HTML = path.join(ROOT_DIR, 'qr-dashboard.html');
const SERVER_PORT = parsePort(process.env.QR_DASHBOARD_PORT, 3000);
const DEBUG_PORT_BASE = parsePort(process.env.QR_DASHBOARD_DEBUG_PORT_BASE, 9222);
const MONITOR_PORT_BASE = parsePort(process.env.QR_DASHBOARD_MONITOR_PORT_BASE, 3999);
const SESSION_TTL_MS = Number(process.env.QR_DASHBOARD_SESSION_TTL_MS || 5 * 60 * 1000);
const DEFAULT_DOMAIN = String(process.env.QR_DASHBOARD_DEFAULT_DOMAIN || 'jd.com').trim().toLowerCase();
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const BROWSER_HEADLESS = (() => {
  const value = String(process.env.QR_DASHBOARD_HEADLESS || '1').trim().toLowerCase();
  return ['0', 'false', 'no'].includes(value) ? false : 'new';
})();
const LOCAL_CHROME_CANDIDATES = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  win32: [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium'],
};
const TARGET_URL_OVERRIDES = {
  'jd.com': 'https://www.jd.com/',
};

const app = express();
const manager = new QRMonitorManager({ rootDir: ROOT_DIR });
const sessions = new Map();
const pendingSessions = new Map();

app.use(express.json());

function detectLocalChromeExecutable() {
  const candidates = LOCAL_CHROME_CANDIDATES[process.platform] || [];
  for (const executablePath of candidates) {
    if (executablePath && fs.existsSync(executablePath)) {
      return executablePath;
    }
  }
  return '';
}

function normalizeDomain(rawValue) {
  let value = String(rawValue || '').trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '');
  value = value.replace(/[/?#].*$/, '');
  value = value.replace(/^www\./, '');
  return value;
}

function assertDomain(domain) {
  const cleanDomain = normalizeDomain(domain);
  if (!cleanDomain || !/^[a-z0-9.-]+$/.test(cleanDomain) || !cleanDomain.includes('.')) {
    throw new Error(`Invalid domain: ${domain}`);
  }
  return cleanDomain;
}

function toSessionId(domain) {
  return `dashboard-${domain.replace(/[^a-z0-9.-]+/g, '-').slice(0, 40)}`;
}

function resolveTargetUrl(domain) {
  const cleanDomain = assertDomain(domain);
  return TARGET_URL_OVERRIDES[cleanDomain] || `https://${cleanDomain}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendSse(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort, takenPorts) {
  for (let port = startPort; port < startPort + 200; port += 1) {
    if (takenPorts.has(port)) {
      continue;
    }
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`Unable to find an open port starting from ${startPort}`);
}

function getTakenPorts(key) {
  const ports = new Set();
  for (const entry of sessions.values()) {
    if (entry[key]) {
      ports.add(entry[key]);
    }
  }
  return ports;
}

function deriveLoginStatus(state, reason = '') {
  if (reason === 'timeout') {
    return 'timeout';
  }
  if (state.status === 'logged_in') {
    return 'logged_in';
  }
  const text = `${state.status || ''} ${state.message || ''}`.toLowerCase();
  if (text.includes('scanned') || text.includes('已扫描') || text.includes('待确认') || text.includes('confirm')) {
    return 'scanned';
  }
  return 'waiting';
}

function buildPayload(entry, overrides = {}) {
  const qrPayload = entry.session.getCurrentQrPayload();
  const loginStatus = overrides.loginStatus || deriveLoginStatus(qrPayload, overrides.reason || '');
  return {
    domain: entry.domain,
    targetUrl: entry.targetUrl,
    sessionId: entry.session.sessionId,
    loginStatus,
    status: qrPayload.status,
    message: overrides.message || qrPayload.message,
    connected: qrPayload.connected,
    qrAvailable: qrPayload.qrAvailable,
    qrDataUrl: qrPayload.qrDataUrl,
    qrPath: qrPayload.qrFile || '',
    qrHash: qrPayload.hash,
    pageUrl: qrPayload.pageUrl,
    debugPort: entry.debugPort,
    monitorPort: entry.monitorPort,
    refreshCount: qrPayload.refreshCount,
    qrAgeSec: qrPayload.qrAgeSec,
    lastError: qrPayload.lastError,
    lastUpdateAt: qrPayload.lastUpdateAt,
    expiresAt: new Date(entry.expiresAt).toISOString(),
  };
}

function broadcast(entry, event, payload) {
  for (const client of entry.clients) {
    try {
      sendSse(client, event, payload);
    } catch (_error) {
      entry.clients.delete(client);
    }
  }
}

function endClients(entry) {
  for (const client of entry.clients) {
    try {
      client.end();
    } catch (_error) {
      // noop
    }
  }
  entry.clients.clear();
}

function scheduleSessionExpiry(entry) {
  if (entry.expiryTimer) {
    clearTimeout(entry.expiryTimer);
  }
  entry.expiresAt = Date.now() + SESSION_TTL_MS;
  entry.expiryTimer = setTimeout(() => {
    void expireSession(entry.domain);
  }, SESSION_TTL_MS);
}


async function launchBrowserForDomain(domain, debugPort) {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || detectLocalChromeExecutable();
  const browser = await puppeteer.launch({
    headless: BROWSER_HEADLESS,
    defaultViewport: { width: 1440, height: 960 },
    executablePath: executablePath || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', `--remote-debugging-port=${debugPort}`],
  });

  const pages = await browser.pages();
  const page = pages[0] || (await browser.newPage());
  await page.setUserAgent(USER_AGENT);
  await page.goto(resolveTargetUrl(domain), {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  return browser;
}

function attachEntryListeners(entry) {
  entry.onStatus = (state) => {
    const payload = buildPayload(entry, {
      loginStatus: deriveLoginStatus(state),
    });
    broadcast(entry, 'login_status', payload);
  };

  entry.onQr = () => {
    broadcast(entry, 'qr_updated', buildPayload(entry));
  };

  entry.session.on('status', entry.onStatus);
  entry.session.on('qr', entry.onQr);
}

async function detachEntry(entry) {
  if (entry.expiryTimer) {
    clearTimeout(entry.expiryTimer);
    entry.expiryTimer = null;
  }
  if (entry.onStatus) {
    entry.session.off('status', entry.onStatus);
  }
  if (entry.onQr) {
    entry.session.off('qr', entry.onQr);
  }
  try {
    await manager.stopSession(entry.session.sessionId);
  } catch (_error) {
    // noop
  }
  try {
    if (entry.browser) {
      await entry.browser.close();
    }
  } catch (_error) {
    // noop
  }
  endClients(entry);
  sessions.delete(entry.domain);
}

async function expireSession(domain) {
  const entry = sessions.get(domain);
  if (!entry) {
    return;
  }
  const payload = buildPayload(entry, {
    reason: 'timeout',
    loginStatus: 'timeout',
    message: 'QR session timed out after 5 minutes',
  });
  broadcast(entry, 'login_status', payload);
  await wait(50);
  await detachEntry(entry);
}

async function createSession(domain) {
  const cleanDomain = assertDomain(domain);
  const debugPort = await findAvailablePort(DEBUG_PORT_BASE, getTakenPorts('debugPort'));
  const monitorPort = await findAvailablePort(MONITOR_PORT_BASE, getTakenPorts('monitorPort'));
  const browser = await launchBrowserForDomain(cleanDomain, debugPort);
  const session = await manager.startSession({
    sessionId: toSessionId(cleanDomain),
    targetDomain: cleanDomain,
    debugPort,
    monitorPort,
    pollIntervalMs: 1000,
    qrMaxAgeMs: 45000,
    qrRefreshCooldownMs: 3500,
  });

  const entry = {
    domain: cleanDomain,
    targetUrl: resolveTargetUrl(cleanDomain),
    session,
    browser,
    debugPort,
    monitorPort,
    clients: new Set(),
    expiryTimer: null,
    expiresAt: Date.now() + SESSION_TTL_MS,
    onStatus: null,
    onQr: null,
  };

  attachEntryListeners(entry);
  scheduleSessionExpiry(entry);
  sessions.set(cleanDomain, entry);
  return entry;
}

async function ensureSession(domain) {
  const cleanDomain = assertDomain(domain);
  const activeEntry = sessions.get(cleanDomain);
  if (activeEntry) {
    return activeEntry;
  }

  if (pendingSessions.has(cleanDomain)) {
    return pendingSessions.get(cleanDomain);
  }

  const createPromise = createSession(cleanDomain).finally(() => {
    pendingSessions.delete(cleanDomain);
  });
  pendingSessions.set(cleanDomain, createPromise);
  return createPromise;
}

async function withSession(req, res, next) {
  try {
    req.dashboardSession = await ensureSession(req.params.domain || req.query.domain || DEFAULT_DOMAIN);
    next();
  } catch (error) {
    res.status(500).json({
      error: String(error.message || error),
    });
  }
}

app.get('/', (_req, res) => {
  res.redirect(`/qr/${encodeURIComponent(DEFAULT_DOMAIN)}`);
});

app.get('/qr-dashboard.html', (_req, res) => {
  res.sendFile(DASHBOARD_HTML);
});

app.get('/qr/:domain', (_req, res) => {
  res.sendFile(DASHBOARD_HTML);
});

app.get('/api/qr/:domain', withSession, (req, res) => {
  res.json(buildPayload(req.dashboardSession));
});

app.get('/api/qr/:domain/image', withSession, (req, res) => {
  const buffer = req.dashboardSession.session.getCurrentQrBuffer();
  if (!buffer) {
    res.status(404).json({ error: 'QR image not ready yet' });
    return;
  }
  res.setHeader('Content-Type', 'image/png');
  res.end(buffer);
});

app.post('/api/qr/:domain/refresh', withSession, async (req, res) => {
  try {
    await req.dashboardSession.session.requestRefresh(true);
    res.json(buildPayload(req.dashboardSession));
  } catch (error) {
    res.status(500).json({
      error: String(error.message || error),
    });
  }
});

app.get('/events', async (req, res) => {
  try {
    const domain = req.query.domain || DEFAULT_DOMAIN;
    const entry = await ensureSession(domain);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    entry.clients.add(res);

    sendSse(res, 'login_status', buildPayload(entry));
    if (entry.session.getCurrentQrPayload().qrDataUrl) {
      sendSse(res, 'qr_updated', buildPayload(entry));
    }

    const heartbeat = setInterval(() => {
      try {
        res.write(': keep-alive\n\n');
      } catch (_error) {
        clearInterval(heartbeat);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeat);
      entry.clients.delete(res);
    });
  } catch (error) {
    res.status(500).json({
      error: String(error.message || error),
    });
  }
});

async function main() {
  app.listen(SERVER_PORT, () => {
    process.stdout.write(`[qr-dashboard] listening on http://127.0.0.1:${SERVER_PORT}/qr/${DEFAULT_DOMAIN}\n`);
  });
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`[qr-dashboard] startup failed: ${String(error.message || error)}\n`);
    process.exit(1);
  });
}

module.exports = {
  app,
};
