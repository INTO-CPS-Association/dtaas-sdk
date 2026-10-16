# bim Example Implementation Plan

**Goal:** Port `bim-kit` 0.1.1 into the standalone package `examples/bim` and wire it to DTaaS as the extension `bim`, after adding connection status and a navigation-prefix rule to the SDK.

**Architecture:** Two SDK commits land first and pass the full SDK checks. `examples/bim` is its own Yarn package; `yarn sdk` builds, packs and unpacks the SDK tarball into its `node_modules`, so bim tests the published SDK surface with one copy of React. bim-kit's framework-free core, schema, converter, three.js viewer and MUI components are ported file by file, split to meet the size rules; a `dtaas/` layer adapts `useHost()` to the page and contributes anchors, presets, scopes and a converter.

**Tech Stack:** Yarn 1.22.22, Node 24, TypeScript 6.0.3, tsup 8.5.1 + tsc-alias, Jest 30 + ts-jest 29 + jsdom, React 19.2, React Router 7, zod 4.4.3, three 0.186.0, web-ifc 0.0.77, MUI 9.4.0 + emotion 11, ESLint 9.39.5, Prettier 3.9.5.

**Spec:** `docs/superpowers/specs/2026-09-28-bim-example-design.md`

**Upstream source (`$BIMKIT`):** `git clone https://github.com/INTO-CPS-Association/ifc-utils.git "$SCRATCH/ifc-utils" && git -C "$SCRATCH/ifc-utils" checkout 9899c1549f2ba7a2218dc4810185b917a95fa03c`, then `BIMKIT=$SCRATCH/ifc-utils/packages/bim-kit`. `$SCRATCH` is the session scratchpad directory. Fixtures are at `$SCRATCH/ifc-utils/fixtures/`.

## Global Constraints

- Functions < 25 lines, files < 250 lines (AGENTS.md); only `src/converter/generated/wasm.ts` is exempt.
- Interfaces over type aliases where possible; PascalCase components; camelCase utilities; `*.types.ts` / `*.schema.ts` suffixes; `globalThis` over `window`; `node:` prefixes; comments only where logic is non-obvious.
- Inside `examples/bim`, source imports use the `src/*` alias, tests use `src/*` and `tests/*` (same convention as the SDK root). No `.js` extensions in imports.
- bim `dependencies`: `three 0.186.0`, `web-ifc 0.0.77`, `zod 4.4.3`. `peerDependencies`: `react >=19`, `react-dom >=19`, `@into-cps-association/dtaas-sdk ^0.1.0`, `@mui/material >=5`, `@mui/icons-material >=5`, `@emotion/react >=11`, `@emotion/styled >=11`; each peer also pinned in `devDependencies`.
- Tooling versions in bim equal the SDK root's `devDependencies` versions.
- Extension id `bim`; routes `''` and `models/:model`; navigation path `/bim`; folder in `?dir=`, with `/` left unencoded in the query.
- Folder fallback order: `?dir=` → `REACT_APP_EXT_BIM_MODELS_DIRECTORY` → `host.library.conventions.modelsDirectory`. Never the literal `common/models` in bim source.
- `ConnectionState = 'connecting' | 'live' | 'down'`; severity `down` > `connecting` > `live`; empty path list → `live`.
- Coverage gate for both packages: lines/statements/functions 90 %, branches 85 %.
- Work on branch `feat/bim-example`.

## Review Focus

1. Navigation paths with a query or hash (`/bim?dir=x`, `/bim#help`) are under `/bim` and must pass; `/bimx` must fail. Test in Task 2.
2. A `?dir=` of `projects/%2e%2e/secret`, `..`, `/etc`, `a//b`, `a\b` must be rejected before any listing call; a folder named `100% done` must be accepted. Test in Task 4 (`libraryPath`) and Task 11 (no `contents.list` call on rejection).
3. A room or storey named `constructor` or `__proto__` must group normally in the scope rules, not corrupt the result object. Test in Task 10.
4. Two bindings on one MQTT topic must both receive a sample; a string or boolean sample must be ignored without clearing earlier readings. Test in Task 10 (`useReadings`).
5. Changing folder while a model list request is in flight must not show the old folder's models. Test in Task 9 (`BuildingModels` with a deferred `list`).

---

### Task 1: SDK connection status

**Files:**
- Modify: `src/host/visualisation.types.ts` (add `ConnectionState`, `ConnectionStatus`, `SignalsService.connection`)
- Create: `src/host/connection.ts` (`worstConnectionState`)
- Create: `src/testing/fakeConnection.ts`
- Modify: `src/testing/fakeSignals.ts` (add `connection`, `setConnection`)
- Modify: `src/index.ts` (export the two types and `worstConnectionState`), `src/testing/index.ts` (export `FakeConnection` type)
- Test: `tests/unit/host/connection.test.ts`, `tests/unit/testing/fakeConnection.test.tsx`, `tests/unit/testing/fakeSignals.test.tsx`, `tests/unit/types/contract.test.tsx`
- Docs: `docs/host-integration.md`, `docs/extension-authoring.md`, `docs/testing.md`, `CHANGELOG.md` (amend 0.1.0 "Added")

**Interfaces — Produces:**
- `type ConnectionState = 'connecting' | 'live' | 'down'`
- `interface ConnectionStatus { get(paths?: readonly string[]): ConnectionState; use(paths?: readonly string[]): ConnectionState }`
- `SignalsService.connection: ConnectionStatus` (required)
- `worstConnectionState(states: readonly ConnectionState[]): ConnectionState` (default export of `src/host/connection.ts`, named export from root)
- `FakeSignals.connection: FakeConnection`, `FakeSignals.setConnection(state: ConnectionState, paths?: readonly string[]): void`

- [ ] **Step 1: Write failing tests**

`tests/unit/host/connection.test.ts`:

```ts
import { worstConnectionState } from 'src/index';

describe('worstConnectionState', () => {
  it('is live when nothing is waiting', () => {
    expect(worstConnectionState([])).toBe('live');
  });

  it('ranks down above connecting above live', () => {
    expect(worstConnectionState(['live', 'connecting'])).toBe('connecting');
    expect(worstConnectionState(['connecting', 'down', 'live'])).toBe('down');
    expect(worstConnectionState(['live', 'live'])).toBe('live');
  });
});
```

`tests/unit/testing/fakeConnection.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react';
import createFakeSignals from 'src/testing/fakeSignals';

const Status = ({ paths }: { paths?: string[] }) => {
  const signals = useSignals();
  return <p>{signals.connection.use(paths)}</p>;
};
let current = createFakeSignals();
const useSignals = () => current;

describe('fake connection status', () => {
  beforeEach(() => {
    current = createFakeSignals();
  });

  it('starts live for every path', () => {
    expect(current.connection.get()).toBe('live');
    expect(current.connection.get(['a'])).toBe('live');
  });

  it('sets the state of all paths and clears overrides', () => {
    current.setConnection('connecting', ['a']);
    current.setConnection('down');
    expect(current.connection.get(['a', 'b'])).toBe('down');
    current.setConnection('live');
    expect(current.connection.get(['a'])).toBe('live');
  });

  it('overrides named paths only', () => {
    current.setConnection('down', ['mqtt/a']);
    expect(current.connection.get(['mqtt/b'])).toBe('live');
    expect(current.connection.get(['mqtt/a', 'mqtt/b'])).toBe('down');
    expect(current.connection.get()).toBe('down');
  });

  it('reports live for an empty path list', () => {
    current.setConnection('down');
    expect(current.connection.get([])).toBe('live');
  });

  it('re-renders use() consumers on change', () => {
    render(<Status paths={['a']} />);
    expect(screen.getByText('live')).toBeInTheDocument();
    act(() => current.setConnection('down', ['a']));
    expect(screen.getByText('down')).toBeInTheDocument();
  });
});
```

In `tests/unit/types/contract.test.tsx`, add a case modelled on the existing `@ts-expect-error` cases:

```ts
it('requires SignalsService.connection', () => {
  const { connection, ...withoutConnection } = fakeHostServices().signals;
  // @ts-expect-error connection is required
  const signals: SignalsService = withoutConnection;
  expect(connection.get()).toBe('live');
  expect(signals).toBeDefined();
});
```

(Import `SignalsService` from `src/index` and `fakeHostServices` from `src/testing/fakeHostServices` if the file does not already.)

- [ ] **Step 2: Run to confirm failure**

Run: `yarn test:unit tests/unit/host/connection.test.ts tests/unit/testing/fakeConnection.test.tsx tests/unit/types/contract.test.tsx`
Expected: FAIL — `worstConnectionState` is not exported; `setConnection` does not exist.

- [ ] **Step 3: Implement**

Append to `src/host/visualisation.types.ts` (before `SignalsService`) and add the member:

```ts
/** Whether the transports behind some signals are delivering. */
export type ConnectionState = 'connecting' | 'live' | 'down';

/** Tells a quiet signal from a dead connection. */
export interface ConnectionStatus {
  /** Worst state of the transports serving `paths`; every transport when omitted. */
  get(paths?: readonly string[]): ConnectionState;
  /** React hook form of `get`; re-renders when the state changes. */
  use(paths?: readonly string[]): ConnectionState;
}
```

and inside `SignalsService`: `readonly connection: ConnectionStatus;`

`src/host/connection.ts`:

```ts
import type { ConnectionState } from 'src/host/visualisation.types';

const SEVERITY: Record<ConnectionState, number> = {
  live: 0,
  connecting: 1,
  down: 2,
};

/** The least healthy state; `live` when nothing is waiting. */
const worstConnectionState = (
  states: readonly ConnectionState[],
): ConnectionState =>
  states.reduce<ConnectionState>(
    (worst, state) => (SEVERITY[state] > SEVERITY[worst] ? state : worst),
    'live',
  );

export default worstConnectionState;
```

`src/testing/fakeConnection.ts`:

