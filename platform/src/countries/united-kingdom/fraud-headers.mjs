export const CONNECTION_METHODS = Object.freeze(['MOBILE_APP_VIA_SERVER', 'DESKTOP_APP_VIA_SERVER', 'WEB_APP_VIA_SERVER', 'DESKTOP_APP_DIRECT']);
const PLACEHOLDERS = new Set(['', 'null', 'undefined', 'unknown', 'n/a', 'na', 'none', '0.0.0.0', '[]', '{}']);
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZONE = /^UTC[+-]\d{2}:\d{2}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const REQUIRED = Object.freeze({
  MOBILE_APP_VIA_SERVER: ['Gov-Client-Connection-Method', 'Gov-Client-Device-ID', 'Gov-Client-User-IDs', 'Gov-Client-Timezone', 'Gov-Client-Local-IPs', 'Gov-Client-Local-IPs-Timestamp', 'Gov-Client-Screens', 'Gov-Client-Window-Size', 'Gov-Client-User-Agent', 'Gov-Client-Multi-Factor', 'Gov-Client-Public-IP', 'Gov-Client-Public-IP-Timestamp', 'Gov-Client-Public-Port', 'Gov-Vendor-Version', 'Gov-Vendor-License-IDs', 'Gov-Vendor-Product-Name', 'Gov-Vendor-Public-IP', 'Gov-Vendor-Forwarded'],
});

function enc(value) {
  return encodeURIComponent(String(value));
}

function pairs(entries) {
  return entries.filter(([, value]) => value !== undefined && value !== null && String(value) !== '').map(([key, value]) => `${enc(key)}=${enc(value)}`).join('&');
}

function realIp(value) {
  const text = String(value || '').trim();
  if (!text || PLACEHOLDERS.has(text.toLowerCase())) return '';
  if (IPV4.test(text)) return /^(127\.|0\.)/.test(text) ? '' : text;
  return IPV6.test(text) && text.includes(':') && text !== '::1' ? text.toLowerCase() : '';
}

function publicIp(value) {
  const ip = realIp(value);
  if (!ip) return '';
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(ip)) return '';
  if (/^(fc|fd|fe80)/i.test(ip)) return '';
  return ip;
}

function instant(value, fallback) {
  const text = String(value || '');
  if (INSTANT.test(text)) return text;
  const at = new Date(text || fallback);
  return Number.isNaN(at.getTime()) ? new Date(fallback).toISOString() : at.toISOString();
}

export function timezoneOffset(minutesEast) {
  const minutes = Number(minutesEast);
  if (!Number.isInteger(minutes) || Math.abs(minutes) > 14 * 60) return '';
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

export function buildFraudHeaders({ device = {}, user = {}, vendor = {}, now = new Date().toISOString(), method = 'MOBILE_APP_VIA_SERVER' } = {}) {
  const screens = (Array.isArray(device.screens) ? device.screens : []).filter((screen) => screen && Number(screen.width) > 0 && Number(screen.height) > 0);
  const localIps = (Array.isArray(device.localIps) ? device.localIps : []).map(realIp).filter(Boolean);
  const clientIp = publicIp(device.ipAddress);
  const vendorIp = publicIp(vendor.publicIp);
  const timezone = ZONE.test(String(device.timezone || '')) ? device.timezone : timezoneOffset(device.timezoneOffsetMinutes);
  const factors = (Array.isArray(user.multiFactor) ? user.multiFactor : []).filter((factor) => factor && factor.type && factor.timestamp && factor.uniqueReference);
  const headers = {
    'Gov-Client-Connection-Method': method,
    'Gov-Client-Device-ID': UUID.test(String(device.deviceId || '')) ? String(device.deviceId).toLowerCase() : '',
    'Gov-Client-User-IDs': user.id ? pairs([['myca', user.id]]) : '',
    'Gov-Client-Timezone': timezone,
    'Gov-Client-Local-IPs': localIps.map(enc).join(','),
    'Gov-Client-Local-IPs-Timestamp': localIps.length ? instant(device.localIpsTimestamp, now) : '',
    'Gov-Client-Screens': screens.map((screen) => pairs([['width', Math.round(screen.width)], ['height', Math.round(screen.height)], ['scaling-factor', Number(screen.scalingFactor || 1)], ['colour-depth', Math.round(screen.colourDepth || 24)]])).join(','),
    'Gov-Client-Window-Size': Number(device.windowWidth) > 0 && Number(device.windowHeight) > 0 ? pairs([['width', Math.round(device.windowWidth)], ['height', Math.round(device.windowHeight)]]) : '',
    'Gov-Client-User-Agent': device.osFamily && device.osVersion ? pairs([['os-family', device.osFamily], ['os-version', device.osVersion], ['device-manufacturer', device.manufacturer], ['device-model', device.model]]) : '',
    'Gov-Client-Multi-Factor': factors.map((factor) => pairs([['type', factor.type], ['timestamp', instant(factor.timestamp, now)], ['unique-reference', factor.uniqueReference]])).join(','),
    'Gov-Client-Public-IP': clientIp,
    'Gov-Client-Public-IP-Timestamp': clientIp ? instant(device.ipAddressTimestamp, now) : '',
    'Gov-Client-Public-Port': Number.isInteger(Number(device.port)) && Number(device.port) > 0 && Number(device.port) < 65536 ? String(Number(device.port)) : '',
    'Gov-Vendor-Version': pairs([['myca-android', vendor.appVersion || device.appVersion], ['myca-server', vendor.serverVersion]]),
    'Gov-Vendor-License-IDs': vendor.licenceId ? pairs([['myca', vendor.licenceId]]) : '',
    'Gov-Vendor-Product-Name': enc(vendor.productName || 'MyCA UK'),
    'Gov-Vendor-Public-IP': vendorIp,
    'Gov-Vendor-Forwarded': vendorIp && clientIp ? pairs([['by', vendorIp], ['for', clientIp]]) : '',
  };
  const required = REQUIRED[method] || [];
  const missing = required.filter((name) => !headers[name] || PLACEHOLDERS.has(String(headers[name]).toLowerCase()));
  const sent = Object.fromEntries(Object.entries(headers).filter(([, value]) => value));
  return { headers: sent, missing, complete: missing.length === 0 };
}

export function fraudHeaderGaps(built) {
  const why = {
    'Gov-Client-Device-ID': 'the app sends the install\'s random device id',
    'Gov-Client-Timezone': 'the app sends the phone\'s time zone',
    'Gov-Client-Local-IPs': 'the app sends the phone\'s own network addresses',
    'Gov-Client-Screens': 'the app sends the screen size',
    'Gov-Client-Window-Size': 'the app sends the window size',
    'Gov-Client-User-Agent': 'the app sends the operating system and phone model',
    'Gov-Client-Multi-Factor': 'turn on two-step sign-in; HMRC is told it was used',
    'Gov-Client-Public-IP': 'the server reads the address the request came from',
    'Gov-Client-Public-Port': 'the server reads the port the request came from',
    'Gov-Vendor-License-IDs': 'the server sends the subscription id',
    'Gov-Vendor-Public-IP': 'set MYCA_HMRC_VENDOR_PUBLIC_IP to the server\'s outbound address',
    'Gov-Vendor-Forwarded': 'needs both the server and client addresses',
  };
  return built.missing.map((name) => ({ header: name, fix: why[name] || 'required by HMRC for this connection method' }));
}
