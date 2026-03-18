# web-login-cli

一个通用网站登录 CLI，使用 Puppeteer 打开浏览器并保持登录会话，供后续自动化脚本或 MCP 工具复用。

## Features

- 打开任意网站登录页并手动登录
- 自动尝试点击登录入口与二维码登录切换
- 二维码监听服务（HTTP + SSE，支持手机局域网扫码）
- 二维码监听 MCP Server（可被 Cursor/Claude 调用）
- 保存 cookies 到本地
- 保存浏览器 WebSocket 调试连接信息
- 生成 MCP 配置示例

## Built-in Site Adapters

以下站点有内置关键词/弹窗/二维码识别优化（仍支持任意 HTTP/HTTPS 站点通用登录）：

- `douyin.com`
- `jianying.com`
- `instagram.com`
- `twitter.com`
- `github.com`
- `taobao.com`
- `goofish.com`
- `dianping.com`
- `yuanbao.tencent.com`
- `doubao.com`
- `ctrip.com`（含 `flights.ctrip.com`）

## Requirements

- Node.js >= 18

## Install

```bash
npm install
```

## Browser Setup

脚本会优先使用本机已安装的 Chrome（自动探测），如果没有找到则回退到 Puppeteer 默认行为。

也可以显式指定 Chrome 路径：

```bash
# macOS
node login_web.js https://www.douyin.com --chrome-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

或者使用环境变量：

```bash
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" node login_web.js https://www.douyin.com
```

如果未安装系统 Chrome 且 Puppeteer 也未下载浏览器，可能报错：

```bash
Could not find Chrome ...
```

可执行：

```bash
npx puppeteer browsers install chrome
```

## Usage

```bash
# 启动登录
node login_web.js https://www.instagram.com

# 携程机票（内置扫码登录适配）
node login_web.js https://flights.ctrip.com

# 淘宝（内置扫码登录适配）
node login_web.js https://www.taobao.com

# 闲鱼（内置扫码登录适配）
node login_web.js https://www.goofish.com/

# 大众点评（内置扫码登录适配）
node login_web.js https://account.dianping.com/pclogin

# 元宝（内置扫码登录适配）
node login_web.js https://yuanbao.tencent.com

# 豆包（内置扫码登录适配）
node login_web.js https://www.doubao.com

# 指定调试端口
node login_web.js https://www.instagram.com --debug-port 9222

# 指定本地 Chrome 路径
node login_web.js https://www.douyin.com --chrome-path "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# 环境变量方式
DEBUG_PORT=9333 node login_web.js https://www.douyin.com

# 同时指定系统 Chrome + 调试端口
PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" DEBUG_PORT=9222 node login_web.js https://www.douyin.com
```

登录完成后浏览器会保持打开；按 `Ctrl+C` 关闭。

## QR Monitor Service

先启动目标站点登录页（端口要和 monitor 一致）：

```bash
node login_web.js https://www.douyin.com --debug-port 9222
```

另开一个终端启动二维码监听：

```bash
npm run qr:monitor
```

常用参数：

```bash
node qr-monitor-server.js --target-domain douyin.com --port 3999 --debug-port 9222
```

访问地址：

- `http://127.0.0.1:3999/qr`
- `GET /api/status`
- `GET /api/qr/current`
- `GET /api/qr/image`
- `GET /api/qr/stream` (SSE)
- `POST /api/refresh`

## QR Dashboard

启动 Web 二维码面板：

```bash
npm run qr:dashboard
```

打开：

- `http://127.0.0.1:3000/qr/jd.com`
- `http://127.0.0.1:3000/qr/taobao.com`

说明：

- 服务会自动为目标域名启动一个浏览器会话
- 前端通过 SSE 实时接收二维码和登录状态更新
- 页面也会每 5 秒同步一次最新状态
- 点击“手动刷新”会请求重新抓取二维码

## QR Monitor MCP

启动 MCP 服务：

```bash
npm run mcp:qr
```

你也可以在 MCP 配置中加入（仓库已提供示例 `mcp_config.json`）：

```json
{
  "mcpServers": {
    "qrMonitor": {
      "command": "node",
      "args": ["qr-monitor-mcp-server.js"]
    }
  }
}
```

## Output Files

会话文件默认写入：

- `.web-login-cli/sessions/browser-info.json`
- `.web-login-cli/sessions/cookies-<domain>.json`
- `.web-login-cli/sessions/mcp-config.json`
- `logs/qr-current*.png`（QR Monitor 当前二维码）
- `logs/qr-<domain>-<port>-<timestamp>.png`（QR Monitor 历史二维码）

## OpenClaw Skill Wrapper

项目新增了一个 OpenClaw 友好的包装 CLI：`web-login-skill.js`，并复用了现有 `login_web.js` 与 `.web-login-cli/sessions` 会话文件。

站点能力配置文件：

- `src/skill/sites.json`
- 关键字段：
  - `loginUrl`
  - `supportsQr`（可扫码/不可扫码）
  - `aliases`
  - `detection`（登录入口、二维码切换/定位 selectors 与关键词）
  - `successCriteria`（认证 cookie、登录成功 DOM/URL 规则）
  - `cookieDomainAllowlist`（导出与落盘时允许保留的 cookie 域名）

示例命令：

```bash
# 使用站点 key 登录（会委托给现有 login_web.js）
node web-login-skill.js login --site taobao

# 使用 URL 登录
node web-login-skill.js login --url https://example.com

# 导出 cookies（puppeteer 格式）
node web-login-skill.js export --site taobao --format puppeteer

# 查看状态（cookie 文件、mtime、数量、supportsQr、解析后的 domain/url）
node web-login-skill.js status --site taobao

# 安全清理（仅清理目标域名相关文件，需确认）
node web-login-skill.js clear --site taobao --yes

# 一句话模式（显式 chat）
node web-login-skill.js chat "帮我登录淘宝并导出 cookies"

# 一句话模式（隐式 chat，不写命令）
node web-login-skill.js "帮我查看淘宝登录状态"
```

一句话模式支持识别动作：`登录` / `状态` / `导出` / `清理`。
可在一句话中组合多个动作（例如“登录并导出”）；会按句子顺序执行。

`export --format puppeteer` 返回 JSON：

```json
{
  "cookies": [],
  "cookieCountOriginal": 20,
  "cookieCountExported": 15,
  "cookieFilteredOutCount": 5,
  "cookieDomainAllowlist": ["taobao.com", "tmall.com"],
  "setCookieSnippet": "await page.setCookie(...cookies);"
}
```

说明：`cookies` 会按站点 `cookieDomainAllowlist` 过滤，避免把无关跨域 cookie 导出给自动化脚本。

OpenClaw skill 说明见：

- `openclaw-skill/SKILL.md`

## Bin Command

安装后可使用：

```bash
npx login-web https://www.instagram.com
# or
npx web-login-skill status --site taobao
```
