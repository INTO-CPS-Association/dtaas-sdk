/**
 * Tests for reading the manifest beside a model: it is checked against the
 * schema before any binding reaches the viewer.
 */

import { renderHook, waitFor } from '@testing-library/react';
import type { BimModel } from 'src/react/assets';
import { useModelFiles } from 'src/react/useModelFiles';
import { MANIFEST, respond } from 'tests/unit/react/buildingModels.support';

const MODEL: BimModel = {
  name: 'office-b',
  title: 'Office B',
  ifcPath: 'models/office-b.ifc',
  manifestPath: 'models/office-b.manifest.json',
};

const original = globalThis.fetch;

function serve(manifest: unknown) {
  globalThis.fetch = async () =>
    respond(JSON.stringify(manifest), {
      type: 'application/json',
    });
}

afterEach(() => {
  globalThis.fetch = original;
});

test('a manifest that breaks the schema is reported, and binds nothing', async () => {
  const [binding] = MANIFEST.bindings;
  serve({ ...MANIFEST, bindings: [{ ...binding, display: { unit: '°C' } }] });

  const { result } = renderHook(() =>
    useModelFiles('https://host/user', MODEL),
  );

  await waitFor(() => expect(result.current.problem).not.toBeNull());
  expect(result.current.problem?.summary).toBe(
    'The sensor manifest is not valid.',
  );
  expect(result.current.problem?.detail).toContain('bindings[0].display.ramp');
  expect(result.current.bindings).toEqual([]);
});

test('a valid manifest keeps the fields the schema does not list', async () => {
  const [binding] = MANIFEST.bindings;
  serve({ ...MANIFEST, bindings: [{ ...binding, id: 'TS-01' }] });

  const { result } = renderHook(() =>
    useModelFiles('https://host/user', MODEL),
  );

  await waitFor(() => expect(result.current.bindings).toHaveLength(1));
  expect(result.current.bindings[0].id).toBe('TS-01');
  expect(result.current.problem).toBeNull();
});
