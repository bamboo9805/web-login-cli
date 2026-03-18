#!/usr/bin/env node

'use strict';

const actions = require('./src/skill/actions');
const { parseChatIntent } = require('./src/skill/chat-intent');

const SUPPORTED_COMMANDS = new Set(['login', 'export', 'status', 'clear', 'chat']);

function printUsage() {
  console.log('Usage: node web-login-skill.js <command> [options]');
  console.log('   or: node web-login-skill.js "自然语言一句话"');
  console.log('');
  console.log('Commands:');
  console.log('  login    Launch existing interactive login flow');
  console.log('  export   Export saved cookies for automation');
  console.log('  status   Inspect saved cookies/session metadata');
  console.log('  clear    Remove domain-scoped session artifacts');
  console.log('  chat     Parse one natural-language sentence and run actions');
  console.log('');
  console.log('Target selectors (use one):');
  console.log('  --site <site-key-or-alias>');
  console.log('  --url <https://target.url>');
  console.log('');
  console.log('Examples:');
  console.log('  node web-login-skill.js login --site taobao');
  console.log('  node web-login-skill.js export --site taobao --format puppeteer');
  console.log('  node web-login-skill.js chat "帮我登录淘宝并导出 cookies"');
  console.log('  node web-login-skill.js "帮我登录淘宝并导出 cookies"');
  console.log('  node web-login-skill.js clear --site taobao --yes');
}

function parseArgs(argv) {
  const result = {
    command: '',
    site: '',
    url: '',
    text: '',
    format: 'puppeteer',
    yes: false,
    debugPort: '',
    chromePath: '',
    help: false,
    positional: [],
  };

  if (argv.length === 0) {
    result.help = true;
    return result;
  }

  const firstArg = String(argv[0] || '').trim();
  const firstCommand = firstArg.toLowerCase();

  let startIndex = 0;
  if (SUPPORTED_COMMANDS.has(firstCommand)) {
    result.command = firstCommand;
    startIndex = 1;
  } else {
    result.command = 'chat';
    startIndex = 0;
  }

  for (let i = startIndex; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      result.help = true;
      continue;
    }
    if (arg === '--site') {
      result.site = argv[i + 1] || '';
      if (!result.site) {
        throw new Error('Missing value for --site');
      }
      i += 1;
      continue;
    }
    if (arg.startsWith('--site=')) {
      result.site = arg.slice('--site='.length);
      continue;
    }
    if (arg === '--url') {
      result.url = argv[i + 1] || '';
      if (!result.url) {
        throw new Error('Missing value for --url');
      }
      i += 1;
      continue;
    }
    if (arg.startsWith('--url=')) {
      result.url = arg.slice('--url='.length);
      continue;
    }
    if (arg === '--text') {
      result.text = argv[i + 1] || '';
      if (!result.text) {
        throw new Error('Missing value for --text');
      }
      i += 1;
      continue;
    }
    if (arg.startsWith('--text=')) {
      result.text = arg.slice('--text='.length);
      continue;
    }
    if (arg === '--format') {
      result.format = argv[i + 1] || '';
      if (!result.format) {
        throw new Error('Missing value for --format');
      }
      i += 1;
      continue;
    }
    if (arg.startsWith('--format=')) {
      result.format = arg.slice('--format='.length);
      continue;
    }
    if (arg === '--debug-port') {
      result.debugPort = argv[i + 1] || '';
      if (!result.debugPort) {
        throw new Error('Missing value for --debug-port');
      }
      i += 1;
      continue;
    }
    if (arg.startsWith('--debug-port=')) {
      result.debugPort = arg.slice('--debug-port='.length);
      continue;
    }
    if (arg === '--chrome-path' || arg === '--executable-path') {
      result.chromePath = argv[i + 1] || '';
      if (!result.chromePath) {
        throw new Error(`Missing value for ${arg}`);
      }
      i += 1;
      continue;
    }
    if (arg.startsWith('--chrome-path=')) {
      result.chromePath = arg.slice('--chrome-path='.length);
      continue;
    }
    if (arg.startsWith('--executable-path=')) {
      result.chromePath = arg.slice('--executable-path='.length);
      continue;
    }
    if (arg === '--yes') {
      result.yes = true;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    result.positional.push(arg);
  }

  return result;
}

function pickTargetInput(parsed) {
  if (parsed.site) {
    return parsed.site;
  }
  if (parsed.url) {
    return parsed.url;
  }
  if (parsed.positional.length > 0) {
    return parsed.positional[0];
  }
  return '';
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

async function executeAction(actionName, targetInput, parsed, resolverOptions, intent = null) {
  if (actionName === 'login') {
    return actions.login(targetInput, {
      ...resolverOptions,
      debugPort: parsed.debugPort,
      chromePath: parsed.chromePath,
    });
  }

  if (actionName === 'export') {
    return actions.export(targetInput, parsed.format, resolverOptions);
  }

  if (actionName === 'status') {
    return actions.status(targetInput, resolverOptions);
  }

  if (actionName === 'clear') {
    return actions.clear(targetInput, {
      ...resolverOptions,
      yes: Boolean(parsed.yes || (intent && intent.clearConfirmed)),
    });
  }

  throw new Error(`Unsupported action: ${actionName}`);
}

async function runChatCommand(parsed) {
  const text = String(parsed.text || parsed.positional.join(' ')).trim();
  if (!text) {
    throw new Error('chat command requires sentence text (or use implicit chat mode)');
  }

  const intent = parseChatIntent(text, {
    site: parsed.site,
    url: parsed.url,
  });

  const targetInput = intent.site || intent.url;
  if (!targetInput) {
    throw new Error('无法识别目标站点，请在句子里写站点名/URL，或显式传 --site/--url');
  }

  const resolverOptions = {
    site: intent.site,
    url: intent.url,
  };

  const steps = [];
  for (const actionName of intent.actions) {
    const result = await executeAction(actionName, targetInput, parsed, resolverOptions, intent);
    steps.push({ action: actionName, result });

    if (actionName === 'login' && result && result.exitCode && result.exitCode !== 0) {
      break;
    }
  }

  return {
    mode: 'chat',
    text,
    interpreted: {
      actions: intent.actions,
      site: intent.site || null,
      url: intent.url || null,
      clearConfirmed: Boolean(intent.clearConfirmed),
    },
    steps,
  };
}

async function runCommand(parsed) {
  if (!SUPPORTED_COMMANDS.has(parsed.command)) {
    throw new Error(`Unknown command: ${parsed.command || '(empty)'}`);
  }

  if (parsed.command === 'chat') {
    const payload = await runChatCommand(parsed);
    printJson(payload);
    return;
  }

  const targetInput = pickTargetInput(parsed);
  if (!targetInput) {
    throw new Error('A target is required. Use --site or --url');
  }
  if (parsed.positional.length > 1) {
    throw new Error(`Unexpected extra arguments: ${parsed.positional.slice(1).join(' ')}`);
  }

  const resolverOptions = {
    site: parsed.site,
    url: parsed.url,
  };

  const result = await executeAction(parsed.command, targetInput, parsed, resolverOptions, null);
  printJson(result);

  if (parsed.command === 'login' && result.exitCode && result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
}

async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    if (parsed.help) {
      printUsage();
      return;
    }
    await runCommand(parsed);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    printUsage();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
