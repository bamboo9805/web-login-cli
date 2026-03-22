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
const SERVER_PORT = parsePort(process.env.QR_DASHBOARD_PORT || 3000);
const DEBUG_PORT_BASE = parsePort(process.env.QR_DASHBOARD_DEBUG_PORT_BASE || 9222);
const MONITOR_PORT_BASE = parsePort(process.env.QR_DASHBOARD_MONITOR_PORT_BASE || 3999);
const SESSION_TTL_MS = Number(process.env.QR_DASHBOARD_SESSION_TTL_MS || 5 * 60 * 1000);
const DEFAULT_DOMAIN = String(process.env.QR_DASHBOARD_DEFAULT_DOMAIN || 'jd.com').trim().toLowerCase();
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
function resolveHeadlessMode(rawValue = process.env.QR_DASHBOARD_HEADLESS || '1') {
  const value = String(rawValue).trim().toLowerCase();
  return ['0', 'false', 'no'].includes(value) ? false : 'new';
}
const BROWSER_HEADLESS = resolveHeadlessMode();

const LOCAL_CHROME_CANDIDATES = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
  win32: [
    path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google\\Chrome\\Application\\chrome.exe'),
  ],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium-browser', '/usr/bin/chromium'],
};

const JD_LOGIN_TARGETS = [
  'https://passport.jd.com/new/login.aspx',
  'https://plogin.m.jd.com/cgi-bin/m/login/login?appid=300&returnurl=https%3A%2F%2Fm.jd.com%2F',
  'https://plogin.jd.com/login/login',
  'https://www.jd.com/',
];

const JD_LOGIN_HOST_ALLOWLIST = [
  'jd.com',
  'www.jd.com',
  'm.jd.com',
  'passport.jd.com',
  'plogin.m.jd.com',
  'plogin.jd.com',
  'qr.m.jd.com',
];

const TARGET_URL_OVERRIDES = {
  'zhihu.com': 'https://www.zhihu.com/signin',
  'bilibili.com': 'https://passport.bilibili.com/login',
};

function toHostFromValue(rawValue) {
  const value = String(rawValue || '').trim().toLowerCase();
  if (!value) {
    return '';
  }
  if (value.includes('://')) {
    try {
      return new URL(value).hostname.toLowerCase();
    } catch (_error) {
      return '';
    }
  }
  return value.replace(/\/.*$/, '').replace(/:\d+$/, '').replace(/^www\./, '');
}

function getJdLoginTargets() {
  return [...JD_LOGIN_TARGETS];
}

function getJdLoginHostAllowlist() {
  return [...JD_LOGIN_HOST_ALLOWLIST];
}

function isAllowedJdLoginHost(rawValue) {
  const host = toHostFromValue(rawValue);
  if (!host) {
    return false;
  }
  if (JD_LOGIN_HOST_ALLOWLIST.includes(host)) {
    return true;
  }
  return host.endsWith('.jd.com');
}

function resolveJdTargetUrl() {
  return JD_LOGIN_TARGETS[0];
}

const app = express();
const manager = new QRMonitorManager({ rootDir: ROOT_DIR });
const sessions = new Map();
const activeRequests = new Map();

// SSE 连接管理
function sendSse(res, event, payload) {
  if (res.headersSent && !res.headersSent['Content-Type']) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.flushHeaders();
  }
  res.write(`event: ${event}\n`);
  if (payload) {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }
}

// 检测端口是否可用
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

