'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { SITE_CONFIGS } = require('../login_web');
const { getSiteKeywords } = require('../src/qr/monitor-core');
const {
  resolveTargetUrl,
  resolveHeadlessMode,
  TARGET_URL_OVERRIDES,
} = require('../qr-dashboard-server');

const ADAPTER_DOMAINS = [
  'dianping.com',
  'yuanbao.tencent.com',
  'doubao.com',
  'jd.com',
];

const CONFIG_KEYS = [
  'loginButtonKeywords',
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

test('dashboard headless mode parser returns expected puppeteer mode', () => {
  assert.equal(resolveHeadlessMode('1'), 'new');
  assert.equal(resolveHeadlessMode('true'), 'new');
  assert.equal(resolveHeadlessMode('0'), false);
  assert.equal(resolveHeadlessMode('false'), false);
  assert.equal(resolveHeadlessMode('no'), false);
});
