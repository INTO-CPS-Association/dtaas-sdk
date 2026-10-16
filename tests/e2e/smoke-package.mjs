// Packs the built package, checks the tarball, installs it with its peers in a
// clean project, then imports every subpath and type-checks a consumer.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PEERS = [
  'react@19.2.0',
  'react-dom@19.2.0',
  'zod@4.4.3',
  'react-router-dom@7.18.4',
  '@testing-library/react@16.3.0',
  '@testing-library/dom@10.4.0',
  'eslint@9.39.5',
  '@types/react@19.2.6',
  '@types/react-dom@19.2.3',
];

// Install scripts of unvetted transitive versions must not run in CI.
const ADD = ['add', '--silent', '--ignore-scripts'];

const ALLOWED =
  /^package\/(package\.json|README\.md|LICENSE\.md|CHANGELOG\.md|dist\/.+\.(js|d\.ts))$/;
const REQUIRED = [
  ...['README.md', 'LICENSE.md', 'CHANGELOG.md'].map(
    (file) => `package/${file}`,
  ),
  ...['index', 'schema/index', 'testing/index', 'eslint/index'].flatMap(
    (entry) => [`package/dist/${entry}.js`, `package/dist/${entry}.d.ts`],
  ),
];

// Argument arrays, no shell; output stays visible so failures are easy to diagnose.
const yarn = (args, cwd) =>
  execFileSync('yarn', args, { cwd, stdio: 'inherit' });

const packageName = () => JSON.parse(readFileSync('package.json', 'utf8')).name;

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

const importScript = (name) => `
import assert from 'node:assert/strict';
const root = await import('${name}');
assert.equal(root.SDK_MAJOR, 1);
assert.equal(root.validateExtension({}).valid, false);
const schema = await import('${name}/schema');
const junction7 = ${readFileSync('tests/fixtures/junction7.visualisation.json', 'utf8')};
assert.equal(schema.parseVisualisationAsset(junction7).success, true);
const testing = await import('${name}/testing');
assert.equal(typeof testing.checkConformance, 'function');
const host = testing.fakeHostServices();
host.ui.snackbar('ok', 'info');
assert.equal(host.recorded.snackbars.length, 1);
const eslint = await import('${name}/eslint');
assert.ok(Array.isArray(eslint.default));
`;

// The @ts-expect-error lines fail if the SDK's types silently degrade to any.
const consumerSource = (name) => `
import { defineExtension, type DtaasExtension, type HostServices } from '${name}';
import { encodingSchema } from '${name}/schema';
import { fakeHostServices, type FakeHostServices } from '${name}/testing';
import kitConfig from '${name}/eslint';
const ext = defineExtension({ id: 'smoke', name: 'Smoke', version: '1.0.0', sdk: 1 });
// @ts-expect-error sdk must be 1
const wrong: DtaasExtension = { id: 'x', name: 'x', version: '1', sdk: 2 };
const fake: FakeHostServices = fakeHostServices();
const host: HostServices = fake;
// @ts-expect-error valueAt returns Sampled | undefined
const reading: number = host.signals.valueAt('a', 'measured');
export default [ext, wrong, reading, encodingSchema, kitConfig];
`;

const BASE_OPTIONS = [
  '--noEmit',
  '--strict',
  '--jsx',
  'react-jsx',
  '--target',
  'es2022',
];

// A bundler (Vite) consumer and a Node ESM consumer, as a kit may be either.
const RESOLUTIONS = [
  {
    file: 'consumer.ts',
    options: ['--module', 'esnext', '--moduleResolution', 'bundler'],
  },
  {
    file: 'consumer.mts',
    options: ['--module', 'nodenext', '--moduleResolution', 'nodenext'],
  },
];

const typeCheckConsumer = (directory, name) => {
  const tsc = resolve('node_modules/typescript/bin/tsc');
  RESOLUTIONS.forEach(({ file, options }) => {
    writeFileSync(join(directory, file), consumerSource(name));
    execFileSync(process.execPath, [tsc, ...BASE_OPTIONS, ...options, file], {
      cwd: directory,
      stdio: 'inherit',
    });
  });
};

const runSmokeTest = () => {
  const directory = mkdtempSync(join(tmpdir(), 'dtaas-sdk-smoke-'));
  const archive = join(directory, 'package.tgz');
  try {
    yarn(['pack', '--filename', archive], process.cwd());
    checkTarball(archive);
    yarn(['init', '-y'], directory);
    yarn([...ADD, `file:${archive}`, ...PEERS], directory);
    execFileSync(
      process.execPath,
      ['--input-type=module', '--eval', importScript(packageName())],
      {
        cwd: directory,
        stdio: 'inherit',
      },
    );
    typeCheckConsumer(directory, packageName());
    process.stdout.write('Package smoke test passed\n');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

runSmokeTest();
