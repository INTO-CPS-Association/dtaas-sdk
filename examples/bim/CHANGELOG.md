# Changelog

All notable changes to this package are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-28

### Added

- bim-kit 0.1.1 ported onto `@into-cps-association/dtaas-sdk`: IFC-to-GLB
  conversion (`./converter`), the three.js scene (`./viewer`), the React
  building browser and canvas (`./react`, `./react/canvas`), and the
  framework-free domain core (`.`, `./schema`).
- `./dtaas`: the `bim` `DtaasExtension`, with the `Buildings` page and
  navigation entry, the `ifc-guid` anchor kind, the `bim.ifc-to-glb`
  converter, the `bim.thermal-comfort` and `bim.co2` presets, and the
  `bim.room` / `bim.storey` scopes.
- `scripts/inline-wasm.mjs`: inlines `web-ifc.wasm` into the package as
  base64 so a consumer installs one package and serves no extra file.

### Changed from bim-kit 0.1.1 (design §6)

- `BuildingModels`: `directory` is now required; selection is controllable
  through new `selected?`/`onSelect?` props (uncontrolled behaviour is
  unchanged); an unknown `selected` renders
  `No model named <name> in <directory>`; `MODELS_DIRECTORY` is removed.
- `BuildingModels`: new `onBindingsChange?(bindings)` and `list?(directory)`;
  when `list` is absent the page falls back to `contentsUrl`, as 0.1.1 did.
- New `DirectoryPicker({ list, value, onChange })`, independent of DTaaS.
- New `core/libraryPath.normaliseLibraryPath(raw)`, rejecting `..`, `.`,
  a leading `/`, `\`, empty segments, and percent-encoded dot segments and
  separators (`%2F`, `%5C`, `%00`).
- New `schema/migrate.manifestToVisualisation(manifest, { name, brokerUrl })`.
- `exportGlb` extracted from `BimCanvas` so the converter can reuse it.
- A folder change resets the chosen model; switching models hides the
  toolbar and panels until the new viewer is ready.

### Fixed

- `react-router-dom` is now a peer dependency instead of being bundled into
  `dist`, so the `Buildings` page reads the host's router context.
- A live reading no longer remounts the 3D scene; `BimCanvas` reads its
  callbacks through a ref, so inline callbacks from a host do not reload it.
- A save overtaken by a later one no longer overwrites its state.
- An invalid `?dir=` offers the folder picker at the fallback folder.
- Sensor cards start from the latest stored value instead of being blank
  until the next sample.

### Known gaps (recorded against the SDK)

- `ScopeContext` carries no element properties, so `bim.room` / `bim.storey`
  assume the `aec` substrate copies room and storey onto each element's
  `userData` from the property tree.
- `FieldKernel(samples, grid)` carries no geometry, so this package ships no
  `fieldKernels`; bim's flood fill needs wall geometry the kernel does not
  have.
