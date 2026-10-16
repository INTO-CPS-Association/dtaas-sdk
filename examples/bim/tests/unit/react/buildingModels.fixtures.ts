/**
 * The fixtures the BuildingModels tests share: the start of real IFC files,
 * a manifest, and a small scene.
 *
 * The IFC statements are the ones in the real models, as in ifcName.test.ts.
 */

import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import { SceneView } from 'src/viewer';
import type { LibraryEntry } from 'src/react/assets';

export const PAEDAGOGISK = `DATA;
#1= IFCPROJECT('15LR9Aj8fA4eCrdnAwudiM',#18,'34372',$,$,'P\\X\\E6dagogisk Center','Udbudsprojekt',(#22),#306726);`;
export const TEMPLATE = `DATA;
#1= IFCPROJECT('0FHQg$qdvEPQB6VPH27kii',#18,'Project Number',$,$,'Project Name','Project Status',(#22),#167926);`;
export const SUBSTATION = `DATA;
#1= IFCPROJECT('0b5j3C6_v5kA2vi1RMUzh5',$,'SWiM district cooling substation',$,$,$,$,(#10),#5);`;

export const LIBRARY = 'http://host/jane/';
export const DIRECTORY = 'common/models';

/** An IFC entry as the contents API lists it. */
export const ifc = (name: string, size = 1000): LibraryEntry => ({
  name,
  path: `${DIRECTORY}/${name}`,
  size,
});

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

/** A promise a test settles itself. */
export function deferred<T = void>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (error: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const MANIFEST = {
  model: {
    source: 'Building_1912_AK_v4.ifc',
    source_sha256: 'unknown',
    converter: 'test',
  },
  bindings: [
    {
      selector: { globalId: '2O2Fr$t4X7Zf8NOew3FLOH' },
      label: 'Wall temperature',
      source: { live: { transport: 'mqtt', topic: 'swim/b/w1' } },
      display: { unit: '°C', ramp: [4, 16] },
    },
  ],
};

/** Two floors, a wall and a slab on each, as the scene view tests build them. */
export function building(): SceneView {
  const model = new Group();
  const box = (globalId: string, ifcClass: string, y: number) => {
    const mesh = new Mesh(new BoxGeometry(1, 3, 1), new MeshStandardMaterial());
    mesh.position.set(0, y + 1.5, 0);
    mesh.userData.globalId = globalId;
    mesh.userData.ifcClass = ifcClass;
    return mesh;
  };
  model.add(box('w1', 'IfcWall', 0), box('s1', 'IfcSlab', 3));
  model.add(box('w2', 'IfcWall', 3.3), box('s2', 'IfcSlab', 6.3));
  model.updateMatrixWorld(true);
  return new SceneView(model, {
    storeys: [{ name: 'L1' }, { name: 'L2' }],
    objects: {
      w1: { ifcClass: 'IfcWall', storey: 'L1' },
      s1: { ifcClass: 'IfcSlab', storey: 'L1' },
      w2: { ifcClass: 'IfcWall', storey: 'L2' },
      s2: { ifcClass: 'IfcSlab', storey: 'L2' },
    },
  });
}
