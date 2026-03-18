'use strict';

const { siteCatalog } = require('./site-resolver');

const ACTION_RULES = [
  {
    name: 'login',
    patterns: [
      /登录/i,
      /登陆/i,
      /log\s*in/i,
      /sign\s*in/i,
      /signin/i,
      /\blogin\b/i,
    ],
  },
  {
    name: 'status',
    patterns: [
      /状态/i,
      /查看/i,
      /检查/i,
      /是否登录/i,
      /\bstatus\b/i,
      /\bcheck\b/i,
    ],
  },
  {
    name: 'export',
    patterns: [
      /导出/i,
      /\bexport\b/i,
      /cookies?/i,
      /cookie/i,
    ],
  },
  {
    name: 'clear',
    patterns: [
      /清理/i,
      /清空/i,
      /删除.*会话/i,
      /\bclear\b/i,
      /\breset\b/i,
    ],
  },
];

const ACTION_PRIORITY = ['login', 'status', 'export', 'clear'];

function findFirstPatternIndex(text, patterns) {
  let min = -1;
  for (const pattern of patterns) {
    const index = text.search(pattern);
    if (index === -1) {
      continue;
    }
    if (min === -1 || index < min) {
      min = index;
    }
  }
  return min;
}

function detectActions(text) {
  const hits = [];
  for (const rule of ACTION_RULES) {
    const index = findFirstPatternIndex(text, rule.patterns);
    if (index !== -1) {
      hits.push({ name: rule.name, index });
    }
  }

  if (hits.length === 0) {
    return [];
  }

  hits.sort((a, b) => {
    if (a.index !== b.index) {
      return a.index - b.index;
    }
    return ACTION_PRIORITY.indexOf(a.name) - ACTION_PRIORITY.indexOf(b.name);
  });

  return [...new Set(hits.map((item) => item.name))];
}

function detectUrl(text) {
  const urlMatch = text.match(/https?:\/\/[^\s)]+/i);
  if (!urlMatch) {
    return '';
  }
  return String(urlMatch[0] || '').trim();
}

function includesAlias(text, alias) {
  const source = String(text || '').toLowerCase();
  const target = String(alias || '').toLowerCase().trim();
  if (!source || !target) {
    return false;
  }

  if (/[\u4e00-\u9fff]/.test(target)) {
    return source.includes(target);
  }

  return source.includes(target);
}

function detectSiteKey(text) {
  const lowerText = String(text || '').toLowerCase();
  if (!lowerText) {
    return '';
  }

  const entries = Object.values(siteCatalog || {});
  for (const site of entries) {
    const aliases = new Set([site.key, site.domain, ...(site.aliases || [])]);
    for (const alias of aliases) {
      if (includesAlias(lowerText, alias)) {
        return site.key;
      }
    }
  }

  return '';
}

function parseChatIntent(text, options = {}) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    throw new Error('Chat text is required');
  }

  const actions = detectActions(normalizedText);
  if (actions.length === 0) {
    throw new Error('无法从句子中识别动作（支持：登录/状态/导出/清理）');
  }

  const explicitSite = String(options.site || '').trim();
  const explicitUrl = String(options.url || '').trim();
  if (explicitSite && explicitUrl) {
    throw new Error('Use either --site or --url, not both');
  }

  let site = explicitSite;
  let url = explicitUrl;

  if (!site && !url) {
    url = detectUrl(normalizedText);
    if (!url) {
      site = detectSiteKey(normalizedText);
    }
  }

  const clearConfirmed = /确认|確認|确定|確定|yes|confirm/i.test(normalizedText);

  return {
    text: normalizedText,
    actions,
    site,
    url,
    clearConfirmed,
  };
}

module.exports = {
  parseChatIntent,
};
