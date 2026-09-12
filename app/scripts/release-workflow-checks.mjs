import assert from 'node:assert/strict';
import { releaseVersion } from './android-release-version.mjs';
import { verifyBundle, verifyInspection, verifyNativePinWorker, verifyNativeBackupDocuments, verifyNativeBackupKeyWorker } from './verify-android-release.mjs';
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
// ApkSignerTool.java prints SDK-range labels when v3.1 verification succeeds.
// These forms come from the AOSP source, including its optional dev-release flag.
const rangeSignature = `Verifies
Verified using v3.1 scheme (APK Signature Scheme v3.1): true
Number of signers: 1
Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate DN: CN=IOU Release
Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: ${expected.certificateDigest}
Signer (minSdkVersion=24, maxSdkVersion=32) certificate DN: CN=IOU Release
Signer (minSdkVersion=24, maxSdkVersion=32) certificate SHA-256 digest: ${expected.certificateDigest}
`;
check('v3.1 SDK-range certificate labels are accepted when every range uses the pinned key', () => {
  assert.doesNotThrow(() => verifyInspection({ ...inspection, signature: rangeSignature }, expected));
});
check('v3.1 development SDK-range labels are accepted with the pinned release key', () => {
  assert.doesNotThrow(() => verifyInspection({ ...inspection, signature: rangeSignature.replace('minSdkVersion=33', 'minSdkVersion=33 (dev release=true)') }, expected));
});
// Android SDK build-tools 37.0.0 emits this label for a real v2/v3 signed APK;
// SDK 36.0.0 emits "Signer #1" for the same file and certificate.
check('real SDK 37 V3.0 signer label is accepted', () => {
  assert.doesNotThrow(() => verifyInspection({ ...inspection, signature: inspection.signature.replaceAll('Signer #1', 'V3.0 Signer:') }, expected));
});
for (const label of ['V1 Signer:', 'V2 Signer:', 'V3.1 Signer:', 'V3.2 Hybrid Classical Signer:', 'V3.2 Hybrid PQC Signer:']) {
  check(`SDK 37 ${label} still requires the pinned certificate`, () => {
    const signature = inspection.signature.replaceAll('Signer #1', label);
    assert.doesNotThrow(() => verifyInspection({ ...inspection, signature }, expected));
    assert.throws(() => verifyInspection({ ...inspection, signature: signature.replace(expected.certificateDigest, 'cd'.repeat(32)) }, expected), /signer must match/);
  });
}
// Replayed from the actual failed Actions APK inspection (build-tools 37.0.0).
// The signing certificate here is a harmless test fingerprint.
check('complete real CI v2-only verifier output is accepted', () => {
  const signature = `Verifies
Verified using v1 scheme (JAR signing): false
Verified using v2 scheme (APK Signature Scheme v2): true
Verified using v3 scheme (APK Signature Scheme v3): false
Verified using v3.1 scheme (APK Signature Scheme v3.1): false
Verified using v3.2 scheme (APK Signature Scheme v3.2): false
Verified using v4 scheme (APK Signature Scheme v4): false
Verified for SourceStamp: false
Number of signers: 1
V2 Signer: certificate DN: O=witcherxz, CN=IoU Android Release
V2 Signer: certificate SHA-256 digest: ${expected.certificateDigest}
V2 Signer: certificate SHA-1 digest: 2d65aa31dca538db4a2c6a4ac04d24927f6179e2
V2 Signer: certificate MD5 digest: ded5d6ae0c8f189a4ed0d4cc13ffaefb
V2 Signer: key algorithm: RSA
V2 Signer: key size (bits): 3072
V2 Signer: public key SHA-256 digest: 546d696299e75217e9d22ce4fc462ecf83fb95705f54eb9eb7fa34efa7fcebe1
V2 Signer: public key SHA-1 digest: 9ea4a8a3cf9c35f208a77aba3c094135d884facd
V2 Signer: public key MD5 digest: 9b0168faeb8464372620790e297094f8
`;
  assert.doesNotThrow(() => verifyInspection({ ...inspection, signature }, expected));
});
check('SDK 37 scheme labels with SDK ranges are accepted', () => {
  const signature = rangeSignature.replaceAll('Signer (minSdkVersion=33', 'V3.1 Signer: (minSdkVersion=33')
    .replaceAll('Signer (minSdkVersion=24', 'V3.0 Signer: (minSdkVersion=24');
  assert.doesNotThrow(() => verifyInspection({ ...inspection, signature }, expected));
});
check('SDK 37 generic signer label is accepted', () => {
  assert.doesNotThrow(() => verifyInspection({ ...inspection, signature: inspection.signature.replaceAll('Signer #1', 'Signer:') }, expected));
});
check('SDK 37 wrong signer certificate is rejected', () => {
  const signature = inspection.signature.replaceAll('Signer #1', 'V3.0 Signer:').replace(expected.certificateDigest, 'cd'.repeat(32));
  assert.throws(() => verifyInspection({ ...inspection, signature }, expected), /signer must match/);
});
check('a new signature scheme cannot hide a different certificate', () => {
  const signature = `${inspection.signature}V3.2 Hybrid PQC Signer: certificate SHA-256 digest: ${'cd'.repeat(32)}\n`;
  assert.throws(() => verifyInspection({ ...inspection, signature }, expected), /signer must match/);
});
check('v3.1 cannot hide a different certificate in an older SDK range', () => {
  assert.throws(() => verifyInspection({ ...inspection, signature: rangeSignature.replaceAll(`maxSdkVersion=32) certificate SHA-256 digest: ${expected.certificateDigest}`, `maxSdkVersion=32) certificate SHA-256 digest: ${'cd'.repeat(32)}`) }, expected), /signer must match/);
});
check('v3.1 ranges cannot use an Android debug certificate', () => {
  assert.throws(() => verifyInspection({ ...inspection, signature: rangeSignature.replace('CN=IOU Release', 'CN=Android Debug,O=Android,C=US') }, expected), /debug keys/);
});
check('CRLF and uppercase SHA-256 output are accepted', () => {
  assert.doesNotThrow(() => verifyInspection({ ...inspection, signature: inspection.signature.replaceAll(expected.certificateDigest, expected.certificateDigest.toUpperCase()).replaceAll('\n', '\r\n') }, expected));
});
check('source stamp and public-key fingerprints cannot replace the APK certificate', () => {
  const signature = `Verifies\nNumber of signers: 1\nSource Stamp Signer certificate SHA-256 digest: ${expected.certificateDigest}\nSigner #1 public key SHA-256 digest: ${expected.certificateDigest}\n`;
  assert.throws(() => verifyInspection({ ...inspection, signature }, expected), /digest is missing/);
});
check('source stamp and public-key fingerprints do not override the correct APK certificate', () => {
  const signature = `${inspection.signature}Source Stamp Signer certificate SHA-256 digest: ${'cd'.repeat(32)}\nSigner #1 public key SHA-256 digest: ${'ef'.repeat(32)}\n`;
  assert.doesNotThrow(() => verifyInspection({ ...inspection, signature }, expected));
});
check('malformed SHA-256 digest is rejected explicitly', () => {
  assert.throws(() => verifyInspection({ ...inspection, signature: inspection.signature.replace(expected.certificateDigest, expected.certificateDigest.slice(2)) }, expected), /Malformed/);
});
check('changed display labels cannot evade certificate verification', () => {
  const signature = inspection.signature.replaceAll('Signer #1', 'Future SDK Signer #1:');
  assert.doesNotThrow(() => verifyInspection({ ...inspection, signature }, expected));
  assert.throws(() => verifyInspection({ ...inspection, signature: signature.replace(expected.certificateDigest, 'cd'.repeat(32)) }, expected), /signer must match/);
});
check('a certificate repeated by signing schemes must always match the pinned key', () => {
  assert.doesNotThrow(() => verifyInspection({ ...inspection, signature: `${inspection.signature}Signer #1 certificate SHA-256 digest: ${expected.certificateDigest}\n` }, expected));
  assert.throws(() => verifyInspection({ ...inspection, signature: `${inspection.signature}Signer #1 certificate SHA-256 digest: ${'cd'.repeat(32)}\n` }, expected), /signer must match/);
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

// Minimal DEX table fixtures exercise compiled class definitions and split DEX.
// They intentionally contain no executable code; Android verifies the real APK.
function dexFixture(descriptors, definitions = descriptors.map((_, i) => i)) {
  const stringOffset = 112;
  const typeOffset = stringOffset + descriptors.length * 4;
  const classOffset = typeOffset + descriptors.length * 4;
  const dataOffset = classOffset + definitions.length * 32;
  const encoded = descriptors.map(name => Buffer.concat([Buffer.from([name.length]), Buffer.from(name), Buffer.from([0])]));
  const dex = Buffer.alloc(dataOffset + encoded.reduce((sum, value) => sum + value.length, 0));
  dex.write('dex\n037\0', 0, 'ascii');
  dex.writeUInt32LE(dex.length, 32); dex.writeUInt32LE(112, 36); dex.writeUInt32LE(0x12345678, 40);
  dex.writeUInt32LE(descriptors.length, 56); dex.writeUInt32LE(stringOffset, 60);
  dex.writeUInt32LE(descriptors.length, 64); dex.writeUInt32LE(typeOffset, 68);
  dex.writeUInt32LE(definitions.length, 96); dex.writeUInt32LE(classOffset, 100);
  let cursor = dataOffset;
  encoded.forEach((value, i) => {
    dex.writeUInt32LE(cursor, stringOffset + i * 4); dex.writeUInt32LE(i, typeOffset + i * 4);
    value.copy(dex, cursor); cursor += value.length;
  });
  definitions.forEach((typeIndex, i) => dex.writeUInt32LE(typeIndex, classOffset + i * 32));
  return dex;
}
const nativeClasses = ['Lexpo/modules/iouprivacycrypto/IouPrivacyCryptoModule;', 'Lexpo/modules/iouprivacycrypto/PinKdf;'];
check('compiled native PIN classes in one DEX are accepted', () => {
  assert.doesNotThrow(() => verifyNativePinWorker([dexFixture(nativeClasses)]));
});
check('native PIN classes split across DEX files are accepted', () => {
  assert.doesNotThrow(() => verifyNativePinWorker(nativeClasses.map(name => dexFixture([name]))));
});
check('missing DEX files cannot release the JavaScript fallback', () => {
  assert.throws(() => verifyNativePinWorker([]), /compiled DEX/);
});
for (const missing of nativeClasses) {
  check(`missing compiled ${missing} is rejected`, () => {
    assert.throws(() => verifyNativePinWorker([dexFixture(nativeClasses.filter(name => name !== missing))]), /missing native PIN worker class/);
  });
}
check('descriptor strings without compiled class definitions cannot satisfy the native guard', () => {
  assert.throws(() => verifyNativePinWorker([dexFixture(nativeClasses, [])]), /missing native PIN worker class/);
});
check('truncated DEX data is rejected before descriptor inspection', () => {
  assert.throws(() => verifyNativePinWorker([dexFixture(nativeClasses).subarray(0, -8)]), /Truncated DEX/);
  assert.throws(() => verifyNativePinWorker([Buffer.alloc(8)]), /Truncated/);
});
check('out-of-range DEX tables cannot masquerade as compiled native classes', () => {
  const malformed = dexFixture(nativeClasses);
  malformed.writeUInt32LE(malformed.length, 100);
  assert.throws(() => verifyNativePinWorker([malformed]), /Truncated DEX table/);
});
const backupDocumentClass = 'Lexpo/modules/ioubackupdocuments/IouBackupDocumentsModule;';
check('compiled native backup documents module is accepted alongside the PIN worker', () => {
  const dex = [dexFixture([...nativeClasses, backupDocumentClass])];
  assert.doesNotThrow(() => verifyNativePinWorker(dex));
  assert.doesNotThrow(() => verifyNativeBackupDocuments(dex));
});
check('backup documents and PIN modules may reside in different DEX files', () => {
  const dex = [dexFixture(nativeClasses), dexFixture([backupDocumentClass])];
  assert.doesNotThrow(() => verifyNativePinWorker(dex));
  assert.doesNotThrow(() => verifyNativeBackupDocuments(dex));
});
check('PIN worker presence cannot hide an absent backup documents module', () => {
  const dex = [dexFixture(nativeClasses)];
  assert.doesNotThrow(() => verifyNativePinWorker(dex));
  assert.throws(() => verifyNativeBackupDocuments(dex), /missing native backup documents module/);
});
check('an unused backup module descriptor cannot satisfy the compiled-module guard', () => {
  assert.throws(() => verifyNativeBackupDocuments([dexFixture([backupDocumentClass], [])]), /missing native backup documents module/);
});
const backupKeyClasses = [nativeClasses[0], 'Lexpo/modules/iouprivacycrypto/BackupKdf;'];
check('compiled backup key worker and native bridge are accepted in one DEX', () => {
  assert.doesNotThrow(() => verifyNativeBackupKeyWorker([dexFixture(backupKeyClasses)]));
});
check('backup key worker and native bridge may reside in different DEX files', () => {
  assert.doesNotThrow(() => verifyNativeBackupKeyWorker(backupKeyClasses.map(name => dexFixture([name]))));
});
for (const missing of backupKeyClasses) {
  check(`backup key release rejects missing compiled ${missing}`, () => {
    assert.throws(() => verifyNativeBackupKeyWorker([dexFixture(backupKeyClasses.filter(name => name !== missing))]), /missing native backup key worker class/);
  });
}
check('unused backup key descriptors cannot release the slow JavaScript fallback', () => {
  assert.throws(() => verifyNativeBackupKeyWorker([dexFixture(backupKeyClasses, [])]), /missing native backup key worker class/);
});
console.log(`${count} Android release checks passed.`);
