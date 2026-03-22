'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SITE_CONFIGS,
  resolveLoginEntryClickPath: resolveWebLoginEntryClickPath,
} = require('../login_web');
const {
  getSiteKeywords,
  resolveLoginEntryClickPath: resolveMonitorLoginEntryClickPath,
} = require('../src/qr/monitor-core');
const {
  resolveTargetUrl,
  resolveJdTargetUrl,
  resolveHeadlessMode,
  TARGET_URL_OVERRIDES,
  getJdLoginTargets,
  getJdLoginHostAllowlist,
  isAllowedJdLoginHost,
} = require('../qr-dashboard-server');

const ADAPTER_DOMAINS = [
  'dianping.com',
  'yuanbao.tencent.com',
  'doubao.com',
  'jd.com',
];

const CONFIG_KEYS = [
  'loginButtonKeywords',
  'loginEntrySelectors',
  'qrTabKeywords',
  'qrHintKeywords',
  'loginModalSelectors',
  'qrCodeSelectors',
  'qrSwitchSelectors',
];

test('site adapters are aligned between login_web and monitor-core', () => {
  for (const domain of ADAPTER_DOMAINS) {
    const webConfig = SITE_CONFIGS[domain];
    assert.ok(webConfig, `login_web missing adapter config for ${domain}`);

    const monitorConfig = getSiteKeywords(domain);
    assert.ok(monitorConfig, `monitor-core missing adapter config for ${domain}`);

    for (const key of CONFIG_KEYS) {
      const webValues = Array.isArray(webConfig[key]) ? webConfig[key] : [];
      const monitorValues = Array.isArray(monitorConfig[key]) ? monitorConfig[key] : [];

      for (const value of webValues) {
        assert.ok(
          monitorValues.includes(value),
          `monitor-core ${domain} missing ${key} value: ${value}`
        );
      }
    }

    assert.ok(
      Array.isArray(webConfig.qrHintKeywords) && webConfig.qrHintKeywords.length > 0,
      `${domain} should expose qrHintKeywords`
    );
    assert.ok(
      Array.isArray(webConfig.qrCodeSelectors) && webConfig.qrCodeSelectors.length > 0,
      `${domain} should expose qrCodeSelectors`
    );
  }
});

test('adapter-specific keywords/selectors are present for recent sites', () => {
  assert.ok(
    SITE_CONFIGS['dianping.com'].qrHintKeywords.includes('大众点评'),
    'dianping.com should include 大众点评 keyword'
  );
  assert.ok(
    SITE_CONFIGS['yuanbao.tencent.com'].qrHintKeywords.includes('元宝'),
    'yuanbao.tencent.com should include 元宝 keyword'
  );
  assert.ok(
    SITE_CONFIGS['doubao.com'].qrHintKeywords.includes('豆包'),
    'doubao.com should include 豆包 keyword'
  );
  assert.ok(
    SITE_CONFIGS['jd.com'].qrCodeSelectors.includes('#passport-main-qrcode-img'),
    'jd.com should include passport qrcode selector'
  );
  assert.ok(
    SITE_CONFIGS['jd.com'].loginEntrySelectors.includes('.link-login'),
    'jd.com should include deterministic login entry selectors'
  );
});

test('dashboard target override includes zhihu signin entry', () => {
  assert.equal(
    TARGET_URL_OVERRIDES['zhihu.com'],
    'https://www.zhihu.com/signin'
  );
  assert.equal(
    resolveTargetUrl('zhihu.com'),
    'https://www.zhihu.com/signin'
  );
  assert.equal(
    resolveTargetUrl('https://www.zhihu.com/signin?from=foo'),
    'https://www.zhihu.com/signin'
  );
});

test('dashboard resolves JD to preferred login target with fallback list exported', () => {
  const targets = getJdLoginTargets();
  assert.ok(Array.isArray(targets) && targets.length >= 2, 'JD target list should be non-empty');
  assert.equal(resolveJdTargetUrl(), targets[0]);
  assert.equal(resolveTargetUrl('jd.com'), targets[0]);
  assert.equal(resolveTargetUrl('https://www.jd.com/?from=test'), targets[0]);
});

test('dashboard JD allowlist matcher accepts JD login flow hosts', () => {
  const allowlist = getJdLoginHostAllowlist();
  assert.ok(allowlist.includes('passport.jd.com'));
  assert.ok(allowlist.includes('plogin.m.jd.com'));

  assert.equal(isAllowedJdLoginHost('passport.jd.com'), true);
  assert.equal(isAllowedJdLoginHost('https://plogin.m.jd.com/login/login'), true);
  assert.equal(isAllowedJdLoginHost('https://order.jd.com/center/list.action'), true);
  assert.equal(isAllowedJdLoginHost('example.com'), false);
});

test('login entry telemetry helper prefers selector path before keyword path', () => {
  const selectorHit = {
    clicked: true,
    selector: '.link-login',
    text: '登录',
    tag: 'a',
  };
  const keywordHit = {
    clicked: true,
    text: '登录',
    tag: 'a',
  };

  const webSelectorPath = resolveWebLoginEntryClickPath(selectorHit, keywordHit);
  const monitorSelectorPath = resolveMonitorLoginEntryClickPath(selectorHit, keywordHit);
  assert.equal(webSelectorPath.path, 'selector');
  assert.equal(monitorSelectorPath.path, 'selector');

  const webKeywordPath = resolveWebLoginEntryClickPath({ clicked: false }, keywordHit);
  const monitorKeywordPath = resolveMonitorLoginEntryClickPath({ clicked: false }, keywordHit);
  assert.equal(webKeywordPath.path, 'keyword');
  assert.equal(monitorKeywordPath.path, 'keyword');

  const webNonePath = resolveWebLoginEntryClickPath({ clicked: false }, { clicked: false });
  const monitorNonePath = resolveMonitorLoginEntryClickPath({ clicked: false }, { clicked: false });
  assert.equal(webNonePath.path, 'none');
  assert.equal(monitorNonePath.path, 'none');
});

test('dashboard headless mode parser returns expected puppeteer mode', () => {
  assert.equal(resolveHeadlessMode('1'), 'new');
  assert.equal(resolveHeadlessMode('true'), 'new');
  assert.equal(resolveHeadlessMode('0'), false);
  assert.equal(resolveHeadlessMode('false'), false);
  assert.equal(resolveHeadlessMode('no'), false);
});
