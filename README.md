# 🧩 DTaaS SDK

`@into-cps-association/dtaas-sdk` is the contract between the
[DTaaS](https://github.com/INTO-CPS-Association/DTaaS) web client (the
**host**), the common visualisation core (`dtaas-visualisation`) and **domain
extensions** (`bim-kit`, `wind-kit`, `pump-kit`, …).

A domain extension is an ordinary npm package. It declares what it
contributes (pages, navigation, digital twin tabs, asset previews, anchor
kinds, converters, encoding presets, substrates) as one `DtaasExtension`
object, and receives everything it needs from the host through an injected
`HostServices` object. It never imports DTaaS internals and never opens its
own sockets.

The design is described in
[`docs/dtaas-client-modular-architecture.md`](docs/dtaas-client-modular-architecture.md).

## 📦 Install

```bash
yarn add @into-cps-association/dtaas-sdk
```

Peer dependencies: `react >=19` and `zod ^4`. The `./testing` subpath also
needs `@testing-library/react` and `react-router-dom`; the `./eslint` subpath
needs `eslint >=9`.

The package is ESM only.

## 🚪 Entry points

| Import                                    | What it gives you                                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@into-cps-association/dtaas-sdk`         | Contract types, `HostProvider` / `useHost`, `defineExtension`, `validateExtension`, env config helpers, constants |
| `@into-cps-association/dtaas-sdk/schema`  | zod schemas for `visualisation.json`, encodings, anchors, transports, substrates and presets                      |
| `@into-cps-association/dtaas-sdk/testing` | `fakeHostServices`, `renderWithHost`, `replayFixture`, `checkConformance`                                         |
| `@into-cps-association/dtaas-sdk/eslint`  | Flat-config rules that keep an extension inside its boundary                                                      |

The host bundles only the root entry.

## 🚀 A minimal extension

```tsx
// src/dtaas/index.ts
import { lazy } from 'react';
import { defineExtension } from '@into-cps-association/dtaas-sdk';

export const extension = defineExtension({
  id: 'wind',
  name: 'Wind Farms',
  version: '0.1.0',
  sdk: 1,
  routes: [{ path: '', element: lazy(() => import('./pages/WindPage')) }],
  navigation: [{ label: 'Wind Farms', path: '/wind' }],
});
```

```tsx
// src/dtaas/pages/WindPage.tsx
import { useHost } from '@into-cps-association/dtaas-sdk';

export default function WindPage() {
  const host = useHost();
  const t = host.signals.playhead.use();
  const power = host.signals.valueAt('farm1/wt1/power', 'measured', t);
  return (
    <host.ui.Page title="Wind Farms">
      <p>Turbine 1: {String(power?.value ?? 'no reading')}</p>
    </host.ui.Page>
  );
}
```

```ts
// tests/unit/extension.test.ts
import { checkConformance } from '@into-cps-association/dtaas-sdk/testing';
import { extension } from '../../src/dtaas';

it('satisfies the DTaaS extension contract', async () => {
  expect(await checkConformance(extension)).toEqual({
    passed: true,
    errors: [],
  });
});
```

[`examples/hello-kit`](examples/hello-kit) is a complete, tested example.

[`examples/bim`](examples/bim/README.md) is a larger, standalone example: a
full port of bim-kit 0.1.1 onto the SDK, with its own package, build, test
suite and CI job.

## 🔢 Versions

The npm version (`0.1.0`) and the contract revision are separate. Every
extension declares `sdk: 1`, the revision of the `DtaasExtension` /
`HostServices` contract it was built against (`SDK_MAJOR`). The host refuses
extensions built for another revision.

## 📚 Documentation

- [Writing an extension](docs/extension-authoring.md)
- [Integrating the SDK into a host](docs/host-integration.md)
- [The `visualisation.json` schema](docs/visualisation-schema.md)
- [Testing an extension](docs/testing.md)
- [Developing this package](DEVELOPER.md)
- [Changelog](CHANGELOG.md)

## ⚖️ License

This package is distributed under the INTO-CPS Association Public License.
See [LICENSE.md](LICENSE.md).
