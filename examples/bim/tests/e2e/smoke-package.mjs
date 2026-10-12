// Packs the built bim package and the SDK root (its peer) to temp tarballs,
// checks the bim tarball's contents, installs both plus peers in a clean
// project, then imports every subpath. Modelled on the root
// tests/e2e/smoke-package.mjs, without the TypeScript consumer check: the
// bim package's contract is exercised structurally, not through its types.
// Before packing, it checks that the built chunks import only what the
// package declares, so a library that must be shared with the host (such as
// the router, whose context the host provides) is never bundled privately.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PEERS = [
  'react@19.2.0',
  'react-dom@19.2.0',
  'zod@4.4.3',
  'three@0.186.0',
  'web-ifc@0.0.77',
  '@mui/material@9.4.0',
  '@mui/icons-material@9.4.0',
  '@emotion/react@11.14.0',
  '@emotion/styled@11.14.1',
  'react-router-dom@7.18.4',
];

// Install scripts of unvetted transitive versions must not run in CI.
const ADD = ['add', '--silent', '--ignore-scripts'];

// Only the router's own copy says this, so finding it means it was bundled.
const BUNDLED_ROUTER = 'React Router caught the following error during render';

// `from 'x'`, `import 'x'` and `import('x')`, as esbuild writes them.
const SPECIFIER = /(?:\bfrom|\bimport)\s*\(?\s*["']([^"'\s]+)["']/g;

const ALLOWED =
  /^package\/(package\.json|README\.md|LICENSE\.md|CHANGELOG\.md|THIRD-PARTY-NOTICES\.md|dist\/.+\.(js|d\.ts))$/;

const ENTRIES = [
  'core/index',
  'schema/index',
  'converter/index',
  'viewer/index',
  'react/index',
  'react/BimCanvas',
  'dtaas/index',
];

const REQUIRED = [
  ...['README.md', 'LICENSE.md', 'CHANGELOG.md', 'THIRD-PARTY-NOTICES.md'].map(
    (file) => `package/${file}`,
  ),
  ...ENTRIES.flatMap((entry) => [
    `package/dist/${entry}.js`,
    `package/dist/${entry}.d.ts`,
  ]),
];

// Argument arrays, no shell; output stays visible so failures are easy to diagnose.
const yarn = (args, cwd) =>
  execFileSync('yarn', args, { cwd, stdio: 'inherit' });

const packageName = (directory) =>
  JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).name;

const checkTarball = (archive) => {
  // Regular files only: their verbose listing starts with '-'.
  const files = execFileSync('tar', ['-tvzf', archive], { encoding: 'utf8' })
    .split('\n')
    .filter((line) => line.startsWith('-'))
    .map((line) => line.split(/\s+/).pop());
  const unexpected = files.filter((file) => !ALLOWED.test(file));
  const missing = REQUIRED.filter((file) => !files.includes(file));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `Tarball check failed. Unexpected: ${unexpected.join(', ') || 'none'}. Missing: ${missing.join(', ') || 'none'}.`,
    );
  }
};

const packageOf = (specifier) =>
  specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');

const isBare = (specifier) =>
  !specifier.startsWith('.') &&
  !specifier.startsWith('/') &&
  !specifier.startsWith('node:');

// Every bare import in dist names a dependency or a peer, and the router is
// not inlined.
const checkDist = (bimRoot) => {
  const manifest = JSON.parse(
    readFileSync(join(bimRoot, 'package.json'), 'utf8'),
  );
  const declared = new Set(
    Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }),
  );
  const dist = join(bimRoot, 'dist');
  const chunks = readdirSync(dist, { recursive: true })
    .filter((file) => file.endsWith('.js'))
    .map((file) => ({ file, code: readFileSync(join(dist, file), 'utf8') }));
  const undeclared = chunks.flatMap(({ file, code }) =>
    [...code.matchAll(SPECIFIER)]
      .map((match) => match[1])
      .filter((spec) => isBare(spec) && !declared.has(packageOf(spec)))
      .map((spec) => `${file}: ${spec}`),
  );
  const bundled = chunks
    .filter(({ code }) => code.includes(BUNDLED_ROUTER))
    .map(({ file }) => file);
  if (undeclared.length > 0 || bundled.length > 0) {
    throw new Error(
      `Dist check failed. Undeclared imports: ${undeclared.join(', ') || 'none'}. Bundled router in: ${bundled.join(', ') || 'none'}.`,
    );
  }
};

// Each subpath's most telling export, plus the dtaas extension validated
// through the real SDK instead of a hand-rolled shape check.
const importScript = (bimName, sdkName) => `
import assert from 'node:assert/strict';
const core = await import('${bimName}');
assert.equal(core.normaliseLibraryPath('a/../b'), null);
const schema = await import('${bimName}/schema');
assert.equal(schema.readManifest({}).ok, false);
const converter = await import('${bimName}/converter');
assert.equal(typeof converter.convertIfc, 'function');
const viewer = await import('${bimName}/viewer');
assert.equal(typeof viewer.SceneView, 'function');
const react = await import('${bimName}/react');
assert.equal(typeof react.BuildingModels, 'function');
const canvas = await import('${bimName}/react/canvas');
assert.equal(typeof canvas.default, 'function');
const dtaas = await import('${bimName}/dtaas');
assert.equal(dtaas.extension.id, 'bim');
const sdk = await import('${sdkName}');
assert.equal(sdk.validateExtension(dtaas.extension).valid, true);
`;

const packTo = (sourceDirectory, directory, name) => {
  const archive = join(directory, `${name}.tgz`);
  yarn(['pack', '--filename', archive], sourceDirectory);
  return archive;
};

const installEverything = (directory, bimArchive, sdkArchive) => {
  yarn(['init', '-y'], directory);
  yarn(
    [...ADD, `file:${bimArchive}`, `file:${sdkArchive}`, ...PEERS],
    directory,
  );
};

const runSmokeTest = () => {
  const bimRoot = process.cwd();
  const sdkRoot = resolve(bimRoot, '..', '..');
  const directory = mkdtempSync(join(tmpdir(), 'bim-example-smoke-'));
  try {
    checkDist(bimRoot);
    const bimArchive = packTo(bimRoot, directory, 'bim');
    checkTarball(bimArchive);
    const sdkArchive = packTo(sdkRoot, directory, 'sdk');
    installEverything(directory, bimArchive, sdkArchive);
    execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        importScript(packageName(bimRoot), packageName(sdkRoot)),
      ],
      { cwd: directory, stdio: 'inherit' },
    );
    process.stdout.write('Package smoke test passed\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

runSmokeTest();
