# The `visualisation.json` schema

A visualisation is a library asset (R7): a JSON document committed beside a
twin's models and functions, reviewed as a merge request, and reused by
swapping its substrates and anchors. `@into-cps-association/dtaas-sdk/schema`
validates it.

```ts
import { parseVisualisationAsset } from '@into-cps-association/dtaas-sdk/schema';

const result = parseVisualisationAsset(json);
if (result.success) render(result.data);
else console.warn(result.error.issues);
```

## Document

| Field           | Type                            | Notes                                                                      |
| --------------- | ------------------------------- | -------------------------------------------------------------------------- |
| `schemaVersion` | `"1.x"`                         | Only major version 1 is accepted                                           |
| `name`          | string                          |                                                                            |
| `description`   | string?                         |                                                                            |
| `domain`        | string?                         | e.g. `bim`, `wind`                                                         |
| `layout`        | `{ type, panes }`               | `type` is `single`, `split`, `grid` or `tabs`; each pane names a substrate |
| `substrates`    | record of substrate descriptors | keyed by pane id                                                           |
| `transports`    | transport[]                     | defaults to `[]`                                                           |
| `anchors`       | anchor[]                        | defaults to `[]`                                                           |
| `encodings`     | binding[]                       | defaults to `[]`                                                           |
| `presets`       | preset[]?                       | presets local to this asset                                                |

### Cross-references

The schema rejects:

- a layout pane that is not a key of `substrates`;
- a binding whose `substrate` is not a key of `substrates`;
- an anchor whose `homographyId` is not the `id` of a substrate's calibration;
- a binding with both, or neither, of `encoding` and `preset`.

## Substrate descriptor

| Field           | Type                                                              |
| --------------- | ----------------------------------------------------------------- |
| `adapter`       | substrate id, e.g. `image`                                        |
| `source`        | URL (`lib://`, `git://`, `http://`, `https://`, `blob:`) or path? |
| `calibration`   | homography?                                                       |
| `latencyHintMs` | number?                                                           |
| `timeParams`    | `[string, string]`?                                               |
| `independent`   | boolean?                                                          |
| `options`       | adapter-specific record?                                          |

- `calibration` is a homography: `{ type: 'homography', id, imagePoints,
worldPoints, units?, reprojectionError? }` with at least four point pairs
  and equal-length lists.
- `latencyHintMs` declares a video feed's skew (R11).
- `timeParams` names the URL parameters an `embed` substrate receives from the
  playhead, e.g. `["from", "to"]` for Grafana.
- `independent: true` marks a pane that cannot follow the playhead.
- `source` is refused when its scheme is not in the list above, so `javascript:`, `data:`, `vbscript:` and `file:` are refused. Schemes are compared the way a browser parses them, so `JavaScript:` or `java\tscript:` are refused too. A path without a scheme is resolved by the host against the twin, and a path that names another host, such as `//evil.example/a.jpg`, is refused.

## Transports

Discriminated on `adapter`:

| `adapter`     | Required fields         | Optional                                       | `url` schemes                              |
| ------------- | ----------------------- | ---------------------------------------------- | ------------------------------------------ |
| `mqtt`        | `topics[]`              | `url`, `channel`, `qos`                        | `ws`, `wss`, `mqtt`, `mqtts`               |
| `stomp`       | `url`, `destinations[]` | `channel`                                      | `ws`, `wss`, `mqtt`, `mqtts`               |
| `thingsboard` | `url`, `entityIds[]`    | `keys[]`, `channel`                            | `http`, `https`, `ws`, `wss`               |
| `influx`      | `org`, `bucket`         | `url`, `measurement`, `role: "history"`        | `http`, `https`                            |
| `http`        | `url`                   | `method`, `intervalMs`, `channel`              | `http`, `https`                            |
| `file`        | `url`                   | `format` (`csv`, `parquet`, `json`), `channel` | `http`, `https`, `lib`, or a relative path |

`channel` is one of `measured`, `simulated`, `predicted`, `setpoint`.

A `url` with any other scheme is refused, including `javascript:`, `data:`, `vbscript:` and `file:`. Only the `file` transport takes a path without a scheme, which the host resolves in the library, and a path that names another host is refused.

The `url` of an `mqtt` transport is optional. A host with a signals gateway serves the topics itself, so a declaration can name the topics it reads and leave the broker to the host. A `url` that is given is still checked against the schemes above. The DTaaS client never opens it: its signals gateway serves the topics and ignores the `url`.

## Anchors

`{ signalPath, kind, ref, label?, homographyId? }`. `kind` is a standard kind
(`ifc-guid`, `gltf-node`, `usd-prim`, `instance-id`, `geo`, `image-point`,
`image-region`, `image-plane`, `video-panel`, `tb-entity`) or a domain kind
contributed by a kit.

## Encodings

A binding is `{ target, substrate, encoding }` or `{ target, substrate, preset }`.
The encoding vocabulary, discriminated on `type`:

| `type`         | Fields                                                                 |
| -------------- | ---------------------------------------------------------------------- |
| `colorScale`   | `domain`, `scheme`, `channel?`, `clamp?`                               |
| `visibility`   | `when: { op, value }`                                                  |
| `transform`    | `property` (`translate`, `rotate`, `scale`), `axis`, `domain`, `range` |
| `flow`         | `speedDomain`, `direction?`                                            |
| `residual`     | `against` (channel), `domain`, `scheme?`                               |
| `ghost`        | `channel`, `opacity?` (0–1)                                            |
| `label`        | `format?`, `unit?`, `precision?`                                       |
| `attention`    | `when: { op, value }`, `priority?`                                     |
| `glyph`        | `shape`, `sizeDomain?`, `scheme?`                                      |
| `regionFill`   | `domain`, `scheme`                                                     |
| `fieldOverlay` | `kernel`, `domain`, `scheme`, `resolution?`                            |
| `trajectory`   | `windowMs`, `scheme?`                                                  |

`domain` and `range` are `[min, max]`. `op` is one of `<`, `<=`, `>`, `>=`,
`==`, `!=`.

## Presets

`{ id, label, description?, substrate, encodings: [{ target, encoding }] }`.
`id` is lowercase and dot-namespaced, e.g. `bim.thermal-comfort`; `target` is
a signal-path pattern such as `building/*/temperature`.

## Limits

Every string in the asset, including each URL, is at most 2048 characters, and every list (`layout.panes`, `transports`, `anchors`, `encodings`, `presets`, topics, destinations, entity ids, keys, homography points and the encodings of a preset) holds at most 1000 items. An asset over a limit is refused, so an oversized file in a library cannot stall the host that parses and renders it. The `substrates` record and a substrate's `options` have no item limit.

## Example

[`tests/fixtures/junction7.visualisation.json`](../tests/fixtures/junction7.visualisation.json)
is the three-substrate example of the visualisation report: a calibrated
photograph, a camera feed and a Grafana panel, fed by MQTT, InfluxDB and a
simulation output file.
