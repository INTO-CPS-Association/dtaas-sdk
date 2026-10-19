# 🛠️ Developer Guide

This package follows the coding standards of the DTaaS client and of
`lib/dt-automation` in the
[DTaaS repository](https://github.com/INTO-CPS-Association/DTaaS).

## Requirements

- Node.js 24 (or newer)
- Yarn 1.22.22
- Optional: [qlty](https://qlty.sh) for `yarn prep`

## Commands

| Command                             | Purpose                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `yarn install`                      | Install dependencies                                               |
| `yarn syntax`                       | Lint and fix with ESLint                                           |
| `yarn lint`                         | Lint without fixing (used in CI)                                   |
| `yarn format` / `yarn format:check` | Format with Prettier / check formatting                            |
| `yarn typecheck`                    | Type-check sources, tests and examples                             |
| `yarn test:unit`                    | Unit tests (`tests/unit`)                                          |
| `yarn test:int`                     | Integration tests (`tests/integration`)                            |
| `yarn test:coverage`                | Unit and integration tests with the coverage gate                  |
| `yarn test:e2e`                     | Build, pack, install into a clean project and import every subpath |
| `yarn test:all`                     | `test:coverage` then `test:e2e`                                    |
| `yarn check:package`                | Check `package.json`, the exports map and the packed types         |
| `yarn build`                        | Build `dist/` (tsup ESM + `tsc` declarations + `tsc-alias`)        |
| `yarn prep`                         | Everything above plus `qlty`, before opening a pull request        |
| `yarn clean`                        | Remove `dist/` and `coverage/`                                     |

## Layout

```text
src/
  index.ts            root entry (bundled by the host)
  extension/          DtaasExtension types, constants, helpers, validation rules
  host/               HostServices types and HostProvider/useHost
  visualisation/      layer types: signals, anchors, encodings, substrates, contributions
  schema/             ./schema entry: zod schemas
  testing/            ./testing entry: fakes, renderWithHost, replayFixture, checkConformance
  eslint/             ./eslint entry: kit boundary rules
tests/
  unit/               mirrors src/
  integration/        hello-kit conformance, fixture replay, asset round trips, ESLint rules
  e2e/                packed-tarball smoke test
  fixtures/           junction-7 visualisation.json, recorded stream, extension fixtures
examples/hello-kit/   the template layout of a domain kit
```

## Conventions

- Functions under 25 lines and files under 250 lines (DTaaS `AGENTS.md`).
- Interfaces over type aliases; a type alias only where required
  (unions, `z.infer`, structural compatibility).
- `*.types.ts` for type-only modules, `*.schema.ts` for zod schemas;
  PascalCase for components, camelCase otherwise.
- A module with one export uses a default export (airbnb-base).
- Imports inside the package use the `src/*` alias; tests may also use
  `tests/*` and `examples/*`. The build rewrites aliases to relative paths.
- Types that have a schema are inferred from it with `z.infer`, so the two
  cannot drift. The root entry imports schema modules with `import type` only,
  so `zod` is not a runtime import of the host bundle.
- `globalThis` instead of `window`; `node:` prefixes for Node built-ins.
- Tests live in `tests/`, never next to the source, and match `*.test.ts(x)`.

## examples/bim

[`examples/bim`](examples/bim) is a standalone package (its own
`package.json`, `yarn.lock`, tests and CI job), not part of this workspace.
From the repository root:

```bash
yarn install                # once, at the root
cd examples/bim
yarn install
yarn sdk                    # builds, packs and installs this SDK as a tarball
yarn test:all
```

See [`examples/bim/README.md`](examples/bim/README.md) for its full scripts
table, entry points and the `bim-example` CI job.

## Releasing

1. Bump `version` in `package.json` and add a `CHANGELOG.md` entry.
2. Merge to `main`. The `DTaaS SDK npm package` workflow validates the package
   and, in the `INTO-CPS-Association` organisation only, publishes it to
   GitHub Packages and npmjs. A prerelease version (`x.y.z-alpha.n`) is
   published under the `next` tag.
