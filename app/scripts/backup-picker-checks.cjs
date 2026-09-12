/** Exercise installed Expo57 JS against the exact Android record-shaped boundary. */
const { build } = require('esbuild');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const app = path.resolve(__dirname, '..');
const stub = path.join(__dirname, 'backup-picker-native-stub.ts');
const outfile = path.join(app, 'node_modules/.cache/backup-picker-checks.js');
build({
  entryPoints: [path.join(__dirname, 'backup-picker-checks.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile,
  plugins: [
    {
      name: 'native-only',
      setup(b) {
        b.onResolve({ filter: /^(expo-modules-core|react-native|expo-crypto|expo-sharing)$/ }, () => ({
          path: stub,
        }));
        b.onResolve({ filter: /^expo-file-system$/ }, () => ({
          path: path.join(app, 'node_modules/expo-file-system/src/FileSystem.ts'),
        }));
      },
    },
  ],
  logLevel: 'error',
})
  .then(() => {
    const result = spawnSync(process.execPath, [outfile], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