```ts
import { useSyncExternalStore } from 'react';
import worstConnectionState from 'src/host/connection';
import type {
  ConnectionState,
  ConnectionStatus,
} from 'src/host/visualisation.types';

export interface FakeConnection extends ConnectionStatus {
  /** Set `paths`, or every path (clearing overrides) when omitted. */
  set(state: ConnectionState, paths?: readonly string[]): void;
}

/** Connection state a test controls; every path starts `live`. */
const createFakeConnection = (): FakeConnection => {
  let fallback: ConnectionState = 'live';
  const byPath = new Map<string, ConnectionState>();
  const listeners = new Set<() => void>();
  const get = (paths?: readonly string[]) =>
    paths === undefined
      ? worstConnectionState([fallback, ...byPath.values()])
      : worstConnectionState(paths.map((p) => byPath.get(p) ?? fallback));
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const set = (state: ConnectionState, paths?: readonly string[]) => {
    if (paths === undefined) {
      fallback = state;
      byPath.clear();
    } else paths.forEach((path) => byPath.set(path, state));
    listeners.forEach((listener) => listener());
  };
  return {
    get,
    set,
    use: (paths) => useSyncExternalStore(subscribe, () => get(paths)),
  };
};

export default createFakeConnection;
```

In `src/testing/fakeSignals.ts`: import `createFakeConnection, { type FakeConnection }`; extend `FakeSignals` with `readonly connection: FakeConnection;` and `setConnection(state: ConnectionState, paths?: readonly string[]): void;`; in `createFakeSignals` create `const connection = createFakeConnection();` and add `connection, setConnection: connection.set,` to the returned object.

Exports: in `src/index.ts` add `ConnectionState`, `ConnectionStatus` to the type exports from `src/host/visualisation.types` and `export { default as worstConnectionState } from 'src/host/connection';`. In `src/testing/index.ts` add `export type { FakeConnection } from 'src/testing/fakeConnection';`.

- [ ] **Step 4: Run to confirm pass, then the whole suite**

Run: `yarn test:unit` then `yarn typecheck`
Expected: all pass (hello-kit's integration tests are unaffected).

- [ ] **Step 5: Docs**

- `docs/host-integration.md`: under the services the host implements, add a subsection "Connection status" stating: `signals.connection` is required; `get(paths)` returns the worst state of the transports serving those paths; a path no transport serves is `down`; `get([])` is `live`; `get()` with no transports is `down`; use `worstConnectionState` to aggregate; `use()` must re-render on change.
- `docs/extension-authoring.md`: in the signals section, add: "Read `host.signals.connection.use(paths)` to show whether values are current. Do not infer a dead connection from sample age: a quiet sensor and a dropped broker look the same."
- `docs/testing.md`: document `fake.signals.setConnection(state, paths?)`, default `live`.
- `CHANGELOG.md` 0.1.0 "Added": `SignalsService.connection` (`ConnectionState`, `ConnectionStatus`) and `worstConnectionState`; fake `setConnection`.

- [ ] **Step 6: Full SDK check and commit**

Run: `yarn lint && yarn format:check && yarn typecheck && yarn test:all`
Expected: pass, coverage gate met.

```bash
git add src tests docs CHANGELOG.md
git commit -m "feat(signals): add required connection status to SignalsService"
```

### Task 2: SDK navigation-prefix rule

**Files:**
- Create: `src/extension/validation/navigationRules.ts`
- Modify: `src/extension/validateExtension.ts` (add `checkNavigation` to `runRules`)
- Test: `tests/unit/extension/navigationRules.test.ts`
- Docs: `docs/extension-authoring.md` (rule list), `docs/host-integration.md` (mount at `/<id>/*`), `CHANGELOG.md`

**Interfaces — Produces:** `checkNavigation(ext: Loose): string[]` (default export). Error text: `navigation[<i>].path "<path>" must be under "/<id>"`.

- [ ] **Step 1: Write failing tests**

```ts
import validateExtension from 'src/extension/validateExtension';
import { looseExtension } from 'tests/fixtures/extensions';

const errorsFor = (id: string, ...paths: string[]) => {
  const ext = looseExtension();
  ext.id = id;
  ext.navigation = paths.map((path) => ({ label: path, path }));
  return validateExtension(ext).errors;
};

describe('navigation rule', () => {
  it('accepts the mount point and paths below it', () => {
    expect(errorsFor('shm', '/shm', '/shm/alarms')).toEqual([]);
  });

  it('accepts a query or hash on the mount point', () => {
    expect(errorsFor('bim', '/bim?dir=projects/a', '/bim#help')).toEqual([]);
  });

  it('rejects a path outside the mount point', () => {
    expect(errorsFor('shm', '/shm', '/bridges')).toEqual([
      'navigation[1].path "/bridges" must be under "/shm"',
    ]);
  });

  it('rejects a path that only shares a string prefix', () => {
    expect(errorsFor('shm', '/shmx')).toEqual([
      'navigation[0].path "/shmx" must be under "/shm"',
    ]);
  });

  it('leaves a missing path and a bad id to the other rules', () => {
    const ext = looseExtension();
    ext.navigation = [{ label: 'x' }];
    expect(validateExtension(ext).errors).not.toContainEqual(
      expect.stringContaining('must be under'),
    );
  });
});
```

If `looseExtension()`'s type does not allow assigning `id`/`navigation`, cast with `as unknown as Record<string, unknown>` in `errorsFor`.

- [ ] **Step 2: Run to confirm failure**

Run: `yarn test:unit tests/unit/extension/navigationRules.test.ts`
Expected: FAIL on the rejection cases (no error produced).

- [ ] **Step 3: Implement**

`src/extension/validation/navigationRules.ts`:

```ts
import {
  entries,
  type Loose,
} from 'src/extension/validation/validationUtils';

/** `/bim`, `/bim/x`, `/bim?q` and `/bim#h` are under `/bim`; `/bimx` is not. */
const isUnder = (path: string, prefix: string) =>
  path.startsWith(prefix) &&
  (path.length === prefix.length ||
    ['/', '?', '#'].includes(path.charAt(prefix.length)));

/** Menu items stay inside the extension's own `/<id>` mount point. */
const checkNavigation = (ext: Loose): string[] => {
  if (typeof ext.id !== 'string') return [];
  const prefix = `/${ext.id}`;
  return entries(ext.navigation).flatMap(({ item, index }) =>
    typeof item.path !== 'string' || isUnder(item.path, prefix)
      ? []
      : [`navigation[${index}].path "${item.path}" must be under "${prefix}"`],
  );
};

export default checkNavigation;
```

Add `...checkNavigation(ext),` after `...checkUniqueness(ext),` in `runRules`.

- [ ] **Step 4: Run all SDK tests** — `yarn test:unit && yarn test:int`; expected PASS (the `demo` fixture uses `/demo`, hello-kit uses `/hello`).

- [ ] **Step 5: Docs** — extension-authoring rule list gains "a navigation path is not `/<id>` or below it"; host-integration states "mount each extension's routes at `/<id>/*`, so a kit may use nested relative `<Routes>`"; CHANGELOG 0.1.0 "Added" gains the rule.

- [ ] **Step 6: Full SDK check and commit** — `yarn lint && yarn format:check && yarn typecheck && yarn test:all`; commit `feat(validation): require navigation paths under the extension's mount point`.

### Task 3: bim package scaffold

**Files:**
- Create under `examples/bim/`: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `tsconfig.eslint.json`, `tsup.config.ts`, `jest.config.json`, `eslint.config.mjs`, `.gitignore`, `.prettierignore`, `LICENSE.md` (copy of root), `scripts/install-sdk.mjs`, `scripts/inline-wasm.mjs`, `scripts/resolve-declaration-paths.mjs` (copy of root script), `tests/setupTests.ts`, `tests/jest.setup.ts`, `tests/__mocks__/styleMock.ts`, `src/core/index.ts` (placeholder `export const BIM_EXTENSION_ID = 'bim';`), `tests/unit/sanity.test.ts`
- Modify root: `eslint.config.mjs` (ignore `examples/bim/**`), `tsconfig.eslint.json` (exclude `examples/bim`), `.prettierignore` (add `examples/bim/`), `jest.config.json` (`modulePathIgnorePatterns` add `<rootDir>/examples/bim`)

**Interfaces — Produces:** scripts `sdk`, `wasm`, `build`, `typecheck`, `clean`, `format`, `format:check`, `syntax`, `lint`, `test:unit`, `test:int`, `test:coverage`, `test:e2e`, `test:all`; `src/*` and `tests/*` aliases.

- [ ] **Step 1: `package.json`**

```json
{
  "name": "@into-cps-association/bim-example",
  "version": "0.1.0",
  "private": true,
  "description": "Buildings extension for DTaaS: bim-kit 0.1.1 ported onto the dtaas-sdk contract.",
  "license": "SEE LICENSE IN LICENSE.md",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": { "types": "./dist/core/index.d.ts", "default": "./dist/core/index.js" },
    "./schema": { "types": "./dist/schema/index.d.ts", "default": "./dist/schema/index.js" },
    "./converter": { "types": "./dist/converter/index.d.ts", "default": "./dist/converter/index.js" },
    "./viewer": { "types": "./dist/viewer/index.d.ts", "default": "./dist/viewer/index.js" },
    "./react": { "types": "./dist/react/index.d.ts", "default": "./dist/react/index.js" },
    "./react/canvas": { "types": "./dist/react/BimCanvas.d.ts", "default": "./dist/react/BimCanvas.js" },
    "./dtaas": { "types": "./dist/dtaas/index.d.ts", "default": "./dist/dtaas/index.js" },
    "./package.json": "./package.json"
  },
  "files": ["dist", "CHANGELOG.md", "THIRD-PARTY-NOTICES.md"],
  "engines": { "node": ">=24" },
  "packageManager": "yarn@1.22.22",
  "scripts": {
    "sdk": "node scripts/install-sdk.mjs",
    "wasm": "node scripts/inline-wasm.mjs",
    "build": "yarn wasm && tsup && tsc --project tsconfig.build.json && tsc-alias --project tsconfig.build.json && node scripts/resolve-declaration-paths.mjs dist",
    "typecheck": "yarn wasm && tsc --project tsconfig.eslint.json --noEmit",
    "clean": "node --eval \"const { rmSync } = require('node:fs'); ['coverage', 'dist'].forEach((path) => rmSync(path, { recursive: true, force: true }))\"",
    "format": "prettier --write \"*.{ts,mjs,json,md}\" \"{src,tests,scripts}/**/*.{ts,tsx,mjs,json,md}\"",
    "format:check": "prettier --check \"*.{ts,mjs,json,md}\" \"{src,tests,scripts}/**/*.{ts,tsx,mjs,json,md}\"",
    "syntax": "eslint . --fix",
    "lint": "eslint .",
    "test:unit": "yarn wasm && jest --config jest.config.json --coverageDirectory=coverage/unit tests/unit",
    "test:int": "yarn wasm && jest --config jest.config.json --coverageDirectory=coverage/int tests/integration",
    "test:coverage": "yarn wasm && jest --config jest.config.json --coverageDirectory=coverage/all --coverageThreshold='{\"global\":{\"lines\":90,\"statements\":90,\"functions\":90,\"branches\":85}}' tests/unit tests/integration",
    "test:e2e": "yarn build && node tests/e2e/smoke-package.mjs",
    "test:all": "yarn test:coverage && yarn test:e2e"
  },
  "prettier": { "singleQuote": true, "trailingComma": "all" },
  "dependencies": { "three": "0.186.0", "web-ifc": "0.0.77", "zod": "4.4.3" },
  "peerDependencies": {
    "@emotion/react": ">=11",
    "@emotion/styled": ">=11",
    "@into-cps-association/dtaas-sdk": "^0.1.0",
    "@mui/icons-material": ">=5",
    "@mui/material": ">=5",
    "react": ">=19",
    "react-dom": ">=19"
  },
  "devDependencies": {}
}
```

Fill `devDependencies` with: every tooling package from the root `package.json` `devDependencies` at the same version (`@eslint/eslintrc`, `@eslint/js`, `@testing-library/dom`, `@testing-library/jest-dom`, `@testing-library/react`, `@types/jest`, `@types/node`, `@types/react`, `@types/react-dom`, `@typescript-eslint/*`, `eslint*`, `globals`, `jest`, `jest-environment-jsdom`, `prettier`, `react`, `react-dom`, `react-router-dom`, `ts-jest`, `tsc-alias`, `tsup`, `typescript`), plus `@emotion/react 11.14.0`, `@emotion/styled 11.14.1`, `@mui/material 9.4.0`, `@mui/icons-material 9.4.0`, `@testing-library/user-event 14.6.7`, `@types/three 0.186.0`. Do not list the SDK (it is installed by `yarn sdk`). Copy the root `resolutions` block.

- [ ] **Step 2: TypeScript, tsup, Jest, ESLint**

- `tsconfig.json`: copy the root one; `paths` become `{ "src/*": ["./src/*"], "tests/*": ["./tests/*"] }`.
- `tsconfig.build.json`: copy the root one (declarations only, `rootDir: src`, `outDir: dist`), `include: ["src"]`.
- `tsconfig.eslint.json`: copy the root one; `include` is `["*.ts", "src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "tests/**/*.tsx"]`.
- `tsup.config.ts`: format `esm`, `splitting: true`, `clean: true`, `target: 'es2022'`, entries `{ 'core/index': 'src/core/index.ts', 'schema/index': 'src/schema/index.ts', 'converter/index': 'src/converter/index.ts', 'viewer/index': 'src/viewer/index.ts', 'react/index': 'src/react/index.ts', 'react/BimCanvas': 'src/react/BimCanvas.tsx', 'dtaas/index': 'src/dtaas/index.ts' }` (until those files exist, tsup is not run).
- `jest.config.json`: copy the root one and change: `paths`/`moduleNameMapper` to only `src/*` and `tests/*` (no SDK mapping — the SDK resolves from `node_modules`); `transform` key `"^.+\\.[tj]sx?$"` with ts-jest option `"allowJs": true`; add `"transformIgnorePatterns": ["/node_modules/(?!(@into-cps-association/dtaas-sdk|three/examples)/)"]`; `collectCoverageFrom` `["src/**/*.{ts,tsx}", "!src/**/*.types.ts", "!src/**/index.ts", "!src/converter/generated/**"]` (Task 9 adds the WebGL render-loop file); `"setupFiles": ["<rootDir>/tests/setupTests.ts"]` and `"setupFilesAfterEnv": ["<rootDir>/tests/jest.setup.ts"]`.
- `tests/setupTests.ts` and `tests/jest.setup.ts`: copy root `tests/setupTests.ts` and `tests/unit/jest.setup.ts` (jest-dom, `TextEncoder`, etc.).
- `eslint.config.mjs`: copy the root config, drop blocks that only concern the SDK's own `src/eslint` and `examples/**`, set `parserOptions.project` to `./tsconfig.eslint.json`, and append:

