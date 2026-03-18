---
name: web-login-cli
description: 封装 web-login-cli 为 OpenClaw 可复用登录技能，支持按站点能力模型区分 supportsQr=true/false，并通过 login/export/status/clear/chat 动作管理登录会话与 Puppeteer cookies 复用。支持一句话自然语言调用（如“帮我登录淘宝并导出 cookies”），用于“打开登录页并人工完成登录→保存会话→导出 Puppeteer 可用 cookies→查看或清理会话”。
---

# web-login-cli OpenClaw Skill

使用本技能时，优先走一句话模式：`node web-login-skill.js "<自然语言请求>"`。

如果需要精确控制，再使用显式动作模式：`node web-login-skill.js <action> ...`。

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

### 5) chat(text)

- `node web-login-skill.js chat "帮我登录淘宝并导出 cookies"`
- `node web-login-skill.js "帮我查看淘宝登录状态"`（隐式 chat）

支持识别动作：`登录` / `状态` / `导出` / `清理`。
一句话可组合多动作（例如“登录并导出”），按句子顺序执行。

清理动作默认仍受保护：
- 需显式 `--yes`，或在自然语言中包含“确认/确定/yes/confirm”。

## 站点能力模型

配置文件：`src/skill/sites.json`

字段：

- `loginUrl`：站点默认登录入口
- `supportsQr`：是否支持扫码流程
- `aliases`：别名（站点 key/域名简写）

## 备注

- 未知域名（`--url` 直传）默认 `supportsQr=false`。
- 登录会话产物复用已有路径：`.web-login-cli/sessions`。
