'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const puppeteer = require('puppeteer');

const LOGIN_BUTTON_KEYWORDS = ['登录', '登錄', '登入', 'login', 'log in', 'sign in'];
const QR_TAB_KEYWORDS = ['扫码登录', '二维码登录', 'qr login', 'scan login'];
const QR_EXPIRED_KEYWORDS = ['二维码已失效', '已过期', 'expired', '失效'];
const QR_REFRESH_KEYWORDS = ['刷新', '点击刷新', '重新获取', '重试', 'refresh'];
const QR_HINT_KEYWORDS = ['扫码', '二维码', 'qr', 'qrcode', 'scan'];
const QR_SWITCH_SELECTORS = [];
const LOGIN_MODAL_SELECTORS = ['.douyin_login_new_class'];
const QR_CODE_SELECTORS = [
  'img[src*="qrcode"]',
  'img[src*="qr"]',
  'img[alt*="二维码"]',
  'img[alt*="QR"]',
  'canvas[class*="qr"]',
  'canvas[id*="qr"]',
  '[class*="qrcode"] img',
  '[class*="qr-code"] img',
  '[data-e2e*="qrcode"] img',
];

const SITE_KEYWORD_OVERRIDES = {
  'jianying.com': {
    loginButtonKeywords: ['登录', '注册', '开启', '立即开启', '开启创作', '开始创作', '马上体验'],
    qrTabKeywords: ['扫码登录', '二维码登录', '扫码', '二维码', '抖音扫码登录'],
    qrHintKeywords: ['扫码', '二维码', 'qr', 'qrcode', 'scan'],
  },
  'ctrip.com': {
    loginButtonKeywords: ['登录', '登录/注册', '立即登录', '去登录', '手机扫码登录'],
    qrTabKeywords: ['扫码登录', '二维码登录', '手机扫码登录', '扫码'],
    qrHintKeywords: ['扫码', '二维码', 'qr', 'qrcode', '携程', 'ctrip'],
    loginModalSelectors: ['.pc_login_container', '.lg_loginbox_modal', '.un_login_container'],
    qrCodeSelectors: [
      '.pc_login_container img',
      '.lg_loginbox_modal img',
      'img[src*="qrcode"]',
      'canvas[class*="qr"]',
    ],
  },
  'taobao.com': {
    loginButtonKeywords: ['登录', '亲，请登录', '请登录', '立即登录', '账户登录'],
    qrTabKeywords: ['扫码登录', '二维码登录', '手机扫码登录', '扫码'],
    qrHintKeywords: ['扫码', '二维码', 'qr', 'qrcode', '淘宝', 'taobao', '手机淘宝'],
    loginModalSelectors: ['.login-content', '.login-box', '.module-static', '.login-panel'],
    qrCodeSelectors: [
      '.module-quick img',
      '.qrcode-login img',
      'img[src*="qrcode"]',
      'canvas[class*="qr"]',
    ],
  },
  'goofish.com': {
    loginButtonKeywords: ['登录', '请登录', '去登录', '立即登录', '账号登录', '手机扫码登录'],
    qrTabKeywords: ['扫码登录', '二维码登录', '手机扫码登录', '扫码', '淘宝扫码登录'],
    qrHintKeywords: ['扫码', '二维码', 'qr', 'qrcode', '闲鱼', 'goofish', '淘宝'],
    loginModalSelectors: ['.login-content', '.login-box', '.module-static', '.login-panel', '.fish-login-dialog'],
    qrCodeSelectors: [
      '.module-quick img',
      '.qrcode-login img',
      '[class*="qr"] img',
      'img[src*="qrcode"]',
      'canvas[class*="qr"]',
    ],
  },
  'dianping.com': {
    loginButtonKeywords: ['登录', '登录/注册', '账号登录/注册', '立即登录', '去登录'],
    qrTabKeywords: ['扫码登录', '二维码登录', 'APP扫码登录', '扫码'],
    qrHintKeywords: ['扫码', '二维码', 'qr', 'qrcode', '大众点评', 'dianping', '美团'],
    loginModalSelectors: ['.login-dialog', '.login-form', '.passport-login-container', '.J-login-by-qrcode'],
    qrCodeSelectors: [
      '.J-login-by-qrcode .qrcode',
      '.J-login-by-qrcode [class*="qrcode"]',
      '.J-login-by-qrcode [class*="qr"]',
      '.login-form [class*="qrcode"]',
      '.login-form [class*="qr"]',
      'img[src*="qrcode"]',
      'img[src*="showqrcode"]',
      'canvas[class*="qr"]',
    ],
    qrSwitchSelectors: ['.scan-icon', '.J-qr-code-login', '.qrcode-tab', '.qr-tab'],
  },
  'yuanbao.tencent.com': {
    loginButtonKeywords: ['登录', '立即登录', '去登录', '账号登录', '腾讯登录', '微信登录'],
    qrTabKeywords: ['扫码登录', '二维码登录', '微信扫码登录', '扫码'],
    qrHintKeywords: ['扫码', '二维码', 'qr', 'qrcode', '元宝', '微信'],
    loginModalSelectors: ['.login-dialog', '.login-modal', '.login-panel', '[class*="login"]'],
    qrCodeSelectors: [
      '[class*="qrcode"] img',
      '[class*="qr-code"] img',
      '[class*="qr"] img',
      'img[src*="qrcode"]',
      'img[src*="qr"]',
      'canvas[class*="qr"]',
    ],
    qrSwitchSelectors: ['.scan-icon', '[class*="scan"]', '[class*="qrcode-tab"]', '[class*="qr-tab"]'],
  },
  'doubao.com': {
    loginButtonKeywords: ['登录', '立即登录', '去登录', '手机号登录', '账号登录', '抖音登录'],
    qrTabKeywords: ['扫码登录', '二维码登录', '抖音扫码登录', '扫码'],
    qrHintKeywords: ['扫码', '二维码', 'qr', 'qrcode', '豆包', '抖音'],
    loginModalSelectors: ['.login-modal', '.semi-modal-content', '.login-dialog', '[class*="login"]'],
    qrCodeSelectors: [
      '[class*="qrcode"] img',
      '[class*="qr-code"] img',
      '[class*="qr"] img',
      'img[src*="qrcode"]',
      'img[src*="qr"]',
      'canvas[class*="qr"]',
    ],
    qrSwitchSelectors: ['.scan-icon', '[class*="scan"]', '[class*="qrcode-tab"]', '[class*="qr-tab"]'],
  },
  'jd.com': {
    loginButtonKeywords: ['登录', '请登录', '你好，请登录', '登录/注册', '立即登录'],
    loginEntrySelectors: [
      '.link-login',
      '#ttbar-login .link-login',
      '.login-btn',
      '.J_login',
      'a[href*="passport.jd.com/new/login.aspx"]',
      'a[href*="passport.jd.com"]',
    ],
    qrTabKeywords: ['扫码登录', '二维码登录', '手机扫码登录', '扫码'],
    qrHintKeywords: ['扫码', '二维码', '京东', 'jd'],
    loginModalSelectors: [
      '.qrcode-login',
      '.login-form-border',
      '.login-new-wrap',
      '.login-form-bottom',
      '.login-form.login-form-l'
    ],
    qrCodeSelectors: [
      '#passport-main-qrcode-img',
      '.qrcode-img img',
      '.qrcode-main .qrcode-img img',
      'img[src*="qr.m.jd.com/show"]'
    ],
    qrSwitchSelectors: [],
    loginVerificationMarkers: {
      cookieNames: ['pt_key', 'pt_pin', 'thor', 'pin'],
      loginHosts: ['passport.jd.com', 'plogin.m.jd.com', 'plogin.jd.com'],
      loginPathPatterns: ['/new/login', '/login/login', '/cgi-bin/m/login/login'],
      domIndicators: [
        '#ttbar-login .nickname',
        '#ttbar-login [class*="nickname"]',
        '.userinfo .u-name',
        '.user-name',
        '.link-logout',
      ],
      successUrlPatterns: ['home.jd.com', 'order.jd.com', 'cart.jd.com', 'jd.com/member'],
    },
  },
};

function toFileSafeToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'site';
}

function parsePort(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function mergeKeywords(primary, fallback) {
  const merged = [...(primary || []), ...(fallback || [])];
  return Array.from(new Set(merged.filter(Boolean)));
}

function normalizeHost(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) {
    return '';
  }
  if (raw.includes('://')) {
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch (_error) {
      return '';
    }
  }
  return raw.replace(/\/.*/, '').replace(/:\d+$/, '').replace(/^www\./, '');
}

function isHostAllowed(host, allowlist = []) {
  const normalizedHost = normalizeHost(host);
  if (!normalizedHost) {
    return false;
  }
  for (const item of allowlist) {
    const normalizedItem = normalizeHost(item);
    if (!normalizedItem) {
      continue;
    }
    if (normalizedHost === normalizedItem || normalizedHost.endsWith(`.${normalizedItem}`)) {
      return true;
    }
  }
  return false;
}

function isJdDomain(value) {
  return isHostAllowed(value, ['jd.com']);
}

function resolveLoginEntryTelemetry(selectorResult, keywordResult) {
  if (selectorResult?.clicked) {
    return {
      path: 'selector',
      clicked: true,
      selector: selectorResult.selector || '',
      text: selectorResult.text || '',
      tag: selectorResult.tag || '',
    };
  }
  if (keywordResult?.clicked) {
    return {
      path: 'keyword',
      clicked: true,
      selector: '',
      text: keywordResult.text || '',
      tag: keywordResult.tag || '',
    };
  }
  return {
    path: 'none',
    clicked: false,
    selector: '',
    text: '',
    tag: '',
  };
}

function telemetryLine(event, payload = {}) {
  const suffix = Object.entries(payload)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${String(value).replace(/\s+/g, ' ').slice(0, 180)}`)
    .join(' ');
  if (suffix) {
    return `[telemetry] ${event} ${suffix}`;
  }
  return `[telemetry] ${event}`;
}

function getSiteKeywords(domain) {
  const clean = (domain || '').replace(/^www\./, '').toLowerCase();
  for (const [key, config] of Object.entries(SITE_KEYWORD_OVERRIDES)) {
    if (clean.includes(key) || key.includes(clean)) {
      return {
        loginButtonKeywords: mergeKeywords(config.loginButtonKeywords, LOGIN_BUTTON_KEYWORDS),
        loginEntrySelectors: mergeKeywords(config.loginEntrySelectors, []),
        qrTabKeywords: mergeKeywords(config.qrTabKeywords, QR_TAB_KEYWORDS),
        qrHintKeywords: mergeKeywords(config.qrHintKeywords, QR_HINT_KEYWORDS),
        loginModalSelectors: mergeKeywords(config.loginModalSelectors, LOGIN_MODAL_SELECTORS),
        qrCodeSelectors: mergeKeywords(config.qrCodeSelectors, QR_CODE_SELECTORS),
        qrSwitchSelectors: mergeKeywords(config.qrSwitchSelectors, QR_SWITCH_SELECTORS),
        loginVerificationMarkers: config.loginVerificationMarkers || null,
      };
    }
  }
  return {
    loginButtonKeywords: LOGIN_BUTTON_KEYWORDS,
    loginEntrySelectors: [],
    qrTabKeywords: QR_TAB_KEYWORDS,
    qrHintKeywords: QR_HINT_KEYWORDS,
    loginModalSelectors: LOGIN_MODAL_SELECTORS,
    qrCodeSelectors: QR_CODE_SELECTORS,
    qrSwitchSelectors: QR_SWITCH_SELECTORS,
    loginVerificationMarkers: null,
  };
}

function toTimestampFilename(targetDomain, monitorPort) {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `qr-${toFileSafeToken(targetDomain)}-${monitorPort}-${yyyy}${mm}${dd}-${hh}${mi}${ss}.png`;
}

function buildDefaultQrFilename(targetDomain, monitorPort) {
  if (monitorPort === 3999) {
    return 'qr-current.png';
  }
  return `qr-current-${toFileSafeToken(targetDomain)}-${monitorPort}.png`;
}

function localIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const key of Object.keys(nets)) {
    for (const addr of nets[key] || []) {
      if (addr.family === 'IPv4' && !addr.internal) {
        ips.push(addr.address);
      }
    }
  }
  return ips;
}

function createSessionId(targetDomain) {
  const safeDomain = toFileSafeToken(targetDomain).slice(0, 32);
  const suffix = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`).slice(0, 12);
  return `${safeDomain}-${suffix}`;
}