```js
import dtaasKitConfig from '@into-cps-association/dtaas-sdk/eslint';
// …existing export array…
  ...dtaasKitConfig.map((config) => ({ ...config, files: ['src/**/*.{ts,tsx}'] })),
```

  plus `ignores: ['dist/', 'coverage/', 'node_modules/', 'src/converter/generated/']`.
- `.gitignore`: `node_modules/`, `dist/`, `coverage/`, `src/converter/generated/`.
- `.prettierignore`: `dist/`, `coverage/`, `src/converter/generated/`, `tests/fixtures/*.ifc`.

- [ ] **Step 3: `scripts/install-sdk.mjs`**

```js
// Builds and packs the SDK at the repository root, then unpacks the tarball
// where Node resolves the peer. A `file:` dependency would copy the whole
// repository (a second React) or fail yarn's integrity check on every rebuild.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');
const target = resolve(
  import.meta.dirname,
  '../node_modules/@into-cps-association/dtaas-sdk',
);
const work = mkdtempSync(join(tmpdir(), 'dtaas-sdk-'));
const tarball = join(work, 'sdk.tgz');
const run = (command, args) =>
  execFileSync(command, args, { cwd: root, stdio: 'inherit' });

try {
  run('yarn', ['build']);
  run('yarn', ['pack', '--filename', tarball]);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  run('tar', ['-xzf', tarball, '-C', target, '--strip-components=1']);
} finally {
  rmSync(work, { recursive: true, force: true });
}
```

- [ ] **Step 4: `scripts/inline-wasm.mjs`** — copy `$BIMKIT/scripts/inline-wasm.mjs`, changing the output to `src/converter/generated/wasm.ts` and skipping the write when the file exists and is newer than `web-ifc.wasm` (compare `statSync().mtimeMs`), so repeated test runs stay fast.

- [ ] **Step 5: Root repo ignores** — add `'examples/bim/**'` to the root ESLint `ignores`; add `"examples/bim"` to `exclude` in root `tsconfig.eslint.json`; add `examples/bim/` to `.prettierignore`; add `"<rootDir>/examples/bim"` to root Jest `modulePathIgnorePatterns`.

- [ ] **Step 6: Sanity test**

`tests/unit/sanity.test.ts`:

```ts
import { SDK_MAJOR } from '@into-cps-association/dtaas-sdk';
import { fakeHostServices } from '@into-cps-association/dtaas-sdk/testing';
import { BIM_EXTENSION_ID } from 'src/core';

describe('package wiring', () => {
  it('resolves the packed SDK, including connection status', () => {
    expect(SDK_MAJOR).toBe(1);
    expect(fakeHostServices().signals.connection.get()).toBe('live');
    expect(BIM_EXTENSION_ID).toBe('bim');
  });
});
```

- [ ] **Step 7: Install and verify**

Run (in `examples/bim`): `yarn install && yarn sdk && yarn test:unit tests/unit/sanity.test.ts && yarn typecheck && yarn lint`
Expected: PASS. Then at the root: `yarn lint && yarn format:check && yarn typecheck && yarn test:coverage` still PASS.

- [ ] **Step 8: Commit** — `git add examples/bim eslint.config.mjs tsconfig.eslint.json .prettierignore jest.config.json` (include `examples/bim/yarn.lock`), commit `chore(bim): scaffold the standalone bim example package`.

### Porting rules (apply to Tasks 4–9)

- Copy the upstream file, then: replace relative `../x.js`/`./x.js` imports with `src/<area>/x` aliases; keep exported names and behaviour; reformat with Prettier; keep comments that give a non-obvious reason, trim narrative to at most a few lines per export; satisfy ESLint (airbnb-base rules; `import/prefer-default-export` for single-export files — keep named exports where upstream has several).
- Split any file over 250 lines or function over 25 lines into helpers in the same folder. Keep the public export where it was.
- Upstream → target area: `src/{binding,resolver,ramp,readings,alerts,storeys,ifcName}.ts` → `src/core/`; `src/schema.ts` → `src/schema/manifest.schema.ts`; `src/converter.ts` → `src/converter/`; `src/viewer/*` → `src/viewer/`; `src/react/*` → `src/react/`.
- Test conversion from `node:test` to Jest: drop `import './support/dom.mjs'` and the `node:test`/`assert` imports; `test`/`describe` stay; `assert.equal`/`strictEqual` → `expect(a).toBe(b)`; `deepEqual`/`deepStrictEqual` → `toEqual`; `assert.ok(x)` → `expect(x).toBeTruthy()`; `assert.match` → `toMatch`; `assert.throws(fn, re)` → `expect(fn).toThrow(re)`; `assert.rejects` → `await expect(p).rejects.toThrow()`; `mock.fn()` → `jest.fn()`; `mock.module(path, …)` → `jest.mock(alias, …)`; `mock.timers` → `jest.useFakeTimers()`; imports from `../dist/esm/*` → `src/*`. Keep every upstream test case; name files `tests/unit/<area>/<name>.test.ts(x)`.

