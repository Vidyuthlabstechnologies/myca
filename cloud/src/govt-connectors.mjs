import { CONNECTOR_CHANNELS } from '../../platform/src/channel-connectors.mjs';

export const GOVT_CHANNELS = {
  quicko: { title: 'GST returns and GSTIN lookup (Sandbox by Quicko)', fields: ['apiKey', 'apiSecret', 'environment'], secrets: ['apiKey', 'apiSecret'], optional: ['environment'], kinds: [], govt: true },
  // The e-invoice / e-way bill API user, created on the IRP or e-way bill portal for the
  // GSP (Sandbox by Quicko). Calls go through Quicko: NIC direct access needs a turnover
  // of 100 crore rupees or more.
  nic: { title: 'E-invoice and e-way bill API user (through Sandbox by Quicko)', fields: ['username', 'password', 'gstin', 'environment'], secrets: ['password'], optional: ['environment'], kinds: [], govt: true },
};

export const HOSTED_CHANNELS = { ...CONNECTOR_CHANNELS, ...GOVT_CHANNELS };

export function modeOf(config) {
  return config?.environment === 'production' ? 'live' : 'test';
}
