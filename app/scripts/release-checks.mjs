import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { RELEASE_FIXTURE_MARKERS } from './release-fixture-markers.mjs';

// Traverse every app-owned production import, while leaving SDK packages external.
// Native bundling and APK verification remain separate checks in the release job.
const result = await build({
  absWorkingDir: fileURLToPath(new URL('..', import.meta.url)),
  entryPoints: ['index.ts'],
  bundle: true,
  packages: 'external',
  external: ['*.ttf', '*.png'],
  platform: 'neutral',
  format: 'cjs',
  resolveExtensions: ['.android.tsx', '.android.ts', '.android.js', '.native.tsx', '.native.ts', '.native.js', '.tsx', '.ts', '.jsx', '.js', '.json'],
  define: { __DEV__: 'false', 'process.env.NODE_ENV': '"production"' },
  charset: 'utf8',
  minify: true,
  write: false,
  metafile: true,
  logLevel: 'silent',
});

const sources = Object.keys(result.metafile.inputs);
assert(sources.includes('src/store/store.tsx') && sources.includes('src/initialState.ts'), 'Check must traverse the actual store and its new-install defaults');
console.log('PASS release graph includes real runtime initialization');

const forbiddenSources = sources.filter(source => /(?:^|\/)(?:scripts|__tests__|__mocks__|fixtures)(?:\/|$)|(?:^|\/)seed\.[jt]sx?$|\.(?:test|spec|stories)\.[jt]sx?$/.test(source));
assert.deepEqual(forbiddenSources, [], 'Production source graph must exclude test fixtures and mocks');
console.log('PASS production source graph excludes demo fixtures, tests and mocks');

const output = result.outputFiles.map(file => file.text).join('\n');
const includedMarkers = RELEASE_FIXTURE_MARKERS.filter(marker => output.includes(marker));
assert.deepEqual(includedMarkers, [], 'Production app code must not contain sample names or ledger content');
console.log('PASS production app code contains no sample ledger markers');

assert(!output.includes('SEED_ON_FIRST_LAUNCH'), 'Production app must not expose a sample-data initialization switch');
console.log('PASS production app has no sample-data launch switch');
console.log(`4 release checks passed (${sources.length} app-owned source files inspected).`);
