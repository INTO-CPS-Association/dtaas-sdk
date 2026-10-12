/**
 * Getting a model's geometry: a GLB loaded as it stands, or an IFC file
 * converted in the browser. The two produce the same shape of scene, so
 * nothing past this file knows which it got.
 */

import { LoadingManager, type Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import exportGlb from 'src/react/exportGlb';

export interface GeometryLoad {
  url: string;
  /** True when `url` names an IFC file instead of converted geometry. */
  convert: boolean;
  /** False once the canvas is gone, so nothing more is done for it. */
  running: () => boolean;
  onProgress: (text: string) => void;
  onLoaded: (model: Group, note?: string) => void;
  /** Told a fact about the file, never a library's own message. */
  onFailed: (message: string) => void;
  /** Handed the converted model as a GLB, before anything is added to it. */
  onConverted?: (glb: Uint8Array) => void;
}

async function fetchIfc(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) {
    throw new Error(`the file returned HTTP ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Store the geometry before the scene decorates the model, so the stored GLB
 * reloads as the same shape a GLB made outside the browser has. Best-effort:
 * a failed export leaves the drawing untouched, and the model simply
 * reconverts next time.
 */
async function storeConversion(model: Group, load: GeometryLoad) {
  if (!load.onConverted) return;
  try {
    const glb = await exportGlb(model);
    if (load.running()) load.onConverted(glb);
  } catch {
    // Persistence is an optimisation, not a requirement for drawing.
  }
}

/**
 * Convert the IFC file in the browser. The converter's WebAssembly parser is
 * over a megabyte, so it is imported only here: someone who only ever opens
 * converted models never fetches it.
 */
async function convertModel(load: GeometryLoad) {
  const [{ convertIfc }, { meshesFrom }] = await Promise.all([
    import('src/converter'),
    import('src/react/ifcMeshes'),
  ]);
  const bytes = await fetchIfc(load.url);
  if (!load.running()) return;

  load.onProgress('Converting');
  const converted = await convertIfc(bytes, {
    onProgress: (done) => {
      if (load.running() && done % 250 === 0) {
        load.onProgress(`Converting, ${done} objects`);
      }
    },
  });
  const dropped =
    converted.failed === 0
      ? ''
      : ` ${converted.failed} could not be turned into geometry.`;
  const model = meshesFrom(converted);
  await storeConversion(model, load);
  const note = `Converted in the browser: ${converted.objects.length} objects.`;
  load.onLoaded(model, `${note}${dropped}`);
}

/**
 * An invalid data URI: the browser fails it at once, without a request, so
 * the loader reports a failed file instead of fetching the original address.
 */
export const BLOCKED_URL = 'data:blocked';

/**
 * A GLB may name its buffers and images by URL, and a file in a shared
 * library is not trusted. Only `data:` and `blob:` URIs and URLs on the
 * page's origin or the model's own origin are fetched, so a crafted file
 * cannot make the viewer call another host.
 */
export function restrictUrls(modelUrl: string): (url: string) => string {
  const base = globalThis.location.href;
  const allowed = [globalThis.location.origin, new URL(modelUrl, base).origin];
  return (url) => {
    try {
      const target = new URL(url, base);
      const local = ['data:', 'blob:'].includes(target.protocol);
      return local || allowed.includes(target.origin) ? url : BLOCKED_URL;
    } catch {
      return BLOCKED_URL;
    }
  };
}

function loadGlb(load: GeometryLoad): Promise<void> {
  const manager = new LoadingManager();
  manager.setURLModifier(restrictUrls(load.url));
  return new Promise((resolve) => {
    new GLTFLoader(manager).load(
      load.url,
      (gltf) => resolve(load.onLoaded(gltf.scene)),
      undefined,
      () =>
        resolve(
          load.onFailed(
            'The geometry could not be read. It may be incomplete.',
          ),
        ),
    );
  });
}

/** Load the geometry `load` names. Settles once it is shown or has failed. */
export async function loadGeometry(load: GeometryLoad): Promise<void> {
  if (!load.convert) return loadGlb(load);
  load.onProgress('Reading the IFC file');
  return convertModel(load).catch((error: Error) =>
    load.onFailed(`This model could not be converted. ${error.message}`),
  );
}

export default loadGeometry;