// 查找可用端口
async function findAvailablePort(startPort, takenPorts) {
  for (let port = startPort; port < startPort + 200; port++) {
    if (takenPorts.has(port)) continue;
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(`No available ports found in range ${startPort}-${startPort + 199}`);
}

// 域名规范化
function normalizeDomain(rawValue) {
  let value = String(rawValue || '').trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '');
  value = value.replace(/[/?#].*$/, '');
  value = value.replace(/^www\./, '');
  return value;
}

// 域名验证
function assertDomain(domain) {
  const cleanDomain = normalizeDomain(domain);
  if (!cleanDomain || !/^[a-z0-9.-]+$/.test(cleanDomain) || !cleanDomain.includes('.')) {
    throw new Error(`Invalid domain: ${domain}`);
  }
  return cleanDomain;
}

// 生成会话 ID
function toSessionId(domain) {
  return `dashboard-${domain.replace(/[^a-z0-9.-]+/g, '-').slice(0, 40)}`;
}

// 解析目标 URL
function resolveTargetUrl(domain) {
  const cleanDomain = assertDomain(domain);
  if (cleanDomain === 'jd.com') {
    return resolveJdTargetUrl();
  }
  return TARGET_URL_OVERRIDES[cleanDomain] || `https://${cleanDomain}`;
}

// 等待函数
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 启动监控会话
async function startMonitorSession(domain) {
  const sessionId = toSessionId(domain);
  const debugPort = DEBUG_PORT_BASE + (sessions.size % 100);
  const targetUrl = resolveTargetUrl(domain);

  console.log(`[Dashboard] Starting monitor for ${domain} (session: ${sessionId})...`);
  console.log(`[Dashboard] Target URL: ${targetUrl}`);
  console.log(`[Dashboard] Debug port: ${debugPort}`);
  console.log(`[Dashboard] Monitor port: ${MONITOR_PORT_BASE + (sessions.size % 100)}`);

  const session = await manager.createSession({
    sessionId,
    targetDomain: domain,
    targetUrl,
    debugPort,
    monitorPort: MONITOR_PORT_BASE + (sessions.size % 100),
    ttl: SESSION_TTL_MS,
    timeoutMs: 180000,
  });

  sessions.set(sessionId, session);

  // 监听状态变化
  session.on('qr_updated', (data) => {
    console.log(`[Dashboard] QR updated: ${domain}`);
    forwardToAllClients(domain, 'qr_updated', data);
  });

  session.on('login_status', (data) => {
    console.log(`[Dashboard] Login status: ${domain} = ${data.status}`);
    forwardToAllClients(domain, 'login_status', data);
  });

  session.on('error', (err) => {
    console.error(`[Dashboard] Session error: ${domain}`, err);
    forwardToAllClients(domain, 'error', { error: err.message });
  });

  session.on('expired', () => {
    console.log(`[Dashboard] Session expired: ${domain}`);
    forwardToAllClients(domain, 'expired', null);
  });

  await session.start();
  console.log(`[Dashboard] Monitor started for ${domain}`);

  return session;
}

// 停止监控会话
async function stopMonitorSession(domain) {
  const sessionId = toSessionId(domain);
  const session = sessions.get(sessionId);

  if (!session) {
    throw new Error(`Session not found: ${domain}`);
  }

  console.log(`[Dashboard] Stopping monitor for ${domain}...`);
  await session.stop();
  sessions.delete(sessionId);

  forwardToAllClients(domain, 'stopped', null);
}

// 前端广播
function forwardToAllClients(domain, event, payload) {
  for (const [res, clientInfo] of activeRequests.values()) {
    if (clientInfo.domain === domain) {
      sendSse(res, event, payload);
    }
  }
}

// 获取会话状态
function getSessionState(domain) {
  const sessionId = toSessionId(domain);
  const session = sessions.get(sessionId);

  if (!session) {
    return { status: 'not_started' };
  }

  return session.getPublicState();
}

// 检查本地 Chrome
function detectLocalChromeExecutable() {
  const candidates = LOCAL_CHROME_CANDIDATES[process.platform] || [];
  for (const executablePath of candidates) {
    if (executablePath && fs.existsSync(executablePath)) {
      return executablePath;
    }
  }
  return '';
}

// Express 路由
app.get('/qr/:domain', async (req, res) => {
  const domain = req.params.domain?.toLowerCase();
  
  try {
    assertDomain(domain);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }

  const sessionId = toSessionId(domain);
  let session = sessions.get(sessionId);

  // 如果会话不存在，则创建新的
  if (!session || session.isStopped()) {
    console.log(`[Dashboard] Creating new session for ${domain}...`);
    session = await startMonitorSession(domain);
  }

  // 返回初始状态（如果二维码未准备好，返回等待状态）
  const state = session.getPublicState();

  // 设置 SSE 响应头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  res.write(`event: qr_ready\n`);
  res.write(`data: ${JSON.stringify(state)}\n\n`);

  // 记录客户端连接
  const clientId = Date.now().toString(36);
  activeRequests.set(clientId, { domain, res });
});

// SSE 连接端点
app.get('/events', async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const domain = url.searchParams.get('domain')?.toLowerCase();

  if (!domain) {
    res.status(400).send('Missing domain parameter');
    return;
  }

  try {
    assertDomain(domain);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 记录客户端连接
  const clientId = Date.now().toString(36);
  activeRequests.set(clientId, { domain, res });

  // 发送初始状态
  const state = getSessionState(domain);
  sendSse(res, 'qr_ready', state);

  req.on('close', () => {
    console.log(`[Dashboard] Client disconnected (domain: ${domain})`);
    activeRequests.delete(clientId);
  });
});

// 手动刷新二维码
app.post('/qr/:domain/refresh', async (req, res) => {
  const domain = req.params.domain?.toLowerCase();

  try {
    assertDomain(domain);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }

  const sessionId = toSessionId(domain);
  const session = sessions.get(sessionId);

  if (!session) {
    return res.status(400).json({ error: 'Session not found' });
  }

  console.log(`[Dashboard] Manual refresh requested for ${domain}`);
  
  // 请求刷新
  if (session.publicState) {
    await session.publicState.requestRefresh();
  }

  const state = session.getPublicState();
  sendSse(res, 'qr_updated', state);
});

// 停止监控
app.post('/qr/:domain/stop', async (req, res) => {
  const domain = req.params.domain?.toLowerCase();

  try {
    assertDomain(domain);
  } catch (err) {
    res.status(400).json({ error: err.message });
    return;
  }

  await stopMonitorSession(domain);

  res.json({ success: true, message: `Monitor stopped for ${domain}` });
});

// 健康检查
app.get('/health', (req, res) => {
  const managerState = manager.getPublicState();
  res.json({
    status: 'healthy',
    sessions: Array.from(sessions.keys()),
    managerState,
    timestamp: new Date().toISOString(),
  });
});

// 首页路由
app.get('/', (req, res) => {
  res.sendFile(DASHBOARD_HTML);
});

// 404 处理
app.use((req, res, next) => {
  res.status(404).json({ error: 'Not found' });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error('[Dashboard] Error:', err);
  res.status(500).json({ error: err.message });
});

// 启动服务器
async function startServer() {
  const serverPort = await findAvailablePort(SERVER_PORT, [MONITOR_PORT_BASE]);
  console.log(`[Dashboard] Starting on port ${serverPort}...`);

  app.listen(serverPort, '127.0.0.1', () => {
    console.log(`[Dashboard] Server running on http://127.0.0.1:${serverPort}`);
  });

  return serverPort;
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('QR Dashboard Server');
  console.log('========================================');
  console.log('');
  console.log(`[Dashboard] Config:`);
  console.log(`[Dashboard]   Server Port: ${SERVER_PORT}`);
  console.log(`[Dashboard]   Debug Port Base: ${DEBUG_PORT_BASE}`);
  console.log(`[Dashboard]   Monitor Port Base: ${MONITOR_PORT_BASE}`);
  console.log(`[Dashboard]   Session TTL: ${SESSION_TTL_MS / 1000}s`);
  console.log(`[Dashboard]   Default Domain: ${DEFAULT_DOMAIN}`);
  console.log(`[Dashboard]   Target URLs:`, TARGET_URL_OVERRIDES);
  console.log('');

  const chromePath = detectLocalChromeExecutable();
  const headless = BROWSER_HEADLESS;
  const browserArgs = chromePath
    ? [`--no-sandbox`, `--disable-setuid-sandbox`, `--headless=${headless}`, `--user-agent=${USER_AGENT}`]
    : [`--no-sandbox`, `--disable-setuid-sandbox`, `--headless=${headless}`, `--user-agent=${USER_AGENT}`];

  console.log(`[Dashboard] Chrome Path: ${chromePath || 'Default'}`);
  console.log(`[Dashboard] Headless: ${headless}`);

  try {
    await manager.initialize({
      chromePath,
      headless,
      args: browserArgs,
    });
  } catch (err) {
    console.error('[Dashboard] Failed to initialize QRMonitorManager:', err);
  }

  await startServer();

  console.log('');
  console.log('[Dashboard] Ready to serve requests!');
  console.log('');
  console.log('========================================');
  console.log('API Endpoints:');
  console.log('  GET  /qr/:domain       - Get QR code with SSE updates');
  console.log('  GET  /events?domain=X   - SSE stream for live updates');
  console.log('  POST /qr/:domain/refresh  - Manual refresh QR code');
  console.log('  POST /qr/:domain/stop     - Stop monitoring session');
  console.log('  GET  /health            - Health check');
  console.log('  GET  /                  - Dashboard UI');
  console.log('');
  console.log('Usage:');
  console.log('  QR_DASHBOARD_PORT=3000   # Server port (default 3000)');
  console.log('  QR_DASHBOARD_DEBUG_PORT_BASE=9222   # Debug port base (default 9222)');
  console.log('  QR_DASHBOARD_MONITOR_PORT_BASE=3999   # Monitor port base (default 3999)');
  console.log('  QR_DASHBOARD_SESSION_TTL_MS=300000   # Session TTL (default 5 minutes)');
  console.log('  QR_DASHBOARD_DEFAULT_DOMAIN=jd.com   # Default domain');
  console.log('');
}

module.exports = {
  normalizeDomain,
  assertDomain,
  resolveTargetUrl,
  resolveJdTargetUrl,
  isAllowedJdLoginHost,
  getJdLoginTargets,
  getJdLoginHostAllowlist,
  resolveHeadlessMode,
  TARGET_URL_OVERRIDES,
};

if (require.main === module) {
  main();
}
