'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { resolveSiteOrUrl } = require('./site-resolver');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const SESSION_DIR = path.join(ROOT_DIR, '.web-login-cli', 'sessions');
const LOGIN_SCRIPT = path.join(ROOT_DIR, 'login_web.js');

function ensureRequiredDependencies() {
  try {
    require.resolve('puppeteer', { paths: [ROOT_DIR] });
  } catch (_error) {
    throw new Error(
      'Missing dependency: puppeteer. Please run `npm install` in the project root first.',
    );
  }
}

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

function toFileSafeDomain(domain) {
  return String(domain || '').replace(/[^a-zA-Z0-9.-]/g, '').replace(/\./g, '-');
}

function toCookieFilename(domain) {
  return `cookies-${String(domain || '').replace(/\./g, '-')}.json`;
}

function getCookieFilePath(domain) {
  return path.join(SESSION_DIR, toCookieFilename(domain));
}

function loadCookiesForDomain(domain) {
  const cookieFile = getCookieFilePath(domain);
  if (!fs.existsSync(cookieFile)) {
    throw new Error(`Cookie file not found: ${cookieFile}`);
  }

  const raw = fs.readFileSync(cookieFile, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`Cookie file format is invalid: ${cookieFile}`);
  }

  return { cookieFile, cookies: parsed };
}

function parsePort(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`Invalid debug port: ${value}`);
  }
  return String(parsed);
}

function login(siteOrUrl, options = {}) {
  ensureRequiredDependencies();

  const resolved = resolveSiteOrUrl(siteOrUrl, options);
  const args = [LOGIN_SCRIPT, resolved.loginUrl];

  const debugPort = parsePort(options.debugPort);
  if (debugPort) {
    args.push('--debug-port', debugPort);
  }

  const chromePath = String(options.chromePath || options.executablePath || '').trim();
  if (chromePath) {
    args.push('--chrome-path', chromePath);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      env: process.env,
    });

    child.once('error', reject);
    child.once('exit', (code, signal) => {
      resolve({
        action: 'login',
        resolved,
        exitCode: code,
        signal,
      });
    });
  });
}

function exportAction(siteOrUrl, format = 'puppeteer', options = {}) {
  const normalizedFormat = String(format || 'puppeteer').trim().toLowerCase();
  if (normalizedFormat !== 'puppeteer') {
    throw new Error(`Unsupported export format: ${format}`);
  }

  ensureSessionDir();

  const resolved = resolveSiteOrUrl(siteOrUrl, options);
  const { cookies } = loadCookiesForDomain(resolved.domain);

  return {
    cookies,
    setCookieSnippet: 'await page.setCookie(...cookies);',
  };
}

function status(siteOrUrl, options = {}) {
  ensureSessionDir();

  const resolved = resolveSiteOrUrl(siteOrUrl, options);
  const cookieFile = getCookieFilePath(resolved.domain);

  let cookieFileExists = false;
  let cookieMtime = null;
  let cookieCount = 0;

  if (fs.existsSync(cookieFile)) {
    cookieFileExists = true;
    const stat = fs.statSync(cookieFile);
    cookieMtime = stat.mtime.toISOString();

    try {
      const parsed = JSON.parse(fs.readFileSync(cookieFile, 'utf8'));
      if (Array.isArray(parsed)) {
        cookieCount = parsed.length;
      }
    } catch (_error) {
      cookieCount = 0;
    }
  }

  return {
    site: resolved.site,
    domain: resolved.domain,
    loginUrl: resolved.loginUrl,
    supportsQr: resolved.supportsQr,
    cookieFile,
    cookieFileExists,
    cookieMtime,
    cookieCount,
  };
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clear(siteOrUrl, options = {}) {
  if (!options.yes) {
    throw new Error('Refusing to clear without --yes confirmation');
  }

  ensureSessionDir();

  const resolved = resolveSiteOrUrl(siteOrUrl, options);
  const cookieFilename = toCookieFilename(resolved.domain);
  const safeDomain = toFileSafeDomain(resolved.domain);
  const qrPattern = new RegExp(`^login-qr-${escapeRegExp(safeDomain)}-\\d+\\.png$`);

  const removedFiles = [];

  const fileNames = fs.readdirSync(SESSION_DIR).sort();
  for (const fileName of fileNames) {
    const isTargetCookie = fileName === cookieFilename;
    const isTargetQrArtifact = qrPattern.test(fileName);
    if (!isTargetCookie && !isTargetQrArtifact) {
      continue;
    }

    const absolutePath = path.join(SESSION_DIR, fileName);
    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile() && !stat.isSymbolicLink()) {
      continue;
    }

    fs.unlinkSync(absolutePath);
    removedFiles.push(absolutePath);
  }

  return {
    site: resolved.site,
    domain: resolved.domain,
    removedCount: removedFiles.length,
    removedFiles,
  };
}

module.exports = {
  login,
  export: exportAction,
  status,
  clear,
};
