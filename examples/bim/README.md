# 🏢 bim-example

`@into-cps-association/bim-example` ports **bim-kit 0.1.1** onto the
[DTaaS SDK](../../README.md) contract: IFC-to-GLB conversion, a three.js
scene, a React building browser, and the `bim` `DtaasExtension` that plugs
the whole thing into a DTaaS host.

It is a standalone, private package (not published) that exercises the SDK
the way a real domain kit would: its own `package.json`, build, tests and CI
job, with the SDK installed the same way any consumer installs it: packed and
added, never as a workspace symlink.

## 📦 Setup

```bash
# once, at the repository root
yarn install

# then, in examples/bim
yarn install
yarn sdk   # builds the SDK root, packs it and installs the tarball here
```

`yarn sdk` (`scripts/install-sdk.mjs`) is what makes
`@into-cps-association/dtaas-sdk` resolvable during development. Run it again
after pulling in SDK changes.

`three`, `web-ifc` and `zod` are dependencies. Everything a host must share
with the package is a peer: `react`, `react-dom`, `react-router-dom`, MUI,
Emotion and the SDK. The router is a peer because the `Buildings` page reads
the host's router context; a bundled copy would read its own, empty one.

## 🧰 Scripts

| Command                             | Purpose                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `yarn sdk`                          | Build, pack and install the SDK root as a tarball                  |
| `yarn wasm`                         | Inline `web-ifc.wasm` into `src/converter/generated/`              |
| `yarn build`                        | Build `dist/` (tsup ESM + `tsc` declarations + `tsc-alias`)        |
| `yarn typecheck`                    | Type-check sources and tests                                       |
| `yarn lint` / `yarn syntax`         | Lint / lint and fix with ESLint                                    |
| `yarn format` / `yarn format:check` | Format with Prettier / check formatting                            |
| `yarn test:unit` / `yarn test:int`  | Unit / integration tests                                           |
| `yarn test:coverage`                | Unit and integration tests with the coverage gate                  |
| `yarn test:e2e`                     | Build, pack, install into a clean project and import every subpath |
| `yarn test:all`                     | `test:coverage` then `test:e2e`                                    |

## 🚪 Entry points

| Import                              | Contents                                                                            | Pulls in                         |
| ----------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------- |
| `@into-cps-association/bim-example` | binding, resolver, readings, alerts, ramp, storeys, ifcName, `normaliseLibraryPath` | nothing                          |
| `.../schema`                        | `readManifest`, manifest schemas, `manifestToVisualisation`                         | `zod`                            |
| `.../converter`                     | `convertIfc`, the inlined web-ifc WASM                                              | `web-ifc`                        |
| `.../viewer`                        | `SceneView`, appearance, shortcuts, gizmo, outline, glow, field, `fieldSheet`       | `three`                          |
| `.../react`                         | `BuildingModels`, panels, `DirectoryPicker`, asset helpers                          | `react`, MUI                     |
| `.../react/canvas`                  | `BimCanvas`, kept in its own chunk                                                  | `three`                          |
| `.../dtaas`                         | the `bim` `DtaasExtension`                                                          | the SDK root, `react-router-dom` |

## 🧭 URL scheme

The extension mounts at `/bim`:

- `/bim`: the models list for the fallback (or `?dir=`) folder.
- `/bim/models/<name>?dir=<folder>`: a chosen model in a folder.

The folder shown, in order: the `?dir=` query parameter, then the
`REACT_APP_EXT_BIM_MODELS_DIRECTORY` extension setting, then the host's
`library.conventions.modelsDirectory` default. An invalid `?dir=` (one that
could leave the library) shows an alert, fetches nothing for it, and offers
the folder picker at the fallback folder so a valid one can be chosen. Live
readings start from the latest stored value of each bound topic.

Selecting a model navigates to `/bim/models/<name>?dir=<dir>`; changing the
folder navigates to `/bim?dir=<folder>` and resets the chosen model.
Switching models hides the toolbar and side panels until the new viewer is
ready.

## ⚠️ SDK gaps this package works around

- **`ScopeContext` carries no element properties.** The `bim.room` and
  `bim.storey` scopes need to group elements by room and storey, but the
  scene's glTF `extras` alone (`globalId`, `ifcClass`, `predefinedType`) does
  not carry that. Both scopes assume the `aec` substrate copies room and
  storey onto each element's `userData` from the property tree; elements
  with neither are omitted.
- **`FieldKernel(samples, grid)` carries no geometry.** bim-kit's flood fill
  needs wall geometry to stop the fill at, which the kernel does not carry,
  so this package ships no `fieldKernels`.

## 🔀 Departures from bim-kit 0.1.1

Full list in
[design §6](../../docs/superpowers/specs/2026-09-28-bim-example-design.md#6-departures-from-bim-kit-011).
In short:

- `BuildingModels`: `directory` is now required; selection is controllable
  (`selected?`, `onSelect?`, uncontrolled behaviour unchanged); an unknown
  `selected` shows `No model named <name> in <directory>`; `MODELS_DIRECTORY`
  is removed.
- New `onBindingsChange?(bindings)` and `list?(directory)` on
  `BuildingModels` (falls back to `contentsUrl` when `list` is absent, as
  0.1.1 did).
- New `DirectoryPicker({ list, value, onChange })`, independent of DTaaS.
- New `core/libraryPath.normaliseLibraryPath(raw)`.
- New `schema/migrate.manifestToVisualisation(manifest, { name, brokerUrl })`.
- `exportGlb` extracted from `BimCanvas` so the converter can reuse it.

See [`CHANGELOG.md`](CHANGELOG.md) for the release notes.

## ⚖️ License

Distributed under the INTO-CPS Association Public License. See
[LICENSE.md](LICENSE.md). Third-party notices for the inlined
`web-ifc.wasm` are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
