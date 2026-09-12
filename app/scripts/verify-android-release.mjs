import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { releaseVersion } from './android-release-version.mjs';
import { RELEASE_FIXTURE_MARKERS } from './release-fixture-markers.mjs';

export function verifyInspection(inspected, expected) {
  assert.equal(inspected.debuggable.trim(), 'false', 'APK must not be debuggable');
  assert.equal(inspected.applicationId.trim(), expected.applicationId, 'APK application ID differs from release configuration');
  assert.equal(inspected.versionName.trim(), expected.version, 'APK version name differs from release configuration');
  assert.equal(inspected.versionCode.trim(), String(expected.versionCode), 'APK version code differs from release configuration');
  assert.match(inspected.signature, /^Number of signers: 1\s*$/m, 'APK must have exactly one verified signer');
  assert.doesNotMatch(inspected.signature, /certificate DN:.*CN\s*=\s*Android Debug(?:,|$)/im, 'Android debug keys cannot sign a production APK');
  const actualDigest = inspected.signature.match(/^Signer #1 certificate SHA-256 digest: ([a-fA-F0-9]{64})\s*$/m)?.[1];
  assert.equal(actualDigest?.toLowerCase(), expected.certificateDigest.toLowerCase(), 'APK signer must match the configured release certificate');
}

export function verifyBundle(bundle) {
  assert.ok(bundle.length > 1024, 'Production APK must contain its offline JavaScript bundle');
  // Hermes can encode a string as either UTF-8 or UTF-16. Check both forms.
  for (const marker of RELEASE_FIXTURE_MARKERS) {
    for (const encoding of ['utf8', 'utf16le']) {
      assert.ok(!bundle.includes(Buffer.from(marker, encoding)), `Demo/development content must not ship: ${marker}`);
    }
  }
}

function command(file, args, encoding = 'utf8') {
  return execFileSync(file, args, { encoding, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
}

function androidTools() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  assert.ok(sdk, 'ANDROID_HOME or ANDROID_SDK_ROOT is required for APK verification');
  const tools = readdirSync(join(sdk, 'build-tools'))
    .filter(name => /^\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  assert.ok(tools.length, 'Install stable Android SDK build tools before APK verification');
  const apksigner = join(sdk, 'build-tools', tools.at(-1), 'apksigner');
  const analyzer = join(sdk, 'cmdline-tools', 'latest', 'bin', 'apkanalyzer');
  assert.ok(existsSync(apksigner) && existsSync(analyzer), 'Android SDK apksigner and apkanalyzer must be installed');
  return { apksigner, analyzer };
}

function verifyApk(apkPath) {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const app = JSON.parse(readFileSync(join(appRoot, 'app.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
  const expected = releaseVersion(app, pkg, process.env.GITHUB_REF);
  const apk = resolve(apkPath);
  for (const name of ['ANDROID_KEYSTORE_PATH', 'ANDROID_KEYSTORE_PASSWORD', 'ANDROID_KEY_ALIAS']) {
    assert.ok(process.env[name], `Missing required release signing environment variable: ${name}`);
  }
  const certificate = command('keytool', [
    '-exportcert', '-keystore', process.env.ANDROID_KEYSTORE_PATH,
    '-storetype', 'PKCS12', '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD',
    '-alias', process.env.ANDROID_KEY_ALIAS,
  ], null);
  expected.certificateDigest = readFileSync(join(appRoot, 'release-signing.sha256'), 'utf8').trim().toLowerCase();
  assert.match(expected.certificateDigest, /^[a-f0-9]{64}$/, 'Release certificate fingerprint must be SHA-256');
  assert.equal(createHash('sha256').update(certificate).digest('hex'), expected.certificateDigest, 'Signing key differs from the pinned release certificate');
  const { apksigner, analyzer } = androidTools();
  const inspect = field => command(analyzer, ['manifest', field, apk]);
  verifyInspection({
    debuggable: inspect('debuggable'),
    applicationId: inspect('application-id'),
    versionName: inspect('version-name'),
    versionCode: inspect('version-code'),
    signature: command(apksigner, ['verify', '--verbose', '--print-certs', apk]),
  }, expected);
  verifyBundle(command('unzip', ['-p', apk, 'assets/index.android.bundle'], null));

  const destination = join(appRoot, 'release');
  mkdirSync(destination, { recursive: true });
  const name = `iou-${expected.version}.apk`;
  copyFileSync(apk, join(destination, name));
  const digest = createHash('sha256').update(readFileSync(apk)).digest('hex');
  writeFileSync(join(destination, `${name}.sha256`), `${digest}  ${name}\n`);
  console.log(`Verified ${name}: non-debuggable, release certificate, correct identity/version, no demo content, SHA-256 ${digest}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 3, 'Usage: node scripts/verify-android-release.mjs path/to/app-release.apk');
  verifyApk(process.argv[2]);
}
