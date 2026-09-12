import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function releaseVersion(appConfig, packageConfig, ref = '') {
  const { version, android } = appConfig.expo;
  assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/, 'Use a safe semantic release version');
  assert.equal(packageConfig.version, version, 'Expo and package versions must agree');
  assert.ok(Number.isSafeInteger(android.versionCode) && android.versionCode > 0, 'Android versionCode must be a positive integer');
  assert.match(android.package, /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/, 'Use a valid Android application ID');
  assert.ok(!android.package.startsWith('com.example.'), 'Production application ID must not use the template namespace');
  if (ref.startsWith('refs/tags/')) assert.equal(ref, `refs/tags/v${version}`, 'Release tag must match the app version');
  return { version, artifact: `iou-${version}`, versionCode: android.versionCode, applicationId: android.package };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'));
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const result = releaseVersion(config, pkg, process.env.GITHUB_REF);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${result.version}\nartifact=${result.artifact}\n`);
  }
  console.log(`Production Android ${result.applicationId} ${result.version} (${result.versionCode})`);
}
