import { CONNECTOR_CHANNELS } from '../../platform/src/channel-connectors.mjs';

export const GOVT_CHANNELS = {
  quicko: { title: 'GST returns and GSTIN lookup (Sandbox by Quicko)', fields: ['apiKey', 'apiSecret', 'environment'], secrets: ['apiKey', 'apiSecret'], optional: ['environment'], kinds: [], govt: true },
  nic: { title: 'E-invoice (NIC IRP)', fields: ['clientId', 'clientSecret', 'username', 'password', 'gstin', 'publicKeyPem', 'environment'], secrets: ['clientSecret', 'password'], optional: ['environment'], kinds: [], govt: true },
};

export const HOSTED_CHANNELS = { ...CONNECTOR_CHANNELS, ...GOVT_CHANNELS };

export function modeOf(config) {
  return config?.environment === 'production' ? 'live' : 'test';
}
