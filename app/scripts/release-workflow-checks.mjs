import assert from 'node:assert/strict';
import { releaseVersion } from './android-release-version.mjs';
import { verifyBundle, verifyInspection } from './verify-android-release.mjs';
import { RELEASE_FIXTURE_MARKERS } from './release-fixture-markers.mjs';

let count = 0;
function check(name, run) {
  run();
  count += 1;
  console.log(`✓ ${name}`);
}

const config = { expo: { version: '0.1.0-alpha.1', android: { versionCode: 1, package: 'io.github.witcherxz.iou' } } };
const pkg = { version: '0.1.0-alpha.1' };
const expected = { ...releaseVersion(config, pkg), certificateDigest: 'ab'.repeat(32) };
const inspection = {
  debuggable: 'false\n',
  applicationId: expected.applicationId,
  versionName: expected.version,
  versionCode: '1',
  signature: `Verifies\nNumber of signers: 1\nSigner #1 certificate DN: CN=IOU Release\nSigner #1 certificate SHA-256 digest: ${expected.certificateDigest}\n`,
};
check('matching alpha tag and configuration are accepted', () => {
  assert.equal(releaseVersion(config, pkg, 'refs/tags/v0.1.0-alpha.1').version, pkg.version);
});
check('release tag must match app version', () => {
  assert.throws(() => releaseVersion(config, pkg, 'refs/tags/v0.2.0'), /tag must match/);
});
check('package version must match app version', () => {
  assert.throws(() => releaseVersion(config, { version: '1.0.0' }), /versions must agree/);
});
check('unsafe version text cannot become a path or workflow output', () => {
  assert.throws(() => releaseVersion({ expo: { ...config.expo, version: '../escape\nartifact=other' } }, pkg), /safe semantic/);
});
check('Android version code cannot be zero', () => {
  assert.throws(() => releaseVersion({ expo: { ...config.expo, android: { ...config.expo.android, versionCode: 0 } } }, pkg), /positive integer/);
});
check('template application ID cannot be released', () => {
  assert.throws(() => releaseVersion({ expo: { ...config.expo, android: { ...config.expo.android, package: 'com.example.iou' } } }, pkg), /template namespace/);
});
check('non-debuggable APK with correct identity and release certificate is accepted', () => {
  assert.doesNotThrow(() => verifyInspection(inspection, expected));
});
for (const [field, value, reason] of [
  ['debuggable', 'true', /not be debuggable/],
  ['debuggable', '', /not be debuggable/],
  ['applicationId', 'com.example.iou', /application ID/],
  ['versionName', '1.0.0', /version name/],
  ['versionCode', '2', /version code/],
]) {
  check(`rejects invalid APK ${field} ${JSON.stringify(value)}`, () => {
    assert.throws(() => verifyInspection({ ...inspection, [field]: value }, expected), reason);
  });
}
check('debug-signed APK is rejected even if its fingerprint were configured', () => {
  assert.throws(() => verifyInspection({ ...inspection, signature: inspection.signature.replace('CN=IOU Release', 'CN=Android Debug,O=Android,C=US') }, expected), /debug keys/);
});
check('APK signed by a different key is rejected', () => {
  assert.throws(() => verifyInspection({ ...inspection, signature: inspection.signature.replace(expected.certificateDigest, 'cd'.repeat(32)) }, expected), /signer must match/);
});
check('missing APK signature is rejected', () => {
  assert.throws(() => verifyInspection({ ...inspection, signature: 'DOES NOT VERIFY' }, expected), /exactly one/);
});
check('APK with multiple signers is rejected', () => {
  assert.throws(() => verifyInspection({ ...inspection, signature: inspection.signature.replace('Number of signers: 1', 'Number of signers: 2') }, expected), /exactly one/);
});
check('missing embedded production bundle is rejected', () => {
  assert.throws(() => verifyBundle(Buffer.alloc(0)), /offline JavaScript bundle/);
});
check('embedded bundle without demo content is accepted', () => {
  assert.doesNotThrow(() => verifyBundle(Buffer.alloc(2048)));
});
for (const marker of RELEASE_FIXTURE_MARKERS) {
  for (const encoding of ['utf8', 'utf16le']) {
    check(`fixture ${JSON.stringify(marker)} is rejected in ${encoding} Hermes strings`, () => {
      assert.throws(() => verifyBundle(Buffer.concat([Buffer.alloc(2048), Buffer.from(marker, encoding)])), /must not ship/);
    });
  }
}
console.log(`${count} Android release checks passed.`);
