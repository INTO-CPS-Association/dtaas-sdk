# Changelog

All notable changes to this package are documented in this file. The format
is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
package adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-27

### Added

- Extension contract, revision 1: `DtaasExtension`, `DomainContribution` and
  every contribution type of the architecture proposal (§6.1).
- Host contract: `HostServices` with `auth`, `library`, `contents`, `git`,
  `signals`, `viz`, `ui`, `logger`, `settings` and `config` (§6.2);
  `HostProvider` and `useHost()`.
- Visualisation layer types: `SignalSample`, `Channel`, `TransportAdapter`,
  `Anchor`, `AnchorKind`, the encoding vocabulary, `SubstrateAdapter`.
- `defineExtension`, `isLazyComponent`, `isLazyLoader` and
  `validateExtension` (identity, laziness, uniqueness, navigation and
  substrate rules).
- Env helpers `readExtensionConfig`, `isExtensionDisabled` and `envPrefix`.
- `./schema`: zod schemas for `visualisation.json` with cross-reference
  checks, encodings, anchors, transports, substrates and presets.
- `./testing`: `fakeHostServices`, `renderWithHost`, `replayFixture`,
  `checkConformance` and a socket guard.
- `SignalsService.connection` (`ConnectionState`, `ConnectionStatus`) and
  `worstConnectionState`, so a kit can tell a quiet signal from a dead
  connection; fake `signals.setConnection(state, paths?)` for tests.
- `./eslint`: flat-config rules enforcing the extension boundary (§6.3).
- `examples/hello-kit`: the template layout of a domain kit.

### Security

- `validateExtension` rejects a navigation path whose path part has a `.` or
  `..` segment, a backslash, a control character, or a percent-encoded `.`,
  `/` or `\`, so a path cannot leave the extension's mount point once a
  browser resolves it. A path that needs an encoded slash inside a segment
  is rejected as well.
