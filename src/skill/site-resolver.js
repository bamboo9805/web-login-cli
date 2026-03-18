'use strict';

const fs = require('fs');
const path = require('path');

const SITE_CONFIG_PATH = path.join(__dirname, 'sites.json');
const RAW_SITE_CONFIG = JSON.parse(fs.readFileSync(SITE_CONFIG_PATH, 'utf8'));

function normalizeDomain(rawValue) {
  let value = String(rawValue || '').trim().toLowerCase();
  value = value.replace(/^https?:\/\//, '');
  value = value.replace(/^www\./, '');
  value = value.replace(/[/?#].*$/, '');
  value = value.replace(/:\d+$/, '');
  return value;
}

function ensureHttpUrl(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) {
    return '';
  }
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `https://${value}`;
}

function parseHttpUrl(rawValue) {
  try {
    const parsed = new URL(rawValue);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const output = [];
  const seen = new Set();
  for (const item of value) {
    const text = String(item || '').trim();
    if (!text) {
      continue;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(text);
  }
  return output;
}

function normalizeCookieDomain(rawValue) {
  const value = normalizeDomain(rawValue);
  if (!value) {
    return '';
  }
  return value.startsWith('.') ? value.slice(1) : value;
}

function normalizeCookieAllowlist(value, fallbackDomain) {
  const fallback = normalizeCookieDomain(fallbackDomain);
  const raw = normalizeStringArray(value).map((item) => normalizeCookieDomain(item)).filter(Boolean);
  const merged = raw.length > 0 ? raw : (fallback ? [fallback] : []);
  return [...new Set(merged)];
}

function loadSiteCatalog() {
  const sites = {};
  const aliasMap = {};

  for (const [rawKey, siteMeta] of Object.entries(RAW_SITE_CONFIG)) {
    const key = String(rawKey || '').trim().toLowerCase();
    if (!key) {
      continue;
    }

    const domain = normalizeDomain(siteMeta.domain || key);
    const loginUrl = ensureHttpUrl(siteMeta.loginUrl || `https://${domain}`);
    const parsedLoginUrl = parseHttpUrl(loginUrl);
    if (!domain || !parsedLoginUrl) {
      continue;
    }

    const successCriteria = {
      authCookieName: siteMeta?.successCriteria?.authCookieName
        ? String(siteMeta.successCriteria.authCookieName).trim()
        : (siteMeta.authCookieName ? String(siteMeta.authCookieName).trim() : null),
      loginIndicators: normalizeStringArray(
        siteMeta?.successCriteria?.loginIndicators || siteMeta.loginIndicators,
      ),
      successUrlPatterns: normalizeStringArray(siteMeta?.successCriteria?.successUrlPatterns),
    };

    const detection = {
      loginButtonKeywords: normalizeStringArray(siteMeta?.detection?.loginButtonKeywords || siteMeta.loginButtonKeywords),
      qrTabKeywords: normalizeStringArray(siteMeta?.detection?.qrTabKeywords || siteMeta.qrTabKeywords),
      qrHintKeywords: normalizeStringArray(siteMeta?.detection?.qrHintKeywords || siteMeta.qrHintKeywords),
      loginModalSelectors: normalizeStringArray(siteMeta?.detection?.loginModalSelectors || siteMeta.loginModalSelectors),
      qrCodeSelectors: normalizeStringArray(siteMeta?.detection?.qrCodeSelectors || siteMeta.qrCodeSelectors),
      qrSwitchSelectors: normalizeStringArray(siteMeta?.detection?.qrSwitchSelectors || siteMeta.qrSwitchSelectors),
    };

    const cookieDomainAllowlist = normalizeCookieAllowlist(siteMeta.cookieDomainAllowlist, domain);

    const siteRecord = {
      key,
      domain,
      loginUrl: parsedLoginUrl.toString(),
      supportsQr: Boolean(siteMeta.supportsQr),
      aliases: normalizeStringArray(siteMeta.aliases),
      cookieDomainAllowlist,
      successCriteria,
      detection,

      // Flat compatibility fields (for callers expecting old shape)
      authCookieName: successCriteria.authCookieName,
      loginIndicators: successCriteria.loginIndicators,
      successUrlPatterns: successCriteria.successUrlPatterns,
      loginButtonKeywords: detection.loginButtonKeywords,
      qrTabKeywords: detection.qrTabKeywords,
      qrHintKeywords: detection.qrHintKeywords,
      loginModalSelectors: detection.loginModalSelectors,
      qrCodeSelectors: detection.qrCodeSelectors,
      qrSwitchSelectors: detection.qrSwitchSelectors,
    };

    sites[key] = siteRecord;

    const aliasValues = new Set([
      key,
      domain,
      ...siteRecord.aliases.map((alias) => normalizeDomain(alias)),
    ]);

    for (const alias of aliasValues) {
      if (!alias) {
        continue;
      }
      aliasMap[alias] = key;
    }
  }

  return { sites, aliasMap };
}

const SITE_CATALOG = loadSiteCatalog();

function resolveSiteAlias(siteName) {
  const normalized = normalizeDomain(siteName);
  if (!normalized) {
    return null;
  }

  const key = SITE_CATALOG.aliasMap[normalized];
  if (!key) {
    return null;
  }

  return SITE_CATALOG.sites[key] || null;
}

function findSiteByDomain(domain) {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return null;
  }

  const exact = resolveSiteAlias(normalized);
  if (exact) {
    return exact;
  }

  for (const site of Object.values(SITE_CATALOG.sites)) {
    if (normalized === site.domain || normalized.endsWith(`.${site.domain}`)) {
      return site;
    }
  }

  return null;
}

function buildResolvedSite(inputValue, source, resolvedUrl, matchedSite) {
  const domain = normalizeDomain(resolvedUrl.hostname);

  if (!matchedSite) {
    return {
      input: String(inputValue || ''),
      source,
      site: null,
      domain,
      loginUrl: resolvedUrl.toString(),
      supportsQr: false,
      cookieDomainAllowlist: domain ? [domain] : [],
      successCriteria: {
        authCookieName: null,
        loginIndicators: [],
        successUrlPatterns: [],
      },
      detection: {
        loginButtonKeywords: [],
        qrTabKeywords: [],
        qrHintKeywords: [],
        loginModalSelectors: [],
        qrCodeSelectors: [],
        qrSwitchSelectors: [],
      },
      authCookieName: null,
      loginIndicators: [],
      successUrlPatterns: [],
      loginButtonKeywords: [],
      qrTabKeywords: [],
      qrHintKeywords: [],
      loginModalSelectors: [],
      qrCodeSelectors: [],
      qrSwitchSelectors: [],
    };
  }

  return {
    input: String(inputValue || ''),
    source,
    site: matchedSite.key,
    domain,
    loginUrl: resolvedUrl.toString(),
    supportsQr: matchedSite.supportsQr,
    cookieDomainAllowlist: matchedSite.cookieDomainAllowlist,
    successCriteria: matchedSite.successCriteria,
    detection: matchedSite.detection,

    authCookieName: matchedSite.authCookieName,
    loginIndicators: matchedSite.loginIndicators,
    successUrlPatterns: matchedSite.successUrlPatterns,
    loginButtonKeywords: matchedSite.loginButtonKeywords,
    qrTabKeywords: matchedSite.qrTabKeywords,
    qrHintKeywords: matchedSite.qrHintKeywords,
    loginModalSelectors: matchedSite.loginModalSelectors,
    qrCodeSelectors: matchedSite.qrCodeSelectors,
    qrSwitchSelectors: matchedSite.qrSwitchSelectors,
  };
}

function resolveFromSite(siteName) {
  const matchedSite = resolveSiteAlias(siteName);
  if (!matchedSite) {
    throw new Error(`Unknown site: ${siteName}`);
  }

  const parsed = parseHttpUrl(matchedSite.loginUrl);
  if (!parsed) {
    throw new Error(`Invalid loginUrl configured for site: ${matchedSite.key}`);
  }

  return buildResolvedSite(siteName, 'site', parsed, matchedSite);
}

function resolveFromUrl(rawUrl) {
  const normalizedUrl = ensureHttpUrl(rawUrl);
  const parsed = parseHttpUrl(normalizedUrl);
  if (!parsed) {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  const matchedSite = findSiteByDomain(parsed.hostname);
  return buildResolvedSite(rawUrl, 'url', parsed, matchedSite);
}

function resolveSiteOrUrl(inputValue, options = {}) {
  const explicitSite = String(options.site || '').trim();
  const explicitUrl = String(options.url || '').trim();

  if (explicitSite && explicitUrl) {
    throw new Error('Use either --site or --url, not both');
  }

  if (explicitSite) {
    return resolveFromSite(explicitSite);
  }

  if (explicitUrl) {
    return resolveFromUrl(explicitUrl);
  }

  const fallbackInput = String(inputValue || '').trim();
  if (!fallbackInput) {
    throw new Error('A site or URL is required');
  }

  if (/^https?:\/\//i.test(fallbackInput)) {
    return resolveFromUrl(fallbackInput);
  }

  const siteHit = resolveSiteAlias(fallbackInput);
  if (siteHit) {
    return resolveFromSite(fallbackInput);
  }

  if (fallbackInput.includes('.') || fallbackInput.includes('/')) {
    return resolveFromUrl(fallbackInput);
  }

  throw new Error(`Unknown site: ${fallbackInput}`);
}

module.exports = {
  normalizeDomain,
  resolveSiteOrUrl,
  siteCatalog: SITE_CATALOG.sites,
};