### Task 4: Core port and `libraryPath`

**Files:**
- Create: `src/core/{binding,resolver,ramp,readings,alerts,storeys,ifcName,libraryPath,index}.ts` (replace the Task 3 placeholder index; keep `BIM_EXTENSION_ID`)
- Test: `tests/unit/core/{binding,resolver,readings,alerts,storeys,ifcName,libraryPath,ramp}.test.ts` (ported from `$BIMKIT/test/*.test.mjs`; `ramp` new)

**Interfaces — Produces:** upstream `src/index.ts` exports (`objectOf`, `topicOf`, `displayOf`, `idOf`, `Binding`, `Display`, `Selector`, `resolveBindings`, `topicsOf`, `bindingsByTopic`, `Resolved`, `Unresolved`, `ResolveResult`, `SceneObject`, `rampColour`, `RAMP_STOPS`, `IFC_HEAD_BYTES`, `decodeStepString`, `entityArguments`, `ifcBuildingName`, `usableName`, `alertsOf`, `alertCounts`, `MEASURED_KIND`, `Alert`, `AlertLevel`, `bandsFrom`, `bandOf`, `MERGE_WITHIN_M`, `FLOOR_MARGIN_M`, `Band`, `ObjectBase`, `ageOf`, `ageText`, `isLive`, `zoneOf`, `zonesOf`, `availableScopes`, `ALL_SCOPES`, `DEFAULT_STALE_AFTER_S`, `FeedState`, `HeatScope`, `Reading`, `Zones`), plus `GLOBAL_ID_PATTERN: RegExp` (in `binding.ts`, `/^[0-9A-Za-z_$]{22}$/`), `normaliseLibraryPath(raw: string | null | undefined): string | null`, `BIM_EXTENSION_ID = 'bim'`.

- [ ] **Step 1: Write the `libraryPath` tests (new)**

```ts
import { normaliseLibraryPath } from 'src/core';

describe('normaliseLibraryPath', () => {
  it.each([
    ['common/models', 'common/models'],
    ['projects/aarhus/', 'projects/aarhus'],
    ['100% done', '100% done'],
    ['a b/[3D] c', 'a b/[3D] c'],
  ])('accepts %p', (raw, clean) => {
    expect(normaliseLibraryPath(raw)).toBe(clean);
  });

  it.each([
    '', '/etc', '..', '.', 'a/../b', 'a/./b', 'a//b', 'a\\b',
    'projects/%2e%2e/secret', 'a/%2E', 'a\u0000b',
  ])('rejects %p', (raw) => {
    expect(normaliseLibraryPath(raw)).toBeNull();
  });

  it('rejects absent values', () => {
    expect(normaliseLibraryPath(null)).toBeNull();
    expect(normaliseLibraryPath(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Port upstream tests** for binding, resolver, readings, alerts, storeys, ifcName per the porting rules, and add `ramp.test.ts` covering `rampColour(low)` = `RAMP_STOPS.cold`, midpoint = `RAMP_STOPS.middle`, `high` = `RAMP_STOPS.warm`, clamping below/above, and zero-width range → warm end. Also add a `GLOBAL_ID_PATTERN` case in `binding.test.ts` (22 valid chars pass; 21 chars and `-` fail).

- [ ] **Step 3: Run to confirm failure** — `yarn test:unit tests/unit/core`; FAIL (modules missing).

- [ ] **Step 4: Port the seven upstream files** per the porting rules; add `GLOBAL_ID_PATTERN` to `binding.ts`. Write `src/core/libraryPath.ts`:

```ts
const UNSAFE = new Set(['', '.', '..']);

const decoded = (segment: string) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const isUnsafe = (segment: string) =>
  UNSAFE.has(segment) || UNSAFE.has(decoded(segment));

/**
 * A user-supplied folder as a clean, library-relative path, or `null` when
 * it could leave the library. Percent-encoded dot segments are caught too,
 * because the server may decode them again.
 */
export const normaliseLibraryPath = (
  raw: string | null | undefined,
): string | null => {
  if (!raw || raw.startsWith('/') || /[\\\0]/.test(raw)) return null;
  const segments = raw.replace(/\/+$/, '').split('/');
  return segments.some(isUnsafe) ? null : segments.join('/');
};

export default normaliseLibraryPath;
```

`src/core/index.ts` re-exports everything listed under Produces.

- [ ] **Step 5: Run to confirm pass** — `yarn test:unit tests/unit/core && yarn lint && yarn typecheck`.

- [ ] **Step 6: Commit** — `feat(bim): port the framework-free core and add library path checks`.

### Task 5: Schema port and `visualisation.json` migration

**Files:**
- Create: `src/schema/manifest.schema.ts` (port of `$BIMKIT/src/schema.ts`, using `GLOBAL_ID_PATTERN` from core), `src/schema/migrate.ts`, `src/schema/index.ts`
- Test: `tests/unit/schema/manifest.schema.test.ts` (ported `schema.test.mjs`), `tests/unit/schema/migrate.test.ts`, fixture `tests/fixtures/substation.manifest.json`

**Interfaces — Produces:** `SelectorSchema`, `SourceSchema`, `DisplaySchema`, `BindingSchema`, `ProvenanceSchema`, `ManifestSchema`, `Manifest`, `ManifestProblem`, `ManifestResult`, `readManifest(value: unknown): ManifestResult`; `manifestToVisualisation(manifest: Manifest, options: MigrateOptions): MigrateResult` with

```ts
export interface MigrateOptions {
  /** `visualisation.json` name. */
  readonly name: string;
  /** MQTT broker the live topics are served from, e.g. `wss://host/ws`. */
  readonly brokerUrl: string;
}
export interface Skipped {
  readonly binding: Binding;
  readonly reason: string;
}
export interface MigrateResult {
  readonly asset: VisualisationAsset; // from '@into-cps-association/dtaas-sdk'
  /** Bindings with no live topic or no GlobalId; returned, not dropped. */
  readonly skipped: Skipped[];
}
```

Constants: substrate id `building`, adapter `aec`, anchor kind `ifc-guid`, encoding `{ type: 'colorScale', domain: ramp, scheme: 'bim.cold-warm', channel: 'measured', clamp: true }`, `schemaVersion: '1.0'`, `domain: 'bim'`, layout `{ type: 'single', panes: ['building'] }`, substrate `source` = `manifest.model.geometry ?? manifest.model.source`.

- [ ] **Step 1: Fixture** — `tests/fixtures/substation.manifest.json`: a manifest with provenance (`source: "substation.ifc"`, `source_sha256: "unknown"`, `converter: "ifc_explorer.to_manifest 0.1.0"`, `geometry: "substation.glb"`) and four bindings: (a) GlobalId `0_sgz7bzz4Jh2ckU1ehFe$`, live topic `swim/hx1/supply`, ramp `[4, 16]`, unit `°C`; (b) GlobalId `1yETHMphv6LwABqR4Pbs5g`, live topic `swim/hx1/supply` (same topic), ramp `[4, 16]`; (c) nodeName `Pump-2` with live topic `swim/p2/flow`; (d) GlobalId `2O2Fr$t4X7Zf8NOew3FLOH` with only `history`.

- [ ] **Step 2: Write failing migrate tests**

```ts
import { parseVisualisationAsset } from '@into-cps-association/dtaas-sdk/schema';
import { manifestToVisualisation, readManifest } from 'src/schema';
import fixture from 'tests/fixtures/substation.manifest.json';

const manifest = () => {
  const result = readManifest(fixture);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.manifest;
};
const options = { name: 'substation', brokerUrl: 'wss://broker.example/ws' };