class QRMonitorSession extends EventEmitter {
  constructor(options = {}) {
    super();

    const rootDir = options.rootDir || process.cwd();
    this.sessionId = options.sessionId || createSessionId(options.targetDomain || 'douyin.com');
    this.targetDomain = (options.targetDomain || 'douyin.com').toLowerCase();
    this.monitorPort = parsePort(options.monitorPort, 3999);
    this.debugPort = parsePort(options.debugPort, 9222);

    this.pollIntervalMs = Number(options.pollIntervalMs || 1000);
    this.qrMaxAgeMs = Number(options.qrMaxAgeMs || 45000);
    this.qrRefreshCooldownMs = Number(options.qrRefreshCooldownMs || 3500);
    this.minQrScore = Number(options.minQrScore || 6);

    this.sessionDir = options.sessionDir || path.join(rootDir, '.web-login-cli', 'sessions');
    this.logDir = options.logDir || path.join(rootDir, 'logs');

    const defaultQrFile = buildDefaultQrFilename(this.targetDomain, this.monitorPort);
    const qrFileName = options.qrFile || defaultQrFile;
    this.currentQrFile = path.isAbsolute(qrFileName) ? qrFileName : path.join(this.logDir, qrFileName);

    this.siteKeywords = getSiteKeywords(this.targetDomain);

    this.browser = null;
    this.monitorBusy = false;
    this.intervalRef = null;
    this.forceRefreshRequested = false;

    this.state = {
      status: 'starting',
      message: 'Monitor starting...',
      connected: false,
      pageUrl: '',
      targetDomain: this.targetDomain,
      monitorPort: this.monitorPort,
      debugPort: this.debugPort,
      lastError: '',
      lastUpdateAt: new Date().toISOString(),
      qrAvailable: false,
      qrHash: '',
      qrDataUrl: '',
      qrFile: '',
      qrCapturedAt: 0,
      qrAgeMs: 0,
      lastRefreshAttemptAt: 0,
      refreshCount: 0,
      loginVerification: null,
    };

    this.qrHistory = new Map();
  }

  ensureDirs() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  updateState(patch) {
    Object.assign(this.state, patch, { lastUpdateAt: new Date().toISOString() });
    this.emit('status', this.getPublicState());
  }

  getPublicState() {
    const qrAgeMs = this.state.qrCapturedAt ? Math.max(0, Date.now() - this.state.qrCapturedAt) : 0;
    return {
      sessionId: this.sessionId,
      status: this.state.status,
      message: this.state.message,
      connected: this.state.connected,
      monitorPort: this.monitorPort,
      debugPort: this.debugPort,
      pageUrl: this.state.pageUrl,
      targetDomain: this.state.targetDomain,
      qrAvailable: this.state.qrAvailable,
      qrFile: this.state.qrFile,
      qrAgeMs,
      qrAgeSec: Math.floor(qrAgeMs / 1000),
      refreshCount: this.state.refreshCount,
      loginVerification: this.state.loginVerification || null,
      lastError: this.state.lastError,
      lastUpdateAt: this.state.lastUpdateAt,
    };
  }

  getCurrentQrPayload() {
    return {
      ...this.getPublicState(),
      hash: this.state.qrHash || null,
      capturedAt: this.state.qrCapturedAt ? new Date(this.state.qrCapturedAt).toISOString() : null,
      qrDataUrl: this.state.qrDataUrl || null,
    };
  }

  getCurrentQrBuffer() {
    if (!this.state.qrFile || !fs.existsSync(this.state.qrFile)) {
      return null;
    }
    return fs.readFileSync(this.state.qrFile);
  }

  getHistoryFileByHash(hash) {
    const file = this.qrHistory.get(hash);
    if (!file || !fs.existsSync(file)) {
      return null;
    }
    return file;
  }

  listHistory() {
    return Array.from(this.qrHistory.entries()).map(([hash, file]) => ({ hash, file }));
  }

  async start() {
    this.ensureDirs();
    this.intervalRef = setInterval(() => {
      void this.monitorTick();
    }, this.pollIntervalMs);
    void this.monitorTick();
    return this;
  }

  async stop() {
    if (this.intervalRef) {
      clearInterval(this.intervalRef);
      this.intervalRef = null;
    }
    try {
      if (this.browser && this.browser.connected) {
        await this.browser.disconnect();
      }
    } catch (_error) {
      // noop
    }
    this.browser = null;
    this.updateState({
      connected: false,
      status: 'stopped',
      message: 'Session stopped',
    });
  }

  async requestRefresh(force = false) {
    this.forceRefreshRequested = force ? 'force' : 'manual';
    await this.monitorTick();
    return {
      requested: true,
      force: Boolean(force),
      ...this.getPublicState(),
    };
  }

