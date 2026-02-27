# web-login-cli

一个通用网站登录 CLI，使用 Puppeteer 打开浏览器并保持登录会话，供后续自动化脚本或 MCP 工具复用。

## Features

- 打开任意网站登录页并手动登录
- 自动尝试点击登录入口与二维码登录切换
- 保存 cookies 到本地
- 保存浏览器 WebSocket 调试连接信息
- 生成 MCP 配置示例

## Requirements

- Node.js >= 18

## Install

```bash
npm install
```

## Usage

```bash
# 启动登录
node login_web.js https://www.instagram.com

# 指定调试端口
node login_web.js https://www.instagram.com --debug-port 9222

# 环境变量方式
DEBUG_PORT=9333 node login_web.js https://www.douyin.com
```

登录完成后浏览器会保持打开；按 `Ctrl+C` 关闭。

## Output Files

会话文件默认写入：

- `.web-login-cli/sessions/browser-info.json`
- `.web-login-cli/sessions/cookies-<domain>.json`
- `.web-login-cli/sessions/mcp-config.json`

## Bin Command

安装后可使用：

```bash
npx login-web https://www.instagram.com
```