describe('manifestToVisualisation', () => {
  it('produces an asset the SDK schema accepts', () => {
    const { asset } = manifestToVisualisation(manifest(), options);
    expect(parseVisualisationAsset(asset).success).toBe(true);
    expect(asset.substrates.building).toEqual({ adapter: 'aec', source: 'substation.glb' });
    expect(asset.layout).toEqual({ type: 'single', panes: ['building'] });
  });

  it('anchors every GlobalId binding with a live topic', () => {
    const { asset } = manifestToVisualisation(manifest(), options);
    expect(asset.anchors).toEqual([
      expect.objectContaining({ signalPath: 'swim/hx1/supply', kind: 'ifc-guid', ref: '0_sgz7bzz4Jh2ckU1ehFe$' }),
      expect.objectContaining({ signalPath: 'swim/hx1/supply', kind: 'ifc-guid', ref: '1yETHMphv6LwABqR4Pbs5g' }),
    ]);
  });

  it('declares one mqtt transport with each topic once', () => {
    const { asset } = manifestToVisualisation(manifest(), options);
    expect(asset.transports).toEqual([
      { adapter: 'mqtt', url: 'wss://broker.example/ws', topics: ['swim/hx1/supply'], channel: 'measured' },
    ]);
  });

  it('writes one colour-scale encoding per topic from the ramp', () => {
    const { asset } = manifestToVisualisation(manifest(), options);
    expect(asset.encodings).toEqual([
      {
        target: 'swim/hx1/supply',
        substrate: 'building',
        encoding: { type: 'colorScale', domain: [4, 16], scheme: 'bim.cold-warm', channel: 'measured', clamp: true },
      },
    ]);
  });

  it('returns the bindings it could not migrate, with reasons', () => {
    const { skipped } = manifestToVisualisation(manifest(), options);
    expect(skipped.map((s) => s.reason)).toEqual([
      'no GlobalId: ifc-guid anchors need one',
      'no live topic: history-only bindings have nothing to anchor',
    ]);
  });

  it('declares no transport when nothing is live', () => {
    const m = { ...manifest(), bindings: [] };
    expect(manifestToVisualisation(m, options).asset.transports).toEqual([]);
  });
});
```

- [ ] **Step 3: Port `schema.test.mjs`** to `tests/unit/schema/manifest.schema.test.ts`.

- [ ] **Step 4: Run to confirm failure** — `yarn test:unit tests/unit/schema`.

- [ ] **Step 5: Implement** the ported schema and `migrate.ts`. Structure `migrate.ts` as small functions: `classify(binding)` → `{ anchor }` or `{ reason }` (reason strings exactly as the test), `transportsFor(topics, brokerUrl)`, `encodingsFor(anchored)` (first binding per topic wins, via a `Map`), and `manifestToVisualisation` composing them. Use `topicOf`, `objectOf`, `displayOf` from `src/core`.

- [ ] **Step 6: Run to confirm pass**, lint, typecheck; commit `feat(bim): port the manifest schema and add visualisation.json migration`.

### Task 6: Converter port

**Files:**
- Create: `src/converter/convertIfc.ts` (+ helper file(s) such as `src/converter/pieces.ts` for `readPiece`/geometry maths and `src/converter/wasm.ts` for `browserCarriesTheParser`/`carriedWasmUrl` so each file < 250 lines and each function < 25), `src/converter/index.ts`
- Create: `tests/fixtures/{wall_kernel_keeps_units,column_in_inches,basin_at_the_origin}.ifc` (copied unmodified from `$SCRATCH/ifc-utils/fixtures/`), `tests/fixtures/README.md` (copy upstream fixtures README's "Where They Come From" section with the CC BY 4.0 attribution)
- Test: `tests/unit/converter/convertIfc.test.ts` (port of `convert.test.mjs`, first line `/** @jest-environment node */`, fixtures from `tests/fixtures/`)

**Interfaces — Produces:** `convertIfc(bytes: Uint8Array, options?: ConvertOptions): Promise<Converted>`, `ConvertOptions { wasmPath?: string; onProgress?: (done: number) => void }`, `Converted { schema: string; objects: ConvertedObject[]; failed: number }`, `ConvertedObject` (as upstream).

- [ ] **Step 1:** copy fixtures and README; port the test; run `yarn test:unit tests/unit/converter` → FAIL.
- [ ] **Step 2:** port `converter.ts` into the files above; `inline-wasm.mjs` already writes `src/converter/generated/wasm.ts`.
- [ ] **Step 3:** run → PASS (the joining loop inside `StreamAllMeshes` becomes a helper `joinPieces(pieces)`; the per-mesh callback becomes `toObject(api, model, mesh)` returning `ConvertedObject | null`).
- [ ] **Step 4:** lint, typecheck; commit `feat(bim): port the in-browser IFC converter with its fixtures`.

### Task 7: Viewer port

**Files:**
- Create: `src/viewer/{appearance,shortcuts,gizmo,outline,glow,field,fieldSheet,sceneView,index}.ts`; split `sceneView.ts` (448 lines) into `sceneView.ts` (the `SceneView` class, delegating) plus helpers such as `sceneView.types.ts` (`ObjectFacts`, `PropertyTree`, `ViewState`), `sceneBands.ts` (storey bands and floor filtering), `sceneHeat.ts` (heat colouring and field sheet), `sceneSelection.ts` (hover/select/highlight). Class methods over 25 lines move into those helpers as functions taking the needed state.
- Test: `tests/unit/viewer/{field,gizmo,glow,outline,sceneView,shortcuts}.test.ts` (ported)

**Interfaces — Produces:** upstream `src/viewer/index.ts` exports unchanged: `SceneView`, `ObjectFacts`, `PropertyTree`, `ViewState`, `Palette`, `SHELL`, `SELECTED_COLOUR`, `HOVERED_COLOUR`, `SHORTCUTS`, `handleKey`, `Shortcut`, `ShortcutContext`, `createGizmo`, `cornerViewport`, `GIZMO_SIZE_PX`, `GIZMO_MARGIN_PX`, `Gizmo`, `addOutlines`, `createGlow`, `GLOW_MARGIN_M`, `Glow`, `buildField`, `sourceAt`, `CELL_M`, `CUT_M`, `BLOCKS`, `OPENS`, `SEARCH_CELLS`, `Field`, `createFieldSheet`, `FieldSheet`.

- [ ] **Step 1:** port the six test files; run `yarn test:unit tests/unit/viewer` → FAIL.
- [ ] **Step 2:** port the viewer files with the split above.
- [ ] **Step 3:** run → PASS; if `three/examples/jsm/*` imports fail to parse, confirm `transformIgnorePatterns` and `allowJs` from Task 3 apply.
- [ ] **Step 4:** lint, typecheck; commit `feat(bim): port the three.js viewer`.

### Task 8: React panels, assets and `DirectoryPicker`

**Files:**
- Create: `src/react/{Legend,SensorCards,FloorPicker,Toolbar,ObjectPanel,HelpPanel,icons,DirectoryPicker}.tsx`, `src/react/{assets,scene,ifcMeshes,exportGlb}.ts`
- Test: `tests/unit/react/SensorCards.test.tsx` (ported `sensorCards.test.mjs`), `tests/unit/react/assets.test.ts`, `tests/unit/react/DirectoryPicker.test.tsx`, `tests/unit/react/exportGlb.test.ts`, `tests/unit/react/panels.test.tsx`

**Interfaces — Produces:**
- `assets.ts` as upstream minus `MODELS_DIRECTORY`: `LibraryEntry`, `BimModel`, `readableName`, `pairModels`, `contentsUrl`, `fileUrl`, `readIfcName`, `uniqueNames`, `formatSize`.
- `exportGlb(model: Object3D): Promise<Uint8Array>` (default export) — moved from `BimCanvas.tsx`; it dynamic-imports `three/examples/jsm/exporters/GLTFExporter.js` itself and parses with `{ binary: true, onlyVisible: false }`.
- `meshesFrom(converted: Converted): Group` (from `ifcMeshes.ts`), `objectsOf(root: Object3D): BimObject[]` (from `scene.ts`).
- `DirectoryPicker(props: DirectoryPickerProps)`:

```ts
export interface DirectoryPickerProps {
  /** Lists one folder of the library; only entries with `type: 'directory'` are offered. */
  list(path: string): Promise<LibraryEntry[]>;
  /** The folder in use. */
  value: string;
  onChange(path: string): void;
}
```

Behaviour: a button labelled `Folder: <value>` opens an MUI `Dialog` titled `Choose a folder` that browses starting at `value`: a `ListItemButton` per subfolder (click browses into it), an `Up` item unless at the library root (`''`), a `CircularProgress` while listing, an `Alert` `Could not list <path>: <message>` on rejection, and a `Use this folder` button (disabled at the root and while loading) that calls `onChange(browsing)` and closes. Ignore a listing response that arrives after the user has browsed elsewhere (track the requested path).

- [ ] **Step 1: Write failing tests** — port `sensorCards.test.mjs`. `assets.test.ts`: `pairModels` pairs `.glb`, `.json`, `.manifest.json` with their IFC (manifest checked before tree), sorts by title, uses `titles`; `contentsUrl('https://h/jane', 'a b/[x].ifc')` = `https://h/jane/api/contents/a%20b/%5Bx%5D.ifc`; `uniqueNames` drops shared names; `formatSize(undefined)` = `''`, `2048` = `2 KB`, `3 * 1024 * 1024` = `3.0 MB`; `readIfcName` with `globalThis.fetch` mocked returns the project name, returns `null` on `ok: false` and on a rejected fetch, and cancels a body reader after `IFC_HEAD_BYTES`. `DirectoryPicker.test.tsx` (user-event):

```tsx
const tree: Record<string, LibraryEntry[]> = {
  '': [{ name: 'projects', path: 'projects', type: 'directory' }, { name: 'x.ifc', path: 'x.ifc', type: 'file' }],
  projects: [{ name: 'aarhus', path: 'projects/aarhus', type: 'directory' }],
  'projects/aarhus': [],
};
const list = jest.fn(async (path: string) => tree[path] ?? Promise.reject(new Error('gone')));
```

  Cases: shows `Folder: common/models`; opening lists subfolders of `value` and hides files; clicking `projects` then `aarhus` then `Use this folder` calls `onChange('projects/aarhus')`; `Up` from `projects` reaches the root where `Use this folder` is disabled; a rejected listing shows `Could not list missing: gone`; a slow listing for an old path (deferred promise resolved after browsing on) does not replace the newer listing. `exportGlb.test.ts` (`/** @jest-environment node */`): exporting a `Group` with one `Mesh(BoxGeometry, MeshStandardMaterial)` resolves to bytes starting with `glTF` (`0x67 0x6c 0x54 0x46`); if GLTFExporter needs `FileReader` in Node, polyfill it in the test file with a minimal class using `Blob.arrayBuffer()`. `panels.test.tsx`: render `FloorPicker`, `Toolbar`, `ObjectPanel`, `HelpPanel`, `ClassLegend`, `HeatLegend` with minimal props taken from their upstream prop types and assert their headline text and one interaction each (e.g. choosing a floor calls `onChange`).

- [ ] **Step 2: Run to confirm failure.**
- [ ] **Step 3: Port the panel files, `assets.ts` (remove `MODELS_DIRECTORY`), `scene.ts`, `ifcMeshes.ts`; write `exportGlb.ts` from the upstream function; write `DirectoryPicker.tsx` (split into `DirectoryPicker.tsx` and `useFolderListing.ts` hook returning `{ entries, loading, error }` for the path being browsed).**
- [ ] **Step 4: Run to confirm pass**, lint, typecheck; commit `feat(bim): port the React panels and add DirectoryPicker`.

### Task 9: `BuildingModels` and `BimCanvas`