  async connectBrowser() {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    try {
      this.browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${this.debugPort}`,
        defaultViewport: null,
      });
      this.browser.on('disconnected', () => {
        this.browser = null;
        this.updateState({
          connected: false,
          status: 'waiting_browser',
          message: `Browser disconnected, waiting on port ${this.debugPort}`,
        });
      });
      this.updateState({
        connected: true,
        status: 'connected',
        message: `Connected to browser on port ${this.debugPort}`,
        lastError: '',
      });
    } catch (error) {
      this.updateState({
        connected: false,
        status: 'waiting_browser',
        message: `Waiting for browser debug port ${this.debugPort}...`,
        lastError: String(error.message || error),
      });
    }

    return this.browser;
  }

  async getTargetPage() {
    if (!this.browser || !this.browser.connected) {
      return null;
    }

    const pages = await this.browser.pages();
    if (!pages.length) {
      return null;
    }

    const preferred = pages.find((p) => p.url().toLowerCase().includes(this.targetDomain));
    if (preferred) {
      return preferred;
    }

    const nonBlank = pages.find((p) => !p.url().startsWith('about:blank'));
    return nonBlank || pages[0];
  }

  async hasLoginModal(page) {
    const selectors = this.siteKeywords.loginModalSelectors || LOGIN_MODAL_SELECTORS;
    for (const selector of selectors) {
      const modal = await page.$(selector);
      if (!modal) {
        continue;
      }
      await modal.dispose();
      return true;
    }
    return false;
  }

  async hasLoginButton(page, keywords = LOGIN_BUTTON_KEYWORDS) {
    return page.evaluate((inputKeywords) => {
      const needles = inputKeywords.map((k) => k.toLowerCase());
      const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 28 &&
          rect.height > 16 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth
        );
      };

      const nodes = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'));
      for (const node of nodes) {
        const text = normalize(node.innerText || node.textContent);
        if (!text || text.length > 32) {
          continue;
        }
        if (!needles.some((n) => text.includes(n))) {
          continue;
        }
        const target = node.closest('button, a, [role="button"]') || node;
        if (target instanceof HTMLElement && isVisible(target)) {
          return true;
        }
      }
      return false;
    }, keywords);
  }

  async clickByKeywords(page, keywords) {
    return page.evaluate((inputKeywords) => {
      const needles = inputKeywords.map((k) => k.toLowerCase());
      const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 28 &&
          rect.height > 16 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth
        );
      };

      const nodes = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'));
      for (const node of nodes) {
        const text = normalize(node.innerText || node.textContent);
        if (!text || text.length > 60) {
          continue;
        }
        if (!needles.some((n) => text.includes(n))) {
          continue;
        }

        const target = node.closest('button, a, [role="button"]') || node;
        if (!(target instanceof HTMLElement) || !isVisible(target)) {
          continue;
        }

        target.click();
        return {
          clicked: true,
          text: text.slice(0, 80),
          tag: target.tagName.toLowerCase(),
        };
      }

      return { clicked: false };
    }, keywords);
  }

  async clickBySelectors(page, selectors = []) {
    if (!selectors.length) {
      return { clicked: false };
    }
    return page.evaluate((selectorList) => {
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 10 &&
          rect.height > 10 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth
        );
      };

      for (const selector of selectorList) {
        const nodes = Array.from(document.querySelectorAll(selector));
        for (const node of nodes) {
          if (!(node instanceof HTMLElement) || !isVisible(node)) {
            continue;
          }
          node.click();
          const text = (node.innerText || node.textContent || '').replace(/\s+/g, ' ').trim();
          return {
            clicked: true,
            selector,
            text: text.slice(0, 80),
            tag: node.tagName.toLowerCase(),
          };
        }
      }

      return { clicked: false };
    }, selectors);
  }

  async ensureLoginModalOpen(page) {
    if (await this.hasLoginModal(page)) {
      return true;
    }

    const beforeUrl = page.url();
    const selectorResult = await this.clickBySelectors(page, this.siteKeywords.loginEntrySelectors || []).catch(() => ({ clicked: false }));
    const keywordResult = selectorResult.clicked
      ? { clicked: false }
      : await this.clickByKeywords(page, this.siteKeywords.loginButtonKeywords).catch(() => ({ clicked: false }));
    const clickRes = resolveLoginEntryTelemetry(selectorResult, keywordResult);
    const afterClickUrl = page.url();

    console.log(telemetryLine('login_click', {
      domain: this.targetDomain,
      path: clickRes.path,
      selector: clickRes.selector || '-',
      tag: clickRes.tag || '-',
      beforeUrl,
      afterUrl: afterClickUrl,
    }));

    if (clickRes.clicked) {
      this.updateState({
        status: 'waiting_login_modal',
        message: 'Clicked login button [' + clickRes.path + '] ' + (clickRes.text || clickRes.selector || ''),
      });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const afterWaitUrl = page.url();
      console.log(telemetryLine('login_transition', {
        domain: this.targetDomain,
        beforeUrl,
        afterUrl: afterWaitUrl,
      }));
      return this.hasLoginModal(page);
    }

    return false;
  }

  async ensureQrTab(page) {
    const contexts = [page, ...page.frames().filter((frame) => frame !== page.mainFrame())];
    for (const context of contexts) {
      const bySelector = await this.clickBySelectors(context, this.siteKeywords.qrSwitchSelectors || []).catch(() => ({ clicked: false }));
      if (bySelector.clicked) {
        this.updateState({
          status: 'waiting_qr',
          message: `Switched to QR tab by selector ${bySelector.selector}${bySelector.text ? `: ${bySelector.text}` : ''}`,
        });
        await new Promise((resolve) => setTimeout(resolve, 800));
        return;
      }

      const switched = await this.clickByKeywords(context, this.siteKeywords.qrTabKeywords).catch(() => ({ clicked: false }));
      if (switched.clicked) {
        this.updateState({
          status: 'waiting_qr',
          message: `Switched to QR tab: ${switched.text}`,
        });
        await new Promise((resolve) => setTimeout(resolve, 800));
        return;
      }
    }
  }

  async hasExpiredQrText(page) {
    return page.evaluate((expiredKeywords) => {
      const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const bodyText = normalize(document.body?.innerText || '');
      return expiredKeywords.some((word) => bodyText.includes(word.toLowerCase()));
    }, QR_EXPIRED_KEYWORDS);
  }

  canAttemptRefresh(force = false) {
    if (force) {
      this.state.lastRefreshAttemptAt = Date.now();
      return true;
    }
    const now = Date.now();
    if (now - this.state.lastRefreshAttemptAt < this.qrRefreshCooldownMs) {
      return false;
    }
    this.state.lastRefreshAttemptAt = now;
    return true;
  }

  async tryClickQrRefreshControl(page, force = false) {
    return page.evaluate((expiredKeywords, refreshKeywords, forceRefresh) => {
      const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const hasAny = (text, words) => words.some((w) => text.includes(w.toLowerCase()));
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 16 &&
          rect.height > 12 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth
        );
      };

      const textNodes = Array.from(document.querySelectorAll('button, a, [role="button"], span, div'))
        .filter((node) => node instanceof HTMLElement)
        .map((node) => {
          const text = normalize(node.innerText || node.textContent);
          return { node, text };
        })
        .filter((item) => item.text && item.text.length <= 60);

      const expiredNodes = textNodes.filter((item) => hasAny(item.text, expiredKeywords));
      if (!forceRefresh && expiredNodes.length === 0) {
        return { clicked: false, reason: 'not_expired' };
      }

      const searchRoots = [];
      for (const item of expiredNodes) {
        const root = item.node.closest('section, article, form, dialog, div') || item.node;
        if (root && !searchRoots.includes(root)) {
          searchRoots.push(root);
        }
      }
      if (forceRefresh || searchRoots.length === 0) {
        searchRoots.push(document.body);
      }

      for (const root of searchRoots) {
        const candidates = Array.from(root.querySelectorAll('button, a, [role="button"], span, div'))
          .filter((node) => node instanceof HTMLElement);
        for (const node of candidates) {
          const text = normalize(node.innerText || node.textContent);
          if (!text || text.length > 40 || !hasAny(text, refreshKeywords)) {
            continue;
          }
          const target = node.closest('button, a, [role="button"]') || node;
          if (!(target instanceof HTMLElement) || !isVisible(target)) {
            continue;
          }
          target.click();
          return { clicked: true, text: text.slice(0, 40), reason: forceRefresh ? 'forced' : 'expired' };
        }
      }

      return { clicked: false, reason: expiredNodes.length > 0 ? 'expired_no_button' : 'no_button' };
    }, QR_EXPIRED_KEYWORDS, QR_REFRESH_KEYWORDS, force);
  }

  async tryClickQrIcon(page, force = false) {
    const target = await page.evaluate((hintKeywords, expiredKeywords, refreshKeywords, forceRefresh) => {
      const normalize = (text) => (text || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const hasAny = (text, words) => words.some((w) => text.includes(String(w || '').toLowerCase()));
      const isVisible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 12 &&
          rect.height > 12 &&
          rect.bottom > 0 &&
          rect.right > 0 &&
          rect.top < window.innerHeight &&
          rect.left < window.innerWidth
        );
      };
      const inViewport = (x, y) => (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        x >= 1 &&
        y >= 1 &&
        x <= window.innerWidth - 1 &&
        y <= window.innerHeight - 1
      );

      const bodyText = normalize(document.body?.innerText || '');
      const hasExpiredText = hasAny(bodyText, expiredKeywords);
      if (!forceRefresh && !hasExpiredText) {
        return { clicked: false, reason: 'not_expired' };
      }

      const points = [];

      // 1) 优先找带有“失效/刷新”文案的可点击覆盖层（如抖音二维码失效层）
      const refreshOverlayNodes = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'))
        .filter((node) => node instanceof HTMLElement)
        .map((node) => {
          const rect = node.getBoundingClientRect();
          const style = window.getComputedStyle(node);
          const text = normalize(node.innerText || node.textContent);
          if (!text) {
            return null;
          }
          if (!isVisible(node)) {
            return null;
          }
          if (rect.width < 40 || rect.height < 20 || rect.width > 460 || rect.height > 460) {
            return null;
          }
          const hasRefresh = hasAny(text, refreshKeywords);
          const hasExpired = hasAny(text, expiredKeywords);
          const hasHint = hasAny(text, hintKeywords);
          if (!hasRefresh && !hasExpired && !hasHint) {
            return null;
          }

          let score = 0;
          if (hasRefresh) score += 9;
          if (hasExpired) score += 8;
          if (hasHint) score += 3;
          if (style.cursor === 'pointer') score += 6;
          if (node.tagName.toLowerCase() === 'button' || node.tagName.toLowerCase() === 'a') score += 4;
          if (node.getAttribute('role') === 'button') score += 4;
          if (Math.abs(rect.width - rect.height) < 24) score += 2;
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dist = Math.hypot(cx - window.innerWidth / 2, cy - window.innerHeight / 2);
          score += Math.max(0, 4 - dist / 300);
          if (!inViewport(cx, cy)) {
            return null;
          }

          return {
            x: cx,
            y: cy,
            score,
            text: text.slice(0, 80),
            reason: hasExpired || hasRefresh ? 'expired_overlay' : 'hint_overlay',
          };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);

      points.push(...refreshOverlayNodes);

      // 2) 再找二维码图像区域的中心点，点击其顶部元素（常见是覆盖层）
      const qrCandidates = Array.from(document.querySelectorAll('img, canvas'))
        .filter((node) => node instanceof HTMLElement)
        .map((node) => {
          const rect = node.getBoundingClientRect();
          const src = node.tagName.toLowerCase() === 'img' ? (node.getAttribute('src') || '') : '';
          const parentText = normalize(node.parentElement?.innerText || '');
          let ancestorText = parentText;
          let cur = node.parentElement;
          for (let i = 0; i < 4 && cur; i += 1) {
            ancestorText += ` ${normalize(cur.innerText || '')}`;
            cur = cur.parentElement;
          }
          return { node, rect, src, parentText, ancestorText };
        })
        .filter((item) => {
          const ratio = item.rect.width / Math.max(1, item.rect.height);
          return (
            isVisible(item.node) &&
            item.rect.width >= 90 &&
            item.rect.height >= 90 &&
            item.rect.width <= 460 &&
            item.rect.height <= 460 &&
            ratio >= 0.75 &&
            ratio <= 1.3
          );
        })
        .map((item) => {
          let score = 0;
          const srcLower = item.src.toLowerCase();
          if (item.src.startsWith('data:image/')) {
            score += 6;
          }
          if (srcLower.includes('qr') || srcLower.includes('qrcode')) {
            score += 4;
          }
          if (hasAny(item.parentText, hintKeywords)) {
            score += 4;
          }
          if (hasAny(item.ancestorText, hintKeywords)) {
            score += 3;
          }
          if (hasAny(item.parentText, refreshKeywords) || hasAny(item.ancestorText, refreshKeywords)) {
            score += 3;
          }
          if (hasAny(item.parentText, expiredKeywords) || hasAny(item.ancestorText, expiredKeywords)) {
            score += 3;
          }
          const centerX = window.innerWidth / 2;
          const centerY = window.innerHeight / 2;
          const qrCenterX = item.rect.x + item.rect.width / 2;
          const qrCenterY = item.rect.y + item.rect.height / 2;
          const dist = Math.hypot(qrCenterX - centerX, qrCenterY - centerY);
          score += Math.max(0, 3 - dist / 280);
          const topEl = document.elementFromPoint(qrCenterX, qrCenterY);
          let extra = 0;
          if (topEl instanceof HTMLElement) {
            const topStyle = window.getComputedStyle(topEl);
            if (topStyle.cursor === 'pointer') extra += 6;
            const topText = normalize(topEl.innerText || topEl.textContent);
            if (hasAny(topText, refreshKeywords)) extra += 6;
            if (hasAny(topText, expiredKeywords)) extra += 5;
          }
          return { ...item, score: score + extra, x: qrCenterX, y: qrCenterY };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      for (const item of qrCandidates) {
        if (!inViewport(item.x, item.y)) {
          continue;
        }
        points.push({
          x: item.x,
          y: item.y,
          score: item.score,
          text: normalize(item.parentText || '').slice(0, 80),
          reason: 'qr_center',
        });
      }

      points.sort((a, b) => b.score - a.score);
      const best = points[0];
      if (!best) {
        return { clicked: false, reason: hasExpiredText ? 'expired_no_qr_icon' : 'no_qr_icon' };
      }

      return {
        clicked: true,
        x: Math.round(best.x),
        y: Math.round(best.y),
        score: best.score,
        text: best.text || '',
        reason: best.reason || (forceRefresh ? 'forced_qr_icon' : 'expired_qr_icon'),
      };
    }, this.siteKeywords.qrHintKeywords || QR_HINT_KEYWORDS, QR_EXPIRED_KEYWORDS, QR_REFRESH_KEYWORDS, force);

    if (!target || !target.clicked || !Number.isFinite(target.x) || !Number.isFinite(target.y)) {
      return { clicked: false, reason: target?.reason || 'no_qr_icon' };
    }

    await page.mouse.click(target.x, target.y, { delay: 60 });
    return {
      clicked: true,
      reason: target.reason || (force ? 'forced_qr_icon' : 'expired_qr_icon'),
      text: target.text || '',
    };
  }

  async refreshExpiredQr(page, reason = 'expired_text', force = false) {
    if (!this.canAttemptRefresh(force)) {
      return false;
    }

    const refreshResult = await this.tryClickQrRefreshControl(page, reason === 'stale_age' || force);
    if (refreshResult.clicked) {
      this.state.refreshCount += 1;
      this.updateState({
        status: 'refreshing_qr',
        message: `Refreshing QR (${reason}): ${refreshResult.text || 'button clicked'}`,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return true;
    }

    const iconResult = await this.tryClickQrIcon(page, reason === 'stale_age' || force);
    if (iconResult.clicked) {
      this.state.refreshCount += 1;
      this.updateState({
        status: 'refreshing_qr',
        message: `Refreshing QR (${reason}) by clicking QR icon${iconResult.text ? `: ${iconResult.text}` : ''}`,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return true;
    }

    const switched = await this.clickByKeywords(page, this.siteKeywords.qrTabKeywords);
    if (switched.clicked) {
      this.state.refreshCount += 1;
      this.updateState({
        status: 'refreshing_qr',
        message: `Refreshing QR by re-opening QR tab: ${switched.text}`,
      });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      return true;
    }

    return false;
  }

  async findBestQrElement(page) {
    const selectors = this.siteKeywords.qrCodeSelectors || QR_CODE_SELECTORS;
    let best = null;
    let bestScore = -1;
    const contexts = [page.mainFrame(), ...page.frames().filter((frame) => frame !== page.mainFrame())];

    for (const context of contexts) {
      const selectorCandidates = await context.$$(selectors.join(', ')).catch(() => []);
      const fallbackCandidates = await context.$$('img, canvas').catch(() => []);
      const candidates = [...selectorCandidates, ...fallbackCandidates];

      for (const candidate of candidates) {
        const meta = await candidate.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          const parentText = (el.parentElement?.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
          const tag = el.tagName.toLowerCase();
          const src = tag === 'img' ? (el.getAttribute('src') || '') : '';
          return {
            width: rect.width,
            height: rect.height,
            x: rect.x,
            y: rect.y,
            viewportW: window.innerWidth,
            viewportH: window.innerHeight,
            visible: style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0',
            src,
            cls: ((el.className && String(el.className)) || '').toLowerCase(),
            id: (el.id || '').toLowerCase(),
            bg: (style.backgroundImage || '').toLowerCase(),
            parentText,
            ancestorText: (() => {
              let txt = '';
              let cur = el.parentElement;
              for (let i = 0; i < 4 && cur; i += 1) {
                txt += ` ${cur.innerText || ''}`;
                cur = cur.parentElement;
              }
              return txt.replace(/\s+/g, ' ').trim().toLowerCase();
            })(),
            tag,
          };
        });

        if (!meta.visible || meta.width < 90 || meta.height < 90 || meta.width > 420 || meta.height > 420) {
          await candidate.dispose();
          continue;
        }

        const ratio = meta.width / meta.height;
        if (ratio < 0.8 || ratio > 1.25) {
          await candidate.dispose();
          continue;
        }

        let score = 0;
        if (meta.src.startsWith('data:image/')) {
          score += 6;
        }
        if (meta.src.toLowerCase().includes('qr') || meta.src.toLowerCase().includes('qrcode')) {
          score += 4;
        }
        if (meta.cls.includes('qr') || meta.cls.includes('qrcode') || meta.cls.includes('scan')) {
          score += 4;
        }
        if (meta.id.includes('qr') || meta.id.includes('qrcode') || meta.id.includes('scan')) {
          score += 3;
        }
        if (meta.bg.includes('data:image') || meta.bg.includes('qr') || meta.bg.includes('qrcode')) {
          score += 5;
        }
        if (this.siteKeywords.qrHintKeywords.some((k) => meta.parentText.includes(k))) {
          score += 3;
        }
        if (this.siteKeywords.qrHintKeywords.some((k) => meta.ancestorText.includes(k))) {
          score += 2;
        }
        if (meta.tag === 'canvas') {
          score += 2;
        }

        const centerX = meta.viewportW / 2;
        const centerY = meta.viewportH / 2;
        const qrCenterX = meta.x + meta.width / 2;
        const qrCenterY = meta.y + meta.height / 2;
        const dist = Math.hypot(qrCenterX - centerX, qrCenterY - centerY);
        score += Math.max(0, 3 - dist / 260);
        score += Math.max(0, 2 - Math.abs(meta.width - meta.height) / 40);

        if (score > bestScore) {
          if (best) {
            await best.dispose();
          }
          best = candidate;
          bestScore = score;
        } else {
          await candidate.dispose();
        }
      }
    }

    if (bestScore < this.minQrScore) {
      if (best) {
        await best.dispose();
      }
      return null;
    }

    return best;
  }

  async detectLoginVerification(page) {
    const currentUrl = page.url();
    let currentHost = normalizeHost(currentUrl);
    let currentPath = '';
    try {
      const parsed = new URL(currentUrl);
      currentHost = normalizeHost(parsed.hostname);
      currentPath = String(parsed.pathname || '').toLowerCase();
    } catch (_error) {
      // keep best effort host/path
    }

    const markerConfig = this.siteKeywords.loginVerificationMarkers || null;
    if (!markerConfig || !isJdDomain(this.targetDomain)) {
      return {
        success: false,
        method: 'none',
        markerType: 'none',
        markerValues: [],
        details: { currentUrl, currentHost, currentPath },
      };
    }

    const cookies = await page.cookies().catch(() => []);
    const markerCookieNames = (markerConfig.cookieNames || [])
      .map((item) => String(item || '').toLowerCase())
      .filter(Boolean);
    const loginHosts = (markerConfig.loginHosts || [])
      .map((item) => normalizeHost(item))
      .filter(Boolean);
    const loginPathPatterns = (markerConfig.loginPathPatterns || [])
      .map((item) => String(item || '').toLowerCase())
      .filter(Boolean);
    const successUrlPatterns = (markerConfig.successUrlPatterns || [])
      .map((item) => String(item || '').toLowerCase())
      .filter(Boolean);
    const domIndicators = Array.isArray(markerConfig.domIndicators) ? markerConfig.domIndicators : [];

    const matchedCookies = cookies
      .filter((cookie) => markerCookieNames.includes(String(cookie.name || '').toLowerCase()))
      .map((cookie) => cookie.name);

    const matchedDomSelectors = [];
    for (const selector of domIndicators) {
      try {
        const element = await page.$(selector);
        if (!element) {
          continue;
        }
        matchedDomSelectors.push(selector);
        await element.dispose();
      } catch (_error) {
        // ignore selector read errors
      }
    }

    const isLoginHost = loginHosts.includes(currentHost);
    const isLoginPath = loginPathPatterns.some((pattern) => currentPath.includes(pattern));
    const matchedSuccessUrlPattern = successUrlPatterns.find((pattern) => currentUrl.toLowerCase().includes(pattern)) || '';

    const hasCookieMarker = matchedCookies.length > 0;
    const hasDomMarker = matchedDomSelectors.length > 0;
    const hasUrlMarker = Boolean(matchedSuccessUrlPattern) || (isJdDomain(currentHost) && !isLoginHost && !isLoginPath);
    const success = hasCookieMarker && (hasDomMarker || hasUrlMarker);

    let markerType = 'none';
    if (hasCookieMarker) {
      markerType = 'cookie';
    } else if (hasDomMarker) {
      markerType = 'dom';
    } else if (hasUrlMarker) {
      markerType = 'url';
    }

    const markerValues = [
      ...matchedCookies.map((name) => ({ type: 'cookie', value: name })),
      ...matchedDomSelectors.map((selector) => ({ type: 'dom', value: selector })),
    ];
    if (hasUrlMarker) {
      markerValues.push({ type: 'url', value: currentHost + currentPath });
    }

    return {
      success,
      method: 'jd-markers',
      markerType,
      markerValues,
      details: {
        currentUrl,
        currentHost,
        currentPath,
        matchedCookies,
        matchedDomSelectors,
        matchedSuccessUrlPattern,
        loginHost: isLoginHost,
        loginPath: isLoginPath,
      },
    };
  }
  async captureAndPublishQr(page) {
    const qrElement = await this.findBestQrElement(page);
    if (!qrElement) {
      this.updateState({
        status: 'waiting_qr',
        message: 'Waiting for QR code in login popup...',
        qrAvailable: false,
        qrHash: '',
        qrDataUrl: '',
        qrFile: '',
        qrCapturedAt: 0,
        qrAgeMs: 0,
      });
      return { found: false, changed: false };
    }

    const raw = await qrElement.screenshot({ type: 'png' });
    const buffer = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    await qrElement.dispose();

    const hash = crypto.createHash('sha256').update(buffer).digest('hex');
    const changed = hash !== this.state.qrHash;

    this.updateState({
      status: 'qr_ready',
      message: changed ? 'New QR code captured' : 'QR code is up to date',
      qrAvailable: true,
      qrHash: hash,
      qrDataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
      qrFile: this.currentQrFile,
      qrCapturedAt: changed ? Date.now() : this.state.qrCapturedAt || Date.now(),
      qrAgeMs: changed ? 0 : Math.max(0, Date.now() - (this.state.qrCapturedAt || Date.now())),
      lastError: '',
    });

    fs.writeFileSync(this.currentQrFile, buffer);

    if (changed) {
      const historyFile = path.join(this.logDir, toTimestampFilename(this.targetDomain, this.monitorPort));
      fs.writeFileSync(historyFile, buffer);
      this.qrHistory.set(hash, historyFile);
      this.emit('qr', this.getCurrentQrPayload());
    }

    return { found: true, changed };
  }

  async monitorTick() {
    if (this.monitorBusy) {
      return;
    }
    this.monitorBusy = true;

    try {
      await this.connectBrowser();
      if (!this.browser || !this.browser.connected) {
        return;
      }

      const page = await this.getTargetPage();
      if (!page) {
        this.updateState({
          status: 'waiting_page',
          message: 'Connected, but no active page found',
        });
        return;
      }

      this.updateState({ pageUrl: page.url() });

      const preVerify = await this.detectLoginVerification(page);
      this.updateState({ loginVerification: preVerify });
      console.log(telemetryLine('post_scan_verify', {
        domain: this.targetDomain,
        stage: 'pre',
        success: preVerify.success,
        method: preVerify.method,
        markerType: preVerify.markerType,
        host: preVerify.details?.currentHost || '-',
        cookies: (preVerify.details?.matchedCookies || []).join('|') || '-',
      }));
      if (preVerify.success) {
        this.updateState({
          status: 'logged_in',
          message: 'Login verified by ' + preVerify.markerType,
          qrAvailable: false,
          qrHash: '',
          qrDataUrl: '',
          qrFile: '',
          qrCapturedAt: 0,
          qrAgeMs: 0,
        });
        return;
      }

      const hasModal = await this.ensureLoginModalOpen(page);
      if (!hasModal) {
        const hasLogin = await this.hasLoginButton(page, this.siteKeywords.loginButtonKeywords);
        if (hasLogin) {
          this.updateState({
            status: 'waiting_login_modal',
            message: 'Login button detected, trying to locate QR on page',
          });
        } else {
          this.updateState({
            status: 'waiting_verification',
            message: 'No login popup detected; waiting for JD login markers',
          });
        }
      }

      await this.ensureQrTab(page);

      if (this.forceRefreshRequested) {
        const force = this.forceRefreshRequested === 'force';
        await this.refreshExpiredQr(page, force ? 'force_refresh' : 'manual_refresh', force);
        this.forceRefreshRequested = false;
        await this.captureAndPublishQr(page);
      } else {
        if (await this.hasExpiredQrText(page)) {
          await this.refreshExpiredQr(page, 'expired_text');
        }

        const captureResult = await this.captureAndPublishQr(page);
        if (captureResult.found && this.state.qrCapturedAt) {
          const ageMs = Date.now() - this.state.qrCapturedAt;
          if (ageMs > this.qrMaxAgeMs) {
            this.updateState({
              status: 'stale_qr',
              message: 'QR older than ' + Math.floor(this.qrMaxAgeMs / 1000) + 's, auto refreshing...',
              qrAgeMs: ageMs,
            });
            const refreshed = await this.refreshExpiredQr(page, 'stale_age');
            if (refreshed) {
              await this.captureAndPublishQr(page);
            }
          }
        }
      }

      const postVerify = await this.detectLoginVerification(page);
      this.updateState({ loginVerification: postVerify });
      console.log(telemetryLine('post_scan_verify', {
        domain: this.targetDomain,
        stage: 'post',
        success: postVerify.success,
        method: postVerify.method,
        markerType: postVerify.markerType,
        host: postVerify.details?.currentHost || '-',
        cookies: (postVerify.details?.matchedCookies || []).join('|') || '-',
      }));
      if (postVerify.success) {
        this.updateState({
          status: 'logged_in',
          message: 'Login verified by ' + postVerify.markerType,
          qrAvailable: false,
          qrHash: '',
          qrDataUrl: '',
          qrFile: '',
          qrCapturedAt: 0,
          qrAgeMs: 0,
        });
      }
    } catch (error) {
      this.updateState({
        status: 'error',
        message: 'Monitor loop failed',
        lastError: String(error.message || error),
      });
    } finally {
      this.monitorBusy = false;
    }
  }
}

class QRMonitorManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.sessions = new Map();
  }

  createSessionOptions(options = {}) {
    const targetDomain = (options.targetDomain || this.options.targetDomain || 'douyin.com').toLowerCase();
    const monitorPort = parsePort(options.monitorPort ?? this.options.monitorPort, 3999);
    const debugPort = parsePort(options.debugPort ?? this.options.debugPort, 9222);
    const sessionId = options.sessionId || createSessionId(targetDomain);

    const rootDir = options.rootDir || this.options.rootDir || process.cwd();
    const logDir = options.logDir || this.options.logDir || path.join(rootDir, 'logs');
    const sessionDir = options.sessionDir || this.options.sessionDir || path.join(rootDir, '.web-login-cli', 'sessions');

    return {
      sessionId,
      targetDomain,
      monitorPort,
      debugPort,
      pollIntervalMs: options.pollIntervalMs ?? this.options.pollIntervalMs ?? 1000,
      qrMaxAgeMs: options.qrMaxAgeMs ?? this.options.qrMaxAgeMs ?? 45000,
      qrRefreshCooldownMs: options.qrRefreshCooldownMs ?? this.options.qrRefreshCooldownMs ?? 3500,
      minQrScore: options.minQrScore ?? this.options.minQrScore ?? 6,
      rootDir,
      logDir,
      sessionDir,
      qrFile: options.qrFile,
    };
  }

  async startSession(options = {}) {
    const sessionOptions = this.createSessionOptions(options);
    if (this.sessions.has(sessionOptions.sessionId)) {
      throw new Error(`Session already exists: ${sessionOptions.sessionId}`);
    }

    const session = new QRMonitorSession(sessionOptions);
    session.on('status', (payload) => {
      this.emit('status', payload);
    });
    session.on('qr', (payload) => {
      this.emit('qr', payload);
    });

    this.sessions.set(session.sessionId, session);
    await session.start();
    return session;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId) || null;
  }

  listSessions() {
    return Array.from(this.sessions.values()).map((session) => session.getPublicState());
  }

  async stopSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      return false;
    }
    await session.stop();
    this.sessions.delete(sessionId);
    return true;
  }

  async stopAll() {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) {
      await this.stopSession(id);
    }
  }
}

module.exports = {
  QRMonitorSession,
  QRMonitorManager,
  getSiteKeywords,
  resolveLoginEntryClickPath: resolveLoginEntryTelemetry,
  parsePort,
  toFileSafeToken,
  buildDefaultQrFilename,
  localIps,
};
