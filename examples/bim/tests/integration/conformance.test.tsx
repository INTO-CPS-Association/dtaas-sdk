/**
 * Conformance tests for the bim extension itself: static validation, the
 * SDK's runtime harness, its `setup()` guard, and twin detection.
 */

import { validateExtension } from '@into-cps-association/dtaas-sdk';
import {
  checkConformance,
  fakeHostServices,
} from '@into-cps-association/dtaas-sdk/testing';
import extension from 'src/dtaas';

describe('the bim extension', () => {
  it('passes static validation', () => {
    expect(validateExtension(extension)).toEqual({ valid: true, errors: [] });
  });

  // The page pulls in three.js and the IFC wasm. With a cold jest cache the
  // first load takes longer than the harness default of 2 s, so the test
  // failed now and then on a first run without anything being wrong.
  it('passes the conformance harness and logs readiness', async () => {
    const host = fakeHostServices({ extensionId: 'bim' });
    const options = { host, timeoutMs: 10_000 };
    await expect(checkConformance(extension, options)).resolves.toEqual({
      passed: true,
      errors: [],
    });
    expect(host.recorded.logs).toContainEqual({
      level: 'info',
      args: ['bim ready'],
    });
  }, 15_000);

  it('fails conformance when the models directory is configured empty', async () => {
    const host = fakeHostServices({
      extensionId: 'bim',
      env: { REACT_APP_EXT_BIM_MODELS_DIRECTORY: '' },
    });
    const report = await checkConformance(extension, { host });

    expect(report.passed).toBe(false);
    expect(report.errors[0]).toMatch(
      /^setup\(\) failed: Invalid configuration for extension "bim"/,
    );
  });

  it('claims a twin with an IFC file among its files', async () => {
    const detect = extension.visualisation?.detect;
    const twin = { name: 'h', path: 'dt/h', files: ['h.ifc'] };

    expect(await detect?.(twin)).toBe(true);
  });
});
