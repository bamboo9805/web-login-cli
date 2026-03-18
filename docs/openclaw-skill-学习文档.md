# web-login-cli OpenClaw Skill 学习文档

## 1. 代码思路（原项目 + Skill 封装）

### 1.1 原项目核心（`login_web.js`）
- 基于 Puppeteer 启动可见浏览器进行人工登录。
- 登录后将 cookies 落盘到 `.web-login-cli/sessions/cookies-<domain>.json`。
- 后续自动化脚本可复用这些 cookies，避免重复登录。

### 1.2 Skill 封装目标
把“网站登录能力”统一成 OpenClaw 可调用的动作接口，减少每次手写命令和站点判断逻辑。

### 1.3 封装后的结构
- 入口：`web-login-skill.js`
- 动作实现：`src/skill/actions.js`
- 站点解析：`src/skill/site-resolver.js`
- 站点能力配置：`src/skill/sites.json`
- Skill 说明：`openclaw-skill/SKILL.md`

### 1.4 关键设计
1) **统一动作接口**：
- `login`：拉起现有登录流程
- `export`：导出 cookies（puppeteer 格式）
- `status`：查看会话状态
- `clear`：按域名清理会话文件
- `chat`：一句话自然语言解析并执行动作链

2) **站点能力模型**（`supportsQr`）：
- 对不同站点配置 `supportsQr=true/false`。
- 对 OpenClaw 或上层流程可直接暴露“是否支持扫码”能力。

3) **站点解析策略**：
- 支持 `--site`（站点 key/别名）和 `--url`（显式 URL）。
- `aliases` 做多别名映射（如 `tb` -> `taobao`）。
- 通过域名匹配把 URL 自动映射到已知站点。

4) **安全清理策略**：
- `clear` 必须带 `--yes`。
- 只删除目标域名 cookie/QR 相关文件，避免误删全局文件。

5) **自然语言解析策略**：
- 支持显式 chat：`node web-login-skill.js chat "帮我登录淘宝并导出 cookies"`。
- 支持隐式 chat：`node web-login-skill.js "帮我查看淘宝状态"`。
- 支持动作识别：登录 / 状态 / 导出 / 清理，并可在一句话组合多个动作按顺序执行。
- 清理动作默认安全保护：需 `--yes` 或句子里包含“确认/确定/yes/confirm”。

---

## 2. 本次修改方案（我做了什么）

### 2.1 新增能力
- 新增 OpenClaw 友好 CLI：`web-login-skill.js`
- 新增一句话自然语言入口：`chat`（含隐式 chat）
- 新增自然语言意图解析器：`src/skill/chat-intent.js`
- 新增站点能力配置：`src/skill/sites.json`
- 新增解析器：`src/skill/site-resolver.js`
- 新增动作层：`src/skill/actions.js`
- 新增 Skill 文档：`openclaw-skill/SKILL.md`
- 更新 `package.json`：加入 `web-login-skill` bin 与 `check` 校验脚本
- 更新 `README.md`：补充 OpenClaw Skill Wrapper 使用说明

### 2.2 可复用结果
- 可以用统一命令管理登录会话，不再手动拼接不同脚本。
- 可以一句话触发动作链，不需要记 `login/export/status/clear` 细节命令。
- `export` 可以直接给 Puppeteer 注入 cookies。
- `status` 方便做“是否已登录”的自动检查。

### 2.3 验证结果
- 已执行：`npm run check`（语法检查通过）
- 已打包技能文件：`dist/openclaw-skill.skill`

---

## 3. 你如何使用（校验清单）

### 3.1 本地命令（在仓库根目录）
```bash
# 1) 登录（站点）
node web-login-skill.js login --site taobao

# 2) 登录（URL）
node web-login-skill.js login --url https://github.com/login

# 3) 导出 cookies（Puppeteer）
node web-login-skill.js export --site taobao --format puppeteer

# 4) 查看状态
node web-login-skill.js status --site taobao

# 5) 清理会话（安全确认）
node web-login-skill.js clear --site taobao --yes
```

### 3.2 一句话模式（推荐）
```bash
# 显式 chat
node web-login-skill.js chat "帮我登录淘宝并导出 cookies"

# 隐式 chat（不用记命令）
node web-login-skill.js "帮我查看淘宝登录状态"
```

### 3.3 npm/npx 用法
```bash
npx web-login-skill status --site taobao
```

### 3.4 Skill 打包产物
- 打包文件：`dist/openclaw-skill.skill`
- 说明文件：`openclaw-skill/SKILL.md`

---

## 4. 后续可选增强（建议）
- 给 `export` 增加 Playwright 格式输出。
- 给 `status` 增加“cookie 是否过期”的判断。
- 给 `sites.json` 扩展更多站点（JD、抖音、携程等）并补充别名。
- 给 `clear` 增加 `--dry-run`，先预览再删除。