**Files:**
- Create: `src/react/BuildingModels.tsx` plus hooks/parts such as `useModelList.ts` (listing, IFC names, reload), `useModelFiles.ts` (manifest and tree fetch), `useGeometrySave.ts` (save state), `ModelPicker.tsx` (select + `StateChip`), `PageNotes.tsx` (alerts and dismissable notes); `src/react/BimCanvas.tsx` plus `canvasRenderer.ts` (WebGL renderer, render loop, resize observer — the only file excluded from coverage), `loadGeometry.ts` (GLB load or convert path, using `exportGlb`), `canvasHandle.ts` (`ViewerHandle` construction); `src/react/index.ts` (upstream exports minus `MODELS_DIRECTORY`, plus `DirectoryPicker`, `DirectoryPickerProps`, `exportGlb`)
- Modify: `jest.config.json` `collectCoverageFrom` add `"!src/react/canvasRenderer.ts"`
- Test: `tests/unit/react/BuildingModels.test.tsx` (ported `buildingModels.test.mjs`, split into `BuildingModels.test.tsx` and `BuildingModels.selection.test.tsx` to stay < 250 lines), `tests/unit/react/loadGeometry.test.ts`

**Interfaces — Consumes:** Task 7 `SceneView`, `PropertyTree`, `handleKey`; Task 8 panels, `assets`, `exportGlb`, `meshesFrom`; Task 6 `convertIfc` (dynamic import).
**Interfaces — Produces:**

```ts
export interface BuildingModelsProps {
  libraryUrl: string;
  /** Library folder holding the models; the host or the user chooses it. */
  directory: string;
  readings?: Map<string, Reading>;
  feed?: FeedState;
  onPersistGeometry?: (model: BimModel, glb: Uint8Array) => Promise<void>;
  /** Lists `directory`; absent → fetch `contentsUrl(libraryUrl, directory)`. */
  list?: (directory: string) => Promise<LibraryEntry[]>;
  /** Model stem to show; absent → uncontrolled, as bim-kit 0.1.1. */
  selected?: string;
  /** Called when the person picks a model. */
  onSelect?: (name: string) => void;
  /** Called with the chosen model's bindings whenever they change. */
  onBindingsChange?: (bindings: Binding[]) => void;
}
```

`BimCanvas` props and `ViewerHandle` unchanged from upstream.

- [ ] **Step 1: Port the upstream BuildingModels tests** (stand-in canvas via `jest.mock('src/react/BimCanvas', () => ({ __esModule: true, default: StandInCanvas }))`; pass `directory: 'common/models'` explicitly where upstream relied on the default). Add cases:
  - `selected="office-b"` shows office-b even though hospital-a sorts first; changing the prop to `hospital-a` switches the canvas `url`.
  - Picking a model in the select calls `onSelect('office-b')`; when `selected` is given the component does not switch until the prop changes.
  - `selected="gone"` shows `No model named gone in common/models`.
  - `onBindingsChange` receives the manifest's bindings once they load, and `[]` for a model with no manifest.
  - With `list` given, `fetch` is not called for the listing, and `list` receives `directory`.
  - Review Focus 5: `list` for `a` is deferred; rerender with `directory="b"` whose list resolves first; then resolve `a`; only `b`'s models are shown.
- [ ] **Step 2: `loadGeometry.test.ts`** — with `convertIfc`, `meshesFrom` and `exportGlb` mocked via `jest.mock`: a convert load reports progress text, calls `onConverted` with the exported bytes, still shows the model when `exportGlb` rejects, and reports `This model could not be converted. the file returned HTTP 404` on a failed fetch.
- [ ] **Step 3: Run to confirm failure.**
- [ ] **Step 4: Port and split** `BuildingModels.tsx` and `BimCanvas.tsx` with the departures (required `directory`, `list`, `selected`/`onSelect`, `onBindingsChange`); a `current`-flag or `AbortController` guard in `useModelList` implements Review Focus 5.
- [ ] **Step 5: Run to confirm pass**, `yarn test:unit`, lint, typecheck; commit `feat(bim): port BuildingModels and BimCanvas with controlled selection`.

### Task 10: DTaaS layer

**Files:**
- Create: `src/dtaas/{ids,config,detect,anchors,scopes,converters,useReadings,useModelRoute,persistGeometry,index}.ts`, `src/dtaas/presets/index.ts`, `src/dtaas/converters/ifcToGlb.ts`, `src/dtaas/pages/BuildingsPage.tsx`
- Test: `tests/unit/dtaas/{detect,anchors,presets,scopes,converters,config,useReadings,useModelRoute,persistGeometry}.test.ts(x)`

**Interfaces — Consumes:** SDK root types (`DtaasExtension`, `AnchorKindSpec`, `ScopeRule`, `ConverterSpec`, `Converter`, `EncodingPreset`, `DigitalTwinSummary`, `SignalsService`, `HostServices`, `SignalSample`), `useHost`, `defineExtension`; core `topicsOf`, `bindingsByTopic`, `objectOf`, `normaliseLibraryPath`, `GLOBAL_ID_PATTERN`; Task 9 `BuildingModels`; Task 8 `DirectoryPicker`, `exportGlb`, `meshesFrom`; Task 6 `convertIfc`.
**Interfaces — Produces:** `extension` (named and default export of `src/dtaas/index.ts`); `BIM_ROOT = '/bim'` (in `ids.ts`, beside `BIM_EXTENSION_ID` re-exported from core); `useReadings(signals, bindings): LiveReadings`; `useModelRoute(fallback: string): ModelRoute`; `persistGeometry(host, directory)`.

- [ ] **Step 1: Write failing unit tests**

`detect.test.ts`: `domain: 'bim'` → true; `files: ['model/Hospital.IFC']` → true; `files: ['a.glb']`, no domain → false.

`anchors.test.ts`: kind `ifc-guid`, substrates `['aec']`; `validateRef` true for `0_sgz7bzz4Jh2ckU1ehFe$`, false for `abc`; `resolve` returns whatever a stub adapter's `resolve(anchor)` returns and passes the anchor through.

`presets.test.ts`: every preset passes `encodingPresetSchema` from `@into-cps-association/dtaas-sdk/schema`; ids are `bim.thermal-comfort` (domain `[18, 26]`) and `bim.co2` (domain `[400, 1400]`); substrate `aec`.

`scopes.test.ts`:

```ts
const handles: Record<string, unknown> = {
  a: { userData: { room: 'R1', storey: 'L1' } },
  b: { userData: { room: 'R1', storey: 'L2' } },
  c: { userData: { room: 'constructor', storey: '__proto__' } },
  d: { userData: {} },
};
const adapter = { resolve: ({ ref }: { ref: string }) => (ref in handles ? { substrate: 'aec', id: ref, handle: handles[ref] } : null) } as unknown as SubstrateAdapter;
```

  `bim.room` groups `['a','b','c','d','zz']` into `{ R1: ['a','b'], constructor: ['c'] }` (with `Object.keys` order checked and `result.constructor` being an array); `bim.storey` gives `{ L1: ['a'], L2: ['b'], __proto__: ['c'] }` as own keys (`Object.hasOwn(result, '__proto__')`).

`converters.test.ts`: spec `{ id: 'bim.ifc-to-glb', from: ['.ifc'], to: 'glb' }`; `load()` resolves to a function; with `src/converter` and `src/react/exportGlb` mocked, calling it with `{ name: 'x.ifc', bytes }` returns `{ format: 'glb', bytes: <exported>, metadata: { schema: 'IFC4', objects: 1, failed: 0 } }`.

`config.test.ts`: `readExtensionConfig('bim', configSchema, { REACT_APP_EXT_BIM_MODELS_DIRECTORY: 'projects' })` → `{ modelsDirectory: 'projects' }`; empty env → `{}`; empty string → failure.

`useReadings.test.tsx` (use `fakeHostServices().signals` and `renderHook` from `@testing-library/react`): binding A and B both on topic `t1`, C on `t2`; emitting `{ signalPath: 't1', value: 5, ts: 100 }` sets readings for A's and B's GlobalIds to `{ value: 5, receivedAt: 100 }`; a string value `'x'` on `t1` leaves the readings unchanged (Review Focus 4); a sample on an unbound path is ignored; `feed` is `live`, becomes `down` after `signals.setConnection('down', ['t1'])` and stays `live` after `setConnection('down', ['other'])`; changing `bindings` to `[]` unsubscribes (a later `t1` sample changes nothing) and resets readings; unmount unsubscribes.

`useModelRoute.test.tsx` (render inside `MemoryRouter` + `Routes` with `path="/bim"` and `path="/bim/models/:model"`, reading the location via a probe component): no `?dir=` → `directory` is the fallback; `?dir=projects/aarhus` wins; `?dir=../x` → `directory: null`, `rejected: '../x'`; `selectModel('office b')` navigates to `/bim/models/office%20b?dir=projects/aarhus`; `selectDirectory('projects/odense')` navigates to `/bim?dir=projects/odense`; `model` is the decoded `:model`.

`persistGeometry.test.ts`: writes `<dir>/<name>.glb` through `host.contents` with `mimeType: 'model/gltf-binary'`; on rejection logs `warn` through `host.logger` and rethrows.

- [ ] **Step 2: Run to confirm failure.**

- [ ] **Step 3: Implement**

`src/dtaas/ids.ts`:

```ts
import { BIM_EXTENSION_ID } from 'src/core';

export { BIM_EXTENSION_ID };
/** Absolute mount point; navigation must stay under it (SDK rule). */
export const BIM_ROOT = `/${BIM_EXTENSION_ID}`;
```

`src/dtaas/config.ts`:

```ts
import { z } from 'zod';

/** `REACT_APP_EXT_BIM_*` keys: `MODELS_DIRECTORY` overrides the host's models folder. */
const configSchema = z.object({ modelsDirectory: z.string().min(1).optional() });

export type BimConfig = z.infer<typeof configSchema>;
export default configSchema;
```

