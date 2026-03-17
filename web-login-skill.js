#!/usr/bin/env node

'use strict';

const actions = require('./src/skill/actions');

const SUPPORTED_COMMANDS = new Set(['login', 'export', 'status', 'clear']);

function printUsage() {
  console.log('Usage: node web-login-skill.js <command> [options]');
  console.log('');
  console.log('Commands:');
  console.log('  login    Launch existing interactive login flow');
  console.log('  export   Export saved cookies for automation');
  console.log('  status   Inspect saved cookies/session metadata');
  console.log('  clear    Remove domain-scoped session artifacts');
  console.log('');
  console.log('Target selectors (use one):');
  console.log('  --site <site-key-or-alias>');
  console.log('  --url <https://target.url>');
  console.log('');
  console.log('Examples:');
  console.log('  node web-login-skill.js login --site taobao');
  console.log('  node web-login-skill.js login --url https://example.com');
  console.log('  node web-login-skill.js export --site taobao --format puppeteer');
  console.log('  node web-login-skill.js status --site taobao');
  console.log('  node web-login-skill.js clear --site taobao --yes');
}

function parseArgs(argv) {
  const result = {
    command: '',
    site: '',
    url: '',
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

  result.command = String(argv[0] || '').trim().toLowerCase();

  for (let i = 1; i < argv.length; i += 1) {
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

async function runCommand(parsed) {
  if (!SUPPORTED_COMMANDS.has(parsed.command)) {
    throw new Error(`Unknown command: ${parsed.command || '(empty)'}`);
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

  if (parsed.command === 'login') {
    const result = await actions.login(targetInput, {
      ...resolverOptions,
      debugPort: parsed.debugPort,
      chromePath: parsed.chromePath,
    });
    printJson(result);
    if (result.exitCode && result.exitCode !== 0) {
      process.exit(result.exitCode);
    }
    return;
  }

  if (parsed.command === 'export') {
    const result = actions.export(targetInput, parsed.format, resolverOptions);
    printJson(result);
    return;
  }

  if (parsed.command === 'status') {
    const result = actions.status(targetInput, resolverOptions);
    printJson(result);
    return;
  }

  if (parsed.command === 'clear') {
    const result = actions.clear(targetInput, {
      ...resolverOptions,
      yes: parsed.yes,
    });
    printJson(result);
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
