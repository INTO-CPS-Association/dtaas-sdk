import { lazy } from 'react';
import ApartmentIcon from '@mui/icons-material/Apartment';
import {
  defineExtension,
  type LazySubstrateAdapterSpec,
} from '@into-cps-association/dtaas-sdk';
import anchorKinds from 'src/dtaas/anchors';
import configSchema from 'src/dtaas/config';
import converters from 'src/dtaas/converters';
import isBimTwin from 'src/dtaas/detect';
import { BIM_EXTENSION_ID, BIM_ROOT } from 'src/dtaas/ids';
import presets from 'src/dtaas/presets';
import scopes from 'src/dtaas/scopes';

const BuildingsPage = lazy(() => import('src/dtaas/pages/BuildingsPage'));

// The building model is building code, so this kit owns the aec substrate
// (#1912, section 10.2). It loads only when a visualisation draws a building.
export const AEC_SUBSTRATE: LazySubstrateAdapterSpec = {
  id: 'aec',
  supports: ['ifc-guid'],
  load: () => import('src/aec/aecSubstrate'),
};

/** The only object the host imports: `import { extension } from '<kit>/dtaas'`. */
export const extension = defineExtension({
  id: BIM_EXTENSION_ID,
  name: 'Buildings',
  version: '0.1.0',
  sdk: 1,
  routes: [
    { path: '', element: BuildingsPage },
    { path: 'models/:model', element: BuildingsPage },
  ],
  navigation: [
    { label: 'Buildings', path: BIM_ROOT, icon: ApartmentIcon, order: 20 },
  ],
  config: { schema: configSchema },
  setup: (host) => {
    host.config(configSchema);
    host.logger.info('bim ready');
  },
  visualisation: {
    detect: isBimTwin,
    anchorKinds,
    converters,
    presets,
    scopes,
    substrates: [AEC_SUBSTRATE],
  },
});

export default extension;
