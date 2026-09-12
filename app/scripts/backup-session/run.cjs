#!/usr/bin/env node
/**
 * Real React useBackup/StoreProvider lifecycle regressions, isolated in Chromium.
 * Install Playwright separately or set BACKUP_TEST_PLAYWRIGHT to its module path.
 * Optional BACKUP_TEST_CHROMIUM selects an existing executable; otherwise the
 * browser installed by Playwright is used. No device, account, or upload access.
 *
 * npm run check:backup-session -- --output=/path/to/results.json
 * npm run check:backup-session -- --baseline=v0.1.0-alpha.10
 * Baseline mode substitutes only that tag's hook/store and reports the original
 * failures against today's fixtures. Expected baseline failures do not fail CI.
 */
const { build } = require('esbuild');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const scenarios = require('./scenarios.cjs');

const app = path.resolve(__dirname, '../..');
const repository = path.dirname(app);
const args = process.argv.slice(2);
const baselineArg = args.find((arg) => arg.startsWith('--baseline='));
const baseline = baselineArg?.slice('--baseline='.length);
if (baseline && baseline !== 'v0.1.0-alpha.10') {
  throw new Error('The supported explicit comparison baseline is v0.1.0-alpha.10');
}
if (args.some((arg) => !arg.startsWith('--output=') && !arg.startsWith('--baseline='))) {
  throw new Error('Supported arguments: --output=PATH and --baseline=v0.1.0-alpha.10');
}
const output = path.resolve(
  args.find((arg) => arg.startsWith('--output='))?.slice('--output='.length) ||
    path.join(app, 'node_modules/.cache/backup-session-results.json'),
);

function playwright() {
  if (process.env.BACKUP_TEST_PLAYWRIGHT) return require(process.env.BACKUP_TEST_PLAYWRIGHT);
  for (const name of ['playwright', '@playwright/test']) {
    try {
      return require(name);
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  throw new Error(
    'Install Playwright or set BACKUP_TEST_PLAYWRIGHT to its module path; browser tests are optional to npm check.',
  );
}

async function main() {
  const { chromium } = playwright();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'iou-backup-session-'));
  let server;
  let browser;
  try {
    const runtime = path.join(__dirname, 'runtime-stub.ts');
    await build({
      entryPoints: [path.join(__dirname, 'harness.tsx')],
      bundle: true,
      format: 'iife',
      jsx: 'automatic',
      outfile: path.join(directory, 'harness.js'),
      nodePaths: [path.join(app, 'node_modules')],
      logLevel: 'error',
      plugins: [
        {
          name: 'controlled-backup-boundaries',
          setup(builder) {
            if (baseline) {
              builder.onLoad({ filter: /\/src\/(useBackup\.ts|store\/store\.tsx)$/ }, ({ path: source }) => ({
                contents: execFileSync(
                  'git',
                  ['show', `${baseline}:${path.relative(repository, source).split(path.sep).join('/')}`],
                  { cwd: repository, encoding: 'utf8' },
                ),
                loader: source.endsWith('.tsx') ? 'tsx' : 'ts',
                resolveDir: path.dirname(source),
              }));
            }
            builder.onResolve(
              { filter: /^(@react-native-async-storage\/async-storage|react-native|expo)$/ },
              () => ({ path: runtime }),
            );
            builder.onResolve({ filter: /^expo-file-system$/ }, () => ({
              path: path.join(app, 'scripts/backup-filesystem-stub.ts'),
            }));
            builder.onResolve(
              { filter: /^(\.\/backup\/(google|fileShare|folder|encrypted)|\.\/config\/google)$/ },
              () => ({ path: path.join(__dirname, 'bridge.ts') }),
            );
          },
        },
      ],
    });
    const html =
      '<!doctype html><meta charset="utf-8"><div id="root"></div><script src="/harness.js"></script>';
    server = http.createServer((request, response) => {
      if (request.url === '/harness.js') {
        response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
        response.end(fs.readFileSync(path.join(directory, 'harness.js')));
      } else if (request.url === '/' || request.url === '/?store=1') {
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        response.end(html);
      } else {
        response.writeHead(404);
        response.end();
      }
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    browser = await chromium.launch({
      headless: true,
      ...(process.env.BACKUP_TEST_CHROMIUM ? { executablePath: process.env.BACKUP_TEST_CHROMIUM } : {}),
    });
    const checks = await scenarios(browser, `http://127.0.0.1:${server.address().port}/`);
    const result = {
      mode: baseline ? 'baseline' : 'current',
      baseline: baseline ?? null,
      passed: checks.filter((check) => check.passed).length,
      failed: checks.filter((check) => !check.passed).length,
      scope:
        'Actual React hook/store with controlled I/O and private-host unmount; not native provider or encryption verification.',
      checks,
    };
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify(result, null, 2));
    console.log(`Evidence: ${output}`);
    if (!baseline && result.failed) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