`src/dtaas/detect.ts`:

```ts
import type { DigitalTwinSummary } from '@into-cps-association/dtaas-sdk';

const isBimTwin = (dt: DigitalTwinSummary): boolean =>
  dt.domain === 'bim' ||
  dt.files.some((file) => file.toLowerCase().endsWith('.ifc'));

export default isBimTwin;
```

`src/dtaas/anchors.ts`:

```ts
import type { AnchorKindSpec } from '@into-cps-association/dtaas-sdk';
import { GLOBAL_ID_PATTERN } from 'src/core';

const anchorKinds: AnchorKindSpec[] = [
  {
    kind: 'ifc-guid',
    substrates: ['aec'],
    label: 'IFC GlobalId',
    validateRef: (ref) => GLOBAL_ID_PATTERN.test(ref),
    resolve: (anchor, adapter) => adapter.resolve(anchor),
  },
];

export default anchorKinds;
```

`src/dtaas/presets/index.ts`:

```ts
import type { EncodingPreset } from '@into-cps-association/dtaas-sdk';

const presets: EncodingPreset[] = [
  {
    id: 'bim.thermal-comfort',
    label: 'Thermal comfort',
    description: 'Colours each room by its measured temperature, 18–26 °C.',
    substrate: 'aec',
    encodings: [
      {
        target: '*/temperature',
        encoding: { type: 'colorScale', domain: [18, 26], scheme: 'bim.cold-warm', channel: 'measured', clamp: true },
      },
    ],
  },
  {
    id: 'bim.co2',
    label: 'CO₂',
    description: 'Colours each room by its measured CO₂, 400–1400 ppm.',
    substrate: 'aec',
    encodings: [
      {
        target: '*/co2',
        encoding: { type: 'colorScale', domain: [400, 1400], scheme: 'bim.cold-warm', channel: 'measured', clamp: true },
      },
    ],
  },
];

export default presets;
```

`src/dtaas/scopes.ts`:

```ts
import type { ScopeRule, SubstrateAdapter } from '@into-cps-association/dtaas-sdk';

type Fact = 'room' | 'storey';

/** Room or storey the aec substrate copied from the property tree. */
const factOf = (adapter: SubstrateAdapter, ref: string, fact: Fact) => {
  const element = adapter.resolve({ kind: 'ifc-guid', ref, signalPath: ref });
  const data = (element?.handle as { userData?: Record<string, unknown> })?.userData;
  const value = data?.[fact];
  return typeof value === 'string' && value !== '' ? value : undefined;
};

/** A `Map` first, so names such as `__proto__` become ordinary keys. */
const groupBy =
  (fact: Fact): ScopeRule['group'] =>
  (elementIds, { adapter }) => {
    const groups = new Map<string, string[]>();
    elementIds.forEach((id) => {
      const key = factOf(adapter, id, fact);
      if (key !== undefined) groups.set(key, [...(groups.get(key) ?? []), id]);
    });
    return Object.fromEntries(groups);
  };

const scopes: ScopeRule[] = [
  { id: 'bim.room', label: 'Per room', group: groupBy('room') },
  { id: 'bim.storey', label: 'Per storey', group: groupBy('storey') },
];

export default scopes;
```

(`Object.fromEntries` defines own properties, so `__proto__` is an own key — the test pins this.)

`src/dtaas/converters/ifcToGlb.ts`:

```ts
import type { Converter } from '@into-cps-association/dtaas-sdk';
import { convertIfc } from 'src/converter';
import exportGlb from 'src/react/exportGlb';
import { meshesFrom } from 'src/react/ifcMeshes';

/** IFC → GLB in the browser: the same path the Buildings page uses. */
const ifcToGlb: Converter = async ({ bytes }) => {
  const converted = await convertIfc(bytes);
  return {
    format: 'glb',
    bytes: await exportGlb(meshesFrom(converted)),
    metadata: {
      schema: converted.schema,
      objects: converted.objects.length,
      failed: converted.failed,
    },
  };
};

export default ifcToGlb;
```

`src/dtaas/converters.ts`:

```ts
import type { ConverterSpec } from '@into-cps-association/dtaas-sdk';

const converters: ConverterSpec[] = [
  {
    id: 'bim.ifc-to-glb',
    from: ['.ifc'],
    to: 'glb',
    load: () => import('src/dtaas/converters/ifcToGlb'),
  },
];

export default converters;
```

`src/dtaas/useReadings.ts`:

```ts
import { useEffect, useMemo, useState } from 'react';
import type { SignalSample, SignalsService } from '@into-cps-association/dtaas-sdk';
import {
  bindingsByTopic,
  objectOf,
  topicsOf,
  type Binding,
  type FeedState,
  type Reading,
} from 'src/core';

export interface LiveReadings {
  readonly readings: Map<string, Reading>;
  readonly feed: FeedState;
}

const withSample = (
  previous: Map<string, Reading>,
  targets: readonly Binding[],
  { value, ts }: SignalSample,
) => {
  if (typeof value !== 'number' || targets.length === 0) return previous;
  const next = new Map(previous);
  targets.forEach((binding) => {
    const globalId = objectOf(binding);
    if (globalId !== undefined) next.set(globalId, { value, receivedAt: ts });
  });
  return next;
};

/** Latest measured value per GlobalId; a binding's MQTT topic is its signal path. */
const useReadings = (signals: SignalsService, bindings: Binding[]): LiveReadings => {
  const topics = useMemo(() => topicsOf(bindings), [bindings]);
  const [readings, setReadings] = useState(() => new Map<string, Reading>());
  const feed = signals.connection.use(topics);
  useEffect(() => {
    setReadings(new Map());
    if (topics.length === 0) return undefined;
    const byTopic = bindingsByTopic(bindings);
    return signals.subscribe(topics, 'measured', (sample) =>
      setReadings((previous) =>
        withSample(previous, byTopic.get(sample.signalPath) ?? [], sample),
      ),
    );
  }, [signals, bindings, topics]);
  return { readings, feed };
};

export default useReadings;
```

`src/dtaas/useModelRoute.ts`:

```ts
import { useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { normaliseLibraryPath } from 'src/core';
import { BIM_ROOT } from 'src/dtaas/ids';

export interface ModelRoute {
  /** Folder to show, or `null` when `?dir=` could leave the library. */
  readonly directory: string | null;
  /** The raw `?dir=` value when it was rejected. */
  readonly rejected?: string;
  readonly model?: string;
  selectModel(name: string): void;
  selectDirectory(path: string): void;
}

/** `/` stays readable in the query; everything else is encoded. */
const withDir = (path: string, directory: string) =>
  `${path}?dir=${encodeURIComponent(directory).replace(/%2F/g, '/')}`;

const useModelRoute = (fallback: string): ModelRoute => {
  const { model } = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const raw = search.get('dir') || fallback;
  const directory = normaliseLibraryPath(raw);
  const selectModel = useCallback(
    (name: string) => {
      if (directory !== null) {
        navigate(withDir(`${BIM_ROOT}/models/${encodeURIComponent(name)}`, directory));
      }
    },
    [directory, navigate],
  );
  const selectDirectory = useCallback(
    (path: string) => navigate(withDir(BIM_ROOT, path)),
    [navigate],
  );
  return { directory, rejected: directory === null ? raw : undefined, model, selectModel, selectDirectory };
};

export default useModelRoute;
```

If `useModelRoute` exceeds 25 lines after formatting, move the two callbacks into a `useSelectors(directory)` hook in the same file.

`src/dtaas/persistGeometry.ts`:

```ts
import type { HostServices } from '@into-cps-association/dtaas-sdk';
import type { BimModel } from 'src/react/assets';

/** Stores a browser conversion beside its IFC so the next visit loads it. */
const persistGeometry =
  (host: HostServices, directory: string) =>
  async (model: BimModel, glb: Uint8Array): Promise<void> => {
    try {
      await host.contents.put(`${directory}/${model.name}.glb`, glb, {
        mimeType: 'model/gltf-binary',
      });
    } catch (error) {
      host.logger.warn('bim: could not store converted geometry', model.name, error);
      throw error;
    }
  };

export default persistGeometry;
```

`src/dtaas/pages/BuildingsPage.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { Alert, Stack } from '@mui/material';
import { useHost } from '@into-cps-association/dtaas-sdk';
import type { Binding } from 'src/core';
import { BuildingModels, DirectoryPicker } from 'src/react';
import configSchema from 'src/dtaas/config';
import persistGeometry from 'src/dtaas/persistGeometry';
import useModelRoute from 'src/dtaas/useModelRoute';
import useReadings from 'src/dtaas/useReadings';

const useFallbackDirectory = () => {
  const host = useHost();
  return useMemo(
    () => host.config(configSchema).modelsDirectory ?? host.library.conventions.modelsDirectory,
    [host],
  );
};

const BuildingsPage = () => {
  const host = useHost();
  const route = useModelRoute(useFallbackDirectory());
  const libraryUrl = host.library.useBaseUrl();
  const [bindings, setBindings] = useState<Binding[]>([]);
  const { readings, feed } = useReadings(host.signals, bindings);
  const { Page } = host.ui;
  const { directory } = route;
  if (directory === null) {
    return (
      <Page title="Buildings">
        <Alert severity="error">&quot;{route.rejected}&quot; is not a folder in your library.</Alert>
      </Page>
    );
  }
  return (
    <Page title="Buildings">
      <Stack spacing={2}>
        <DirectoryPicker list={host.contents.list} value={directory} onChange={route.selectDirectory} />
        {libraryUrl && (
          <BuildingModels
            libraryUrl={libraryUrl} directory={directory} list={host.contents.list}
            selected={route.model} onSelect={route.selectModel}
            onBindingsChange={setBindings} readings={readings} feed={feed}
            onPersistGeometry={persistGeometry(host, directory)}
          />
        )}
      </Stack>
    </Page>
  );
};

export default BuildingsPage;
```

