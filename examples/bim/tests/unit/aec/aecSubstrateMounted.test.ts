import { fakeHostServices } from '@into-cps-association/dtaas-sdk/testing';
import createAecSubstrate from 'src/aec/aecSubstrate';

// The scene draws with WebGL, which jsdom lacks, so these tests replace it
// and its controls with stand-ins that record what the substrate asks of
// them. The scene's own drawing is tested in aecScene.test.ts.
const mockMarkers = new Map<string, Record<string, unknown>>();
const mockScene = {
  load: jest.fn(async () => undefined),
  dispose: jest.fn(),
  invalidate: jest.fn(),
  meshes: new Map([['guid-1', [{ name: 'wall' }]]]),
  markers: {
    all: mockMarkers,
    add: jest.fn((key: string, _object: unknown, name: string) => {
      mockMarkers.set(key, {
        name,
        dot: { visible: true, position: { x: 1 } },
        label: { visible: true },
      });
    }),
    relabel: jest.fn(),
  },
  controls: { target: { copy: jest.fn() } },
  objectAt: jest.fn(() => 'object'),
  markerOn: jest.fn((): string | null => 'a/b'),
};
const mockControls = {
  colour: jest.fn(),
  reportMissing: jest.fn(),
  dispose: jest.fn(),
};

jest.mock('src/aec/aecScene', () => ({
  AecScene: jest.fn(() => mockScene),
}));
jest.mock('src/aec/aecControls', () => ({
  addControls: jest.fn(() => mockControls),
}));

const ANCHOR = { signalPath: 'a/b', kind: 'ifc-guid', ref: 'guid-1' };
const encoding = (properties: Record<string, unknown>) =>
  ({ encoding: { id: 'e' }, properties }) as never;

async function mounted() {
  const host = fakeHostServices();
  const adapter = createAecSubstrate(host);
  const container = document.createElement('div');
  await adapter.mount(container, { adapter: 'aec', source: 'room.ifc' });
  return { adapter, container };
}

describe('a mounted aec substrate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMarkers.clear();
  });

  it('draws the converted model of the source in the container', async () => {
    const { container } = await mounted();
    expect(mockScene.load).toHaveBeenCalledWith(
      expect.stringContaining('room.glb'),
    );
    expect(container.querySelector('[aria-label="Building model"]')).not.toBe(
      null,
    );
  });

  it('puts a marker on the object an anchor names', async () => {
    const { adapter } = await mounted();
    expect(adapter.resolve(ANCHOR)).toEqual({ substrate: 'aec', id: 'a/b' });
    expect(mockScene.markers.add).toHaveBeenCalledWith(
      'a/b',
      { name: 'wall' },
      'a/b',
    );
  });

  it('reports an anchor whose object is not in the model', async () => {
    const { adapter } = await mounted();
    const missing = { ...ANCHOR, ref: 'guid-9', label: 'Seat 1' };
    expect(adapter.resolve(missing)).toBeNull();
    expect(mockControls.reportMissing).toHaveBeenCalledWith('Seat 1');
    expect(adapter.resolve({ ...ANCHOR, kind: 'image-xy' })).toBeNull();
  });

  it('paints colour, text and visibility on a marker', async () => {
    const { adapter } = await mounted();
    const target = adapter.resolve(ANCHOR)!;
    adapter.apply(target, encoding({ fill: '#ff0000', text: '21 °C' }));
    expect(mockControls.colour).toHaveBeenCalledWith(
      'a/b',
      { id: 'e' },
      '#ff0000',
    );
    expect(mockScene.markers.relabel).toHaveBeenCalledWith(
      mockMarkers.get('a/b'),
      'a/b 21 °C',
    );
    adapter.apply(target, encoding({ visible: false }));
    expect(mockMarkers.get('a/b')).toMatchObject({
      dot: { visible: false },
      label: { visible: false },
    });
    expect(mockScene.invalidate).toHaveBeenCalledTimes(2);
  });

  it('ignores an encoding for a marker it does not have', async () => {
    const { adapter } = await mounted();
    adapter.apply({ substrate: 'aec', id: 'x/y' }, encoding({ fill: 'red' }));
    adapter.frame({ substrate: 'aec', id: 'x/y' });
    expect(mockControls.colour).not.toHaveBeenCalled();
    expect(mockScene.invalidate).not.toHaveBeenCalled();
  });

  it('frames a marker and picks the marker under a point', async () => {
    const { adapter } = await mounted();
    const target = adapter.resolve(ANCHOR)!;
    adapter.frame(target);
    expect(mockScene.controls.target.copy).toHaveBeenCalledWith({ x: 1 });
    expect(adapter.pick(3, 4)).toEqual({ substrate: 'aec', id: 'a/b' });
    mockScene.markerOn.mockReturnValueOnce(null);
    expect(adapter.pick(3, 4)).toBeNull();
    adapter.setTime(0);
  });

  it('gives back the scene and the controls when disposed', async () => {
    const { adapter, container } = await mounted();
    adapter.dispose();
    expect(mockControls.dispose).toHaveBeenCalled();
    expect(mockScene.dispose).toHaveBeenCalled();
    expect(container.children).toHaveLength(0);
  });

  it('says what to do when the converted model cannot be loaded', async () => {
    mockScene.load.mockRejectedValueOnce(new Error('internal address'));
    await expect(mounted()).rejects.toThrow(
      'Open the model once on the Buildings page',
    );
    expect(mockScene.dispose).toHaveBeenCalled();
  });
});
