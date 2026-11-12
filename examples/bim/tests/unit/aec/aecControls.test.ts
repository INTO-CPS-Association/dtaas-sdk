import { addControls, recolour } from 'src/aec/aecControls';
import { MarkerColours } from 'src/aec/aecColours';
import { initialState } from 'src/aec/aecAppearance';
import { mountOverlay } from 'src/aec/aecOverlay';
import type { AecScene } from 'src/aec/aecScene';

// The overlay is React drawn into the pane, tested in aecOverlay.test.tsx.
// Here it is replaced, so the test can read the model the controls give it.
const mockUnmount = jest.fn();
jest.mock('src/aec/aecOverlay', () => ({
  changes: () => ({ bump: jest.fn(), subscribe: jest.fn(), version: 0 }),
  mountOverlay: jest.fn(() => mockUnmount),
}));

type Model = {
  bump: jest.Mock;
  ui: { helpOpen: boolean; missing: string[] };
  context: {
    toggleHelp(): void;
    reset(): void;
    look(from: string): void;
    toggleFullscreen(): void;
  };
  showFloor(storey: string | null): void;
  pickClass(ifcClass: string): void;
  closeHelp(): void;
  picked(): unknown;
  classes(): unknown;
};

function fakeScene() {
  const set = jest.fn();
  const state = initialState();
  const view = {
    markers: {
      all: new Map([
        ['a/b', { name: 'Seat 1', dot: { material: { color: { set } } } }],
      ]),
    },
    appearance: {
      state,
      hidden: [] as string[],
      reset: jest.fn(),
      classes: jest.fn(() => [{ ifcClass: 'IfcWall' }]),
    },
    renderer: { domElement: document.createElement('canvas') },
    tree: {},
    invalidate: jest.fn(),
    refresh: jest.fn(),
    look: jest.fn(),
    objectAt: jest.fn((): string | null => 'guid-1'),
    markerOn: jest.fn((): string | null => 'a/b'),
    factsOf: jest.fn(() => ({ Name: 'Wall' })),
    sizeOf: jest.fn(() => ({ x: 1, y: 2, z: 3 })),
  };
  return { view, set, state };
}

function setUp() {
  const scene = fakeScene();
  const rows = {
    frame: document.createElement('div'),
    above: document.createElement('div'),
    below: document.createElement('div'),
  };
  const controls = addControls(scene.view as unknown as AecScene, rows);
  const model = (mountOverlay as jest.Mock).mock.lastCall[2] as Model;
  return { ...scene, rows, controls, model };
}

describe('the controls of the aec substrate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('paints markers without a reading in the no-reading colour', () => {
    const { view, set } = fakeScene();
    recolour(view as unknown as AecScene, new MarkerColours());
    expect(set).toHaveBeenCalledTimes(1);
    expect(view.invalidate).toHaveBeenCalled();
  });

  it('draws once on start and runs an option from its key', () => {
    const { view, rows } = setUp();
    expect(view.refresh).toHaveBeenCalledTimes(1);
    const press = new KeyboardEvent('keydown', { key: '1', cancelable: true });
    rows.frame.dispatchEvent(press);
    expect(view.look).toHaveBeenCalledWith('top');
    expect(press.defaultPrevented).toBe(true);
    const other = new KeyboardEvent('keydown', { key: 'z', cancelable: true });
    rows.frame.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('follows the pointer and selects the object clicked', () => {
    const { view, state } = setUp();
    const canvas = view.renderer.domElement;
    canvas.dispatchEvent(new MouseEvent('pointermove'));
    expect(state.hovered).toBe('guid-1');
    canvas.dispatchEvent(new MouseEvent('pointermove'));
    expect(view.refresh).toHaveBeenCalledTimes(2);
    canvas.dispatchEvent(new MouseEvent('click'));
    expect(state.selected).toBe('guid-1');
  });

  it('gives a marker its colour and redraws the legend for a new rule', () => {
    const { controls, model, set } = setUp();
    const encoding = { id: 'temp', quantity: 'temperature' } as never;
    controls.colour('a/b', encoding, '#ff0000');
    expect(set).toHaveBeenLastCalledWith(expect.anything());
    expect(model.bump).toHaveBeenCalled();
  });

  it('names each sensor without an object once', () => {
    const { controls, model } = setUp();
    model.bump.mockClear(); // the first draw bumps once
    controls.reportMissing('Seat 2');
    controls.reportMissing('Seat 2');
    expect(model.ui.missing).toEqual(['Seat 2']);
    expect(model.bump).toHaveBeenCalledTimes(1);
  });

  it('describes the picked object and the sensor on it', () => {
    const { model, state, view } = setUp();
    expect(model.picked()).toBeNull();
    state.selected = 'guid-1';
    expect(model.picked()).toEqual({
      globalId: 'guid-1',
      facts: { Name: 'Wall' },
      size: { x: 1, y: 2, z: 3 },
      sensor: { name: 'Seat 1', signal: 'a/b' },
    });
    view.markerOn.mockReturnValueOnce(null);
    expect(model.picked()).toMatchObject({ sensor: undefined });
    expect(model.classes()).toEqual([{ ifcClass: 'IfcWall' }]);
  });

  it('changes the floor, the lit class and the help from the overlay', () => {
    const { model, state } = setUp();
    model.showFloor('Level 1');
    expect(state.storey).toBe('Level 1');
    model.pickClass('IfcWall');
    expect(state.highlightedClass).toBe('IfcWall');
    model.pickClass('IfcWall');
    expect(state.highlightedClass).toBeNull();
    model.context.toggleHelp();
    expect(model.ui.helpOpen).toBe(true);
    model.closeHelp();
    expect(model.ui.helpOpen).toBe(false);
  });

  it('resets the model and looks at it from above', () => {
    const { model, view } = setUp();
    model.context.reset();
    expect(view.appearance.reset).toHaveBeenCalled();
    expect(view.look).toHaveBeenCalledWith('top');
  });

  it('asks for fullscreen and leaves it again', async () => {
    const { model } = setUp();
    const request = jest.fn(async () => undefined);
    const exit = jest.fn(async () => undefined);
    document.documentElement.requestFullscreen = request;
    document.exitFullscreen = exit;
    model.context.toggleFullscreen();
    expect(request).toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.documentElement,
    });
    model.context.toggleFullscreen();
    expect(exit).toHaveBeenCalled();
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: null,
    });
  });

  it('takes the overlay away when disposed', () => {
    const { controls } = setUp();
    controls.dispose();
    expect(mockUnmount).toHaveBeenCalled();
  });
});