Split `BuildingsPage` into `BuildingsPage` (hooks + error branch) and a `BuildingsView` component in the same file if it exceeds 25 lines after Prettier.

`src/dtaas/index.ts`:

```ts
import { lazy } from 'react';
import ApartmentIcon from '@mui/icons-material/Apartment';
import { defineExtension } from '@into-cps-association/dtaas-sdk';
import anchorKinds from 'src/dtaas/anchors';
import configSchema from 'src/dtaas/config';
import converters from 'src/dtaas/converters';
import isBimTwin from 'src/dtaas/detect';
import { BIM_EXTENSION_ID, BIM_ROOT } from 'src/dtaas/ids';
import presets from 'src/dtaas/presets';
import scopes from 'src/dtaas/scopes';

const BuildingsPage = lazy(() => import('src/dtaas/pages/BuildingsPage'));

/** The only object the host imports: `import { extension } from '<kit>/dtaas'`. */
export const extension = defineExtension({
  id: BIM_EXTENSION_ID,
  name: 'Buildings',
  version: '0.1.0',
  sdk: 1,
  routes: [
    { path: '', element: BuildingsPage },
    { path: 'models/:model', element: BuildingsPage },
  ],
  navigation: [{ label: 'Buildings', path: BIM_ROOT, icon: ApartmentIcon, order: 20 }],
  config: { schema: configSchema },
  setup: (host) => {
    host.config(configSchema);
    host.logger.info('bim ready');
  },
  visualisation: { detect: isBimTwin, anchorKinds, converters, presets, scopes },
});

export default extension;
```

- [ ] **Step 4: Run to confirm pass** — `yarn test:unit tests/unit/dtaas`, lint, typecheck.
- [ ] **Step 5: Commit** — `feat(bim): add the DTaaS extension layer`.

### Task 11: Integration tests

**Files:**
- Test: `tests/integration/conformance.test.tsx`, `tests/integration/buildingsPage.test.tsx`, `tests/integration/buildingsPage.live.test.tsx`, `tests/integration/migrate.test.ts`; fixture `tests/fixtures/library.ts` (IFC head strings from the ported `BuildingModels` tests, a manifest, and a `fetch` stub serving `files/...` URLs from a record)

**Interfaces — Consumes:** `extension`, `BuildingsPage`, `manifestToVisualisation`, SDK `fakeHostServices`, `renderWithHost`, `checkConformance`, `validateExtension`, `parseVisualisationAsset`.

- [ ] **Step 1: Write the tests**

`conformance.test.tsx`:
- `validateExtension(extension)` → `{ valid: true, errors: [] }`.
- `checkConformance(extension, { host: fakeHostServices({ extensionId: 'bim' }) })` → `{ passed: true, errors: [] }`, and the host recorded `info` `'bim ready'`.
- With env `REACT_APP_EXT_BIM_MODELS_DIRECTORY: ''` conformance fails with `setup() failed: Invalid configuration for extension "bim"`.
- `visualisation.detect` claims `{ name: 'h', path: 'dt/h', files: ['h.ifc'] }`.

`buildingsPage.test.tsx` — render `<Routes><Route path="/bim" element={<BuildingsPage/>}/><Route path="/bim/models/:model" element={<BuildingsPage/>}/></Routes>` with `renderWithHost(…, { host, route })`, `BimCanvas` replaced by a stand-in (`jest.mock('src/react/BimCanvas', …)`) that shows `data-url`, host `files` seeded with `common/models/hospital-a.ifc`, `common/models/office-b.ifc`, `projects/aarhus/tower.ifc`, and `globalThis.fetch` stubbed from `tests/fixtures/library.ts`:
- `/bim` lists the host-convention folder (`common/models`) through `host.contents.list` and shows `Folder: common/models`.
- `/bim?dir=projects/aarhus` shows `tower`.
- Env `REACT_APP_EXT_BIM_MODELS_DIRECTORY: 'projects/aarhus'` changes the default.
- `/bim?dir=projects/%2e%2e/secret` shows the error alert and `host.contents.list` is never called with it (spy with `jest.spyOn(host.contents, 'list')`) — Review Focus 2.
- `/bim/models/gone?dir=common/models` shows `No model named gone in common/models`.
- Choosing `office-b` in the model select moves the location to `/bim/models/office-b?dir=common/models` (probe with a `useLocation` component).
- Choosing folder `projects/aarhus` in the picker moves the location to `/bim?dir=projects/aarhus`.
- The stand-in canvas calls `onConverted(bytes)` → `host.contents.files.get('common/models/hospital-a.glb')` equals `bytes`, and the page says it is stored.

`buildingsPage.live.test.tsx` — hospital-a with a manifest (`common/models/hospital-a.manifest.json`, one binding on topic `hosp/r204/temp`):
- `act(() => host.signals.emit({ twinId: 'h', signalPath: 'hosp/r204/temp', channel: 'measured', ts: Date.now(), value: 21.5 }))` shows `21.5` on the sensor card and `updated 0 s ago`.
- `act(() => host.signals.setConnection('down'))` makes the card read `not live`.

`migrate.test.ts` — the Task 5 fixture → `manifestToVisualisation` → `parseVisualisationAsset(asset).success` → `host.viz.save(dt, asset)` then `host.viz.load(dt)` returns an equal asset.

- [ ] **Step 2: Run** — `yarn test:int`; fix production code (not tests) until PASS. Run `yarn test:coverage`; where the gate fails, add unit tests for the uncovered branches (do not add coverage exclusions beyond `canvasRenderer.ts`, generated code and indexes).
- [ ] **Step 3: Commit** — `test(bim): add conformance, page and migration integration tests`.

### Task 12: Build, e2e smoke, docs and CI

**Files:**
- Create: `examples/bim/tests/e2e/smoke-package.mjs`, `examples/bim/README.md`, `examples/bim/CHANGELOG.md`, `examples/bim/THIRD-PARTY-NOTICES.md` (upstream notice; paths updated to `dist/converter/...`)
- Modify: `.github/workflows/dtaas-sdk.yml` (new `bim-example` job), root `README.md` (examples list), root `DEVELOPER.md` (how to run the bim example)

- [ ] **Step 1: e2e smoke** — modelled on the root `tests/e2e/smoke-package.mjs`: run `yarn pack` in `examples/bim` to a temp dir; assert every entry matches `^package/(package\.json|README\.md|LICENSE\.md|CHANGELOG\.md|THIRD-PARTY-NOTICES\.md|dist/.*\.(js|d\.ts))$` and that `dist/react/BimCanvas.js` and `dist/converter/index.js` exist; also pack the SDK root; create a temp project, `yarn add` both tarballs plus `react@19.2.0 react-dom@19.2.0 zod@4.4.3 three@0.186.0 web-ifc@0.0.77 @mui/material@9.4.0 @mui/icons-material@9.4.0 @emotion/react@11.14.0 @emotion/styled@11.14.1`; then in Node import each subpath and check: `.` → `normaliseLibraryPath('a/../b') === null`; `./schema` → `readManifest({}).ok === false`; `./converter` → `typeof convertIfc === 'function'`; `./viewer` → `typeof SceneView === 'function'`; `./react` → `typeof BuildingModels === 'function'`; `./react/canvas` → `typeof default === 'function'`; `./dtaas` → `extension.id === 'bim'` and `validateExtension(extension).valid` via the SDK. Run `yarn test:e2e` → PASS.
- [ ] **Step 2: Docs** — `examples/bim/README.md`: what the example is (bim-kit 0.1.1 on the SDK), setup (`yarn install && yarn sdk`), scripts, subpaths table, URL scheme (`/bim`, `/bim/models/<name>?dir=<folder>`), folder fallback order, the two SDK gaps (ScopeContext has no element properties; FieldKernel has no geometry), departures from 0.1.1 (spec §6). `CHANGELOG.md` 0.1.0 entry listing the port and departures. Root `README.md` and `DEVELOPER.md`: one short section each pointing at `examples/bim`.
- [ ] **Step 3: CI job** — add to `.github/workflows/dtaas-sdk.yml`, reusing the pinned action SHAs of the `validate` job:

```yaml
  bim-example:
    name: Validate bim example (Node 24)
    runs-on: ubuntu-latest
    timeout-minutes: 30
    defaults:
      run:
        working-directory: examples/bim
    steps:
      - name: Checkout
        uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0
        with:
          lfs: false
      - name: Setup node
        uses: actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e
        with:
          node-version: 24
          cache: yarn
          cache-dependency-path: |
            yarn.lock
            examples/bim/yarn.lock
      - name: Install SDK dependencies
        working-directory: .
        run: yarn install --frozen-lockfile --ignore-scripts --network-timeout 1000000
      - name: Install bim dependencies
        run: yarn install --frozen-lockfile --ignore-scripts --network-timeout 1000000
      - name: Build and install the packed SDK
        run: yarn sdk
      - name: Check formatting
        run: yarn format:check
      - name: Lint
        run: yarn lint
      - name: Type-check
        run: yarn typecheck
      - name: Unit and integration tests with coverage gate
        run: yarn test:coverage
      - name: Build, pack, install and smoke-test the package
        run: yarn test:e2e
```

Run `yamllint .github/workflows/dtaas-sdk.yml` if available.

- [ ] **Step 4: Final verification** — at the root: `yarn lint && yarn format:check && yarn typecheck && yarn test:all`; in `examples/bim`: `yarn format:check && yarn lint && yarn typecheck && yarn test:all`; `find examples/bim/src examples/bim/tests -name '*.ts*' -not -path '*/generated/*' | xargs wc -l | sort -n | tail -3` shows every file < 250 lines. All PASS.
- [ ] **Step 5: Commit** — `build(bim): e2e smoke test, docs and CI job`.
