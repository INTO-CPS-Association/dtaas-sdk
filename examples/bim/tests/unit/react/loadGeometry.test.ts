/**
 * Tests for how the canvas gets its geometry: converted in the browser from an
 * IFC file, or loaded from a GLB beside it.
 *
 * The converter, the mesh builder, the exporter and three's loader are all
 * replaced, so what is tested is the path between them: what is reported
 * along the way, what is stored, and what a failure says.
 */

import { Group } from 'three';
import { convertIfc } from 'src/converter';
import { meshesFrom } from 'src/react/ifcMeshes';
import exportGlb from 'src/react/exportGlb';
import type { LoadingManager } from 'three';
import {
  BLOCKED_URL,
  loadGeometry,
  restrictUrls,
  type GeometryLoad,
} from 'src/react/loadGeometry';

jest.mock('src/converter', () => ({ convertIfc: jest.fn() }));
jest.mock('src/react/ifcMeshes', () => ({ meshesFrom: jest.fn() }));
jest.mock('src/react/exportGlb', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockGltf = {
  scene: new Group(),
  fail: false,
  manager: undefined as LoadingManager | undefined,
};
jest.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class {
    constructor(manager?: LoadingManager) {
      mockGltf.manager = manager;
    }

    load(
      _url: string,
      onLoad: (loaded: { scene: Group }) => void,
      _onProgress: unknown,
      onError: (error: unknown) => void,
    ) {
      if (mockGltf.fail) onError(new Error('truncated'));
      else onLoad({ scene: mockGltf.scene });
    }
  },
}));

const model = new Group();
const GLB = new Uint8Array([7, 8, 9]);

function load(overrides: Partial<GeometryLoad> = {}) {
  const calls = {
    progress: [] as string[],
    loaded: [] as Array<{ model: unknown; note?: string }>,
    failed: [] as string[],
    converted: [] as Uint8Array[],
  };
  const done = loadGeometry({
    url: 'http://host/jane/files/common/models/a.ifc',
    convert: true,
    running: () => true,
    onProgress: (text) => calls.progress.push(text),
    onLoaded: (loaded, note) => calls.loaded.push({ model: loaded, note }),
    onFailed: (message) => calls.failed.push(message),
    onConverted: (glb) => calls.converted.push(glb),
    ...overrides,
  });
  return { calls, done };
}

function serve(status: number) {
  globalThis.fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => new ArrayBuffer(4),
  })) as unknown as typeof fetch;
}

beforeEach(() => {
  serve(200);
  mockGltf.fail = false;
  jest.mocked(convertIfc).mockImplementation(async (_bytes, options) => {
    options?.onProgress?.(250);
    options?.onProgress?.(251);
    return { schema: 'IFC4', objects: [{}, {}] as never, failed: 1 };
  });
  jest.mocked(meshesFrom).mockReturnValue(model);
  jest.mocked(exportGlb).mockResolvedValue(GLB);
});

test('a conversion reports its progress and shows the model it built', async () => {
  const { calls, done } = load();
  await done;

  expect(calls.progress).toEqual([
    'Reading the IFC file',
    'Converting',
    'Converting, 250 objects',
  ]);
  expect(calls.loaded).toEqual([
    {
      model,
      note: 'Converted in the browser: 2 objects. 1 could not be turned into geometry.',
    },
  ]);
});

test('a conversion hands over the exported bytes before the model is decorated', async () => {
  const { calls, done } = load();
  await done;

  expect(exportGlb).toHaveBeenCalledWith(model);
  expect(calls.converted).toEqual([GLB]);
});

test('a failed export still shows the model', async () => {
  jest.mocked(exportGlb).mockRejectedValue(new Error('no FileReader'));
  const { calls, done } = load();
  await done;

  expect(calls.converted).toEqual([]);
  expect(calls.loaded).toHaveLength(1);
});

test('nothing is exported for a host that stores nothing', async () => {
  const { calls, done } = load({ onConverted: undefined });
  await done;

  expect(exportGlb).not.toHaveBeenCalled();
  expect(calls.loaded).toHaveLength(1);
});

test('a file the server refuses says the model could not be converted', async () => {
  serve(404);
  const { calls, done } = load();
  await done;

  expect(calls.failed).toEqual([
    'This model could not be converted. the file returned HTTP 404',
  ]);
  expect(calls.loaded).toEqual([]);
});

test('a canvas gone before the file arrives converts nothing', async () => {
  const { calls, done } = load({ running: () => false });
  await done;

  expect(convertIfc).not.toHaveBeenCalled();
  expect(calls.progress).toEqual(['Reading the IFC file']);
});

test('a GLB is loaded as it stands', async () => {
  const { calls, done } = load({ convert: false });
  await done;

  expect(calls.loaded).toEqual([{ model: mockGltf.scene, note: undefined }]);
  expect(convertIfc).not.toHaveBeenCalled();
});

test('a GLB that cannot be read says so', async () => {
  mockGltf.fail = true;
  const { calls, done } = load({ convert: false });
  await done;

  expect(calls.failed).toEqual([
    'The geometry could not be read. It may be incomplete.',
  ]);
});

test('a GLB may only fetch data, blob and same-origin addresses', async () => {
  const { done } = load({ convert: false });
  await done;
  const resolve = (url: string) => mockGltf.manager?.resolveURL(url);

  expect(resolve('https://evil.example/steal.bin')).toBe(BLOCKED_URL);
  expect(resolve('http://host/jane/files/common/models/a.bin')).toBe(
    'http://host/jane/files/common/models/a.bin',
  );
});

test('the URL check passes local and same-origin addresses only', () => {
  const allow = restrictUrls('http://library.test/jane/files/a.glb');
  const page = `${globalThis.location.origin}/textures/wall.png`;

  expect(allow('data:application/octet-stream;base64,AAAA')).toBe(
    'data:application/octet-stream;base64,AAAA',
  );
  expect(allow('blob:http://elsewhere.test/1234')).toBe(
    'blob:http://elsewhere.test/1234',
  );
  expect(allow('a.bin')).toBe('a.bin');
  expect(allow(page)).toBe(page);
  expect(allow('http://library.test/jane/files/a.bin')).toBe(
    'http://library.test/jane/files/a.bin',
  );
  expect(allow('https://library.test/jane/files/a.bin')).toBe(BLOCKED_URL);
  expect(allow('//evil.example/a.bin')).toBe(BLOCKED_URL);
  expect(allow('http://[bad')).toBe(BLOCKED_URL);
});
