# Android alpha releases

The application version is `0.1.0-alpha.1`, Android version code `1`, and production application ID `io.github.witcherxz.iou`. The same version is recorded in `app.json`, `package.json`, and the package-lock root. iOS uses the numeric marketing version `0.1.0` and build number `1` if built separately.

## Build and publish

1. Update the version in all three files, increase Android `versionCode`, and add `docs/releases/<version>.md`.
2. Run `npm run typecheck` and `npm run check`. The release check traverses the production source graph and rejects test fixtures, mocks, sample ledger markers and seeding switches.
3. Commit/push the reviewed changes. Main-branch Actions runs produce a signed APK artifact.
4. Push a matching version tag, such as `v0.1.0-alpha.1`. Actions builds and verifies the APK, then publishes it and its `.apk.sha256` checksum to a GitHub prerelease. Tag/version mismatches fail.

The workflow runs checks for pull requests without exposing signing credentials. Release builds use Node 22, JDK 17, Expo prebuild, and Gradle `:app:assembleRelease`. A Gradle init script assigns the dedicated release signing configuration and disables debugging; it does not silently fall back to the template debug key.

Before upload, the APK verifier checks package ID, version name/code, non-debuggable manifest, signature certificate, embedded Hermes/JavaScript and absence of demo fixture content. Downloaded APK checksums can be verified using:

```bash
sha256sum -c iou-0.1.0-alpha.1.apk.sha256
```

## Signing key

Repository Actions secrets contain `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. The key is a password-protected PKCS12 store with alias `iou-release`. All four secrets must be present. Signing material is decoded only into the runner's temporary directory and removed after the build. Key/password files must never be committed or uploaded with artifacts.

The public release certificate SHA-256 is:

```text
9a191eff750459eb5a2508e7875c9bad4bf4062fa488de057f6b4cf491faf5a6
```

The initial encrypted store and its private credential record are retained locally outside the repository at `/home/ak/.local/share/iou/signing/`, with directory mode `700` and file mode `600`. Keep a protected backup of that directory: future APK updates must use the same signing key. GitHub secrets cannot be retrieved as a replacement key backup. Certificate fingerprints are public; private keys and passwords are not.

## Production data and migration

Fresh installations create empty `دفتري` defaults only after all storage sources have been read successfully and found empty. Sample records live in `scripts/fixtures` and are excluded from runtime imports. The release verifier also scans the packaged JavaScript for fixture markers. Existing data is never removed by matching people's names or transaction contents.

The old debug package was `com.example.iou` and used the Expo template signing key. The production package installs separately, preserving the old app for backup/export. Import real records into the alpha and verify them before removing the old app. Future releases retain the production ID and signing key and increment the version code.

Alpha release notes record remaining device verification, including biometrics, notification delivery, app-switcher privacy and folder-provider behavior. A successful production build establishes packaging and signing, not hardware behavior.
