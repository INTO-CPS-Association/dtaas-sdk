import { Markers } from 'src/aec/aecMarkers';

// three ships as an ES module jest cannot load, and jsdom has no 2D canvas,
// so both are replaced by parts that keep the positions and sizes the
// markers set. That is what these tests check.
type Point = { x: number; y: number; z: number };

function mockPosition() {
  const p = {
    x: 0,
    y: 0,
    z: 0,
    copy(other: Point) {
      Object.assign(p, { x: other.x, y: other.y, z: other.z });
      return p;
    },
    add(other: Point) {
      Object.assign(p, {
        x: p.x + other.x,
        y: p.y + other.y,
        z: p.z + other.z,
      });
      return p;
    },
  };
  return p;
}

let mockCentre: Point = { x: 0, y: 0, z: 0 };

jest.mock('three', () => {
  const part = () => ({
    position: mockPosition(),
    scale: { set: jest.fn() },
    visible: true,
  });
  return {
    Box3: jest.fn(() => ({
      setFromObject: () => ({ getCenter: () => mockCentre }),
    })),
    Vector3: jest.fn((x = 0, y = 0, z = 0) => ({ x, y, z })),
    SphereGeometry: jest.fn(),
    MeshBasicMaterial: jest.fn(),
    CanvasTexture: jest.fn(() => ({ dispose: jest.fn() })),
    SpriteMaterial: jest.fn(() => ({ map: null, needsUpdate: false })),
    Mesh: jest.fn(part),
    Sprite: jest.fn((material: unknown) => ({ ...part(), material })),
  };
});

const context = {
  font: '',
  fillStyle: '',
  textBaseline: '',
  measureText: (text: string) => ({ width: text.length * 10 }),
  fillRect: jest.fn(),
  fillText: jest.fn(),
};

describe('the markers of the aec substrate', () => {
  const scene = { add: jest.fn() };
  const changed = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue(context as never);
    mockCentre = { x: 0, y: 0, z: 0 };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const object = { userData: { globalId: 'guid-1' } } as never;

  it('puts a dot and a written label on the centre of an object', () => {
    const markers = new Markers(scene as never, changed);
    const marker = markers.add('a/b', object, 'Seat 1');
    expect(marker.globalId).toBe('guid-1');
    expect(markers.all.get('a/b')).toBe(marker);
    expect(scene.add).toHaveBeenCalledWith(marker.dot, marker.label);
    expect(context.fillText).toHaveBeenCalledWith('Seat 1', 16, 34);
    expect(marker.label.position.z).toBeLessThan(0);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('moves a label below its dot when a neighbour has one above', () => {
    const markers = new Markers(scene as never, changed);
    markers.add('a/b', object, 'Seat 1');
    mockCentre = { x: 0.01, y: 0, z: 0 };
    const near = markers.add('a/c', object, 'Seat 2');
    expect(near.label.position.z).toBeGreaterThan(0);
    mockCentre = { x: 50, y: 0, z: 0 };
    const far = markers.add('a/d', object, 'Seat 3');
    expect(far.label.position.z).toBeLessThan(0);
  });

  it('rewrites a label and replaces its old texture', () => {
    const markers = new Markers(scene as never, changed);
    const marker = markers.add('a/b', object, 'Seat 1');
    const old = marker.label.material.map as unknown as { dispose: jest.Mock };
    markers.relabel(marker, 'Seat 1 21 °C');
    expect(old.dispose).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenLastCalledWith('Seat 1 21 °C', 16, 34);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('shows only the markers a floor holds', () => {
    const markers = new Markers(scene as never, changed);
    const kept = markers.add('a/b', object, 'Seat 1');
    const hidden = markers.add('a/c', object, 'Seat 2');
    markers.showOnly((marker) => marker === kept);
    expect([kept.dot.visible, kept.label.visible]).toEqual([true, true]);
    expect([hidden.dot.visible, hidden.label.visible]).toEqual([false, false]);
  });

  it('leaves a label blank when the browser gives no 2D canvas', () => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const markers = new Markers(scene as never, changed);
    markers.add('a/b', object, 'Seat 1');
    expect(context.fillText).not.toHaveBeenCalled();
  });
});
