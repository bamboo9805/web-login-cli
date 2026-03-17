---
name: web-login-cli
description: 封装 web-login-cli 为 OpenClaw 可复用登录技能，支持按站点能力模型区分 supportsQr=true/false，并通过 login/export/status/clear 四个动作管理登录会话与 Puppeteer cookies 复用。用于“打开登录页并人工完成登录→保存会话→导出 Puppeteer 可用 cookies→查看或清理会话”。
---

# web-login-cli OpenClaw Skill

使用本技能时，统一调用包装命令：`node web-login-skill.js <action> ...`。

## 动作

### 1) login(site|url, options)

- `node web-login-skill.js login --site <site>`
- `node web-login-skill.js login --url <https-url>`
- 可选：`--debug-port <port> --chrome-path <path>`

说明：复用现有 `login_web.js` 的交互式登录流程（可见浏览器、人机登录、会话落盘）。

### 2) export(site|url, format="puppeteer")

- `node web-login-skill.js export --site <site> --format puppeteer`

输出 JSON：

```json
{
  "cookies": [],
  "setCookieSnippet": "await page.setCookie(...cookies);"
}
```

### 3) status(site|url)

- `node web-login-skill.js status --site <site>`

输出：解析后的 `domain/loginUrl/supportsQr`、cookie 文件是否存在、修改时间、cookie 数量。

### 4) clear(site|url)

- `node web-login-skill.js clear --site <site> --yes`

安全策略：仅清理目标域名对应的 `.web-login-cli/sessions` 产物，不做全局删除。

## 站点能力模型

配置文件：`src/skill/sites.json`

字段：

- `loginUrl`：站点默认登录入口
- `supportsQr`：是否支持扫码流程
- `aliases`：别名（站点 key/域名简写）

## 备注

- 未知域名（`--url` 直传）默认 `supportsQr=false`。
- 登录会话产物复用已有路径：`.web-login-cli/sessions`。
