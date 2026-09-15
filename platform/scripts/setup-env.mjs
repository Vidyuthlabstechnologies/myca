#!/usr/bin/env node
/**
 * MyCA Production Environment Setup Wizard
 * 
 * Interactively prompts for real API keys across statutory portals, GSPs,
 * banking, accounting, and practice infrastructure, and writes directly
 * to .env / .env.production without echoing secrets or exposing them in logs.
 * 
 * Usage:
 *   npm run setup:env
 *   node scripts/setup-env.mjs [--prod] [--check]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isProdTarget = process.argv.includes('--prod');
const isCheckOnly = process.argv.includes('--check');
const targetEnvFile = join(root, isProdTarget ? '.env.production' : '.env');
const exampleFile = join(root, '.env.example');

const SECTIONS = [
  {
    title: '1. Licensed GSP & GSTN Portal (REQ-CA-006, REQ-CA-008)',
    docs: 'https://developer.sandbox.co.in / https://services.gst.gov.in',
    keys: [
      { name: 'MYCA_GSP_PROVIDER', desc: 'GSP Provider (sandbox / quicko / cleartax)', default: 'sandbox', secret: false },
      { name: 'MYCA_GSP_BASE_URL', desc: 'GSP Base API URL', default: 'https://api.sandbox.co.in', secret: false },
      { name: 'MYCA_GSP_API_KEY', desc: 'GSP / Quicko Developer API Key', secret: true },
      { name: 'MYCA_GSP_API_SECRET', desc: 'GSP / Quicko API Secret', secret: true },
      { name: 'MYCA_GSP_ASP_ID', desc: 'Application Service Provider (ASP) Client ID', secret: false },
    ],
  },
  {
    title: '2. NIC E-Invoice & E-Way Bill (REQ-CA-007)',
    docs: 'https://einv-apisandbox.nic.in / https://einvoice1.gst.gov.in',
    keys: [
      { name: 'MYCA_NIC_ENV', desc: 'Environment (sandbox / production)', default: 'sandbox', secret: false },
      { name: 'MYCA_NIC_CLIENT_ID', desc: 'NIC Client ID', secret: false },
      { name: 'MYCA_NIC_CLIENT_SECRET', desc: 'NIC Client Secret', secret: true },
      { name: 'MYCA_NIC_USERNAME', desc: 'NIC Portal API User (registered on einvoice1.gst.gov.in)', secret: false },
      { name: 'MYCA_NIC_PASSWORD', desc: 'NIC API User Password', secret: true },
      { name: 'MYCA_NIC_GSTIN', desc: 'Business GSTIN registered for e-invoicing', secret: false },
      { name: 'MYCA_NIC_PUBLIC_KEY_PATH', desc: 'Path to official NIC RSA .cer / .pem public key', default: '', secret: false },
    ],
  },
  {
    title: '3. Income Tax Department, AIS/26AS & TRACES (REQ-CA-009, REQ-CA-010)',
    docs: 'https://eportal.incometax.gov.in / https://contents.tdscpc.gov.in',
    keys: [
      { name: 'MYCA_ITD_API_KEY', desc: 'Income Tax Analytics / e-Filing API Key', secret: true },
      { name: 'MYCA_TRACES_USER_ID', desc: 'TRACES CPC User ID', secret: false },
      { name: 'MYCA_TRACES_PASSWORD', desc: 'TRACES CPC Password', secret: true },
      { name: 'MYCA_TRACES_TAN', desc: 'Firm / Client TAN (e.g. PNEA12345B)', secret: false },
    ],
  },
  {
    title: '4. TallyPrime Local Integration',
    docs: 'https://help.tallysolutions.com (Port 9000 XML / ODBC)',
    keys: [
      { name: 'MYCA_TALLY_HOST', desc: 'Tally Host IP', default: '127.0.0.1', secret: false },
      { name: 'MYCA_TALLY_PORT', desc: 'Tally HTTP XML Port', default: '9000', secret: false },
      { name: 'MYCA_TALLY_COMPANY', desc: 'Active Tally Company Name to sync', secret: false },
    ],
  },
  {
    title: '5. Zoho Books OAuth 2.0 Integration',
    docs: 'https://api-console.zoho.in / https://www.zoho.com/books/api/v3',
    keys: [
      { name: 'MYCA_ZOHO_CLIENT_ID', desc: 'Zoho Developer Client ID', secret: false },
      { name: 'MYCA_ZOHO_CLIENT_SECRET', desc: 'Zoho Client Secret', secret: true },
      { name: 'MYCA_ZOHO_REFRESH_TOKEN', desc: 'Zoho OAuth 2.0 Refresh Token', secret: true },
      { name: 'MYCA_ZOHO_ORGANIZATION_ID', desc: 'Zoho Books Organization ID', secret: false },
    ],
  },
  {
    title: '6. Account Aggregator Bank Feeds (Setu / Finvu / Anumati)',
    docs: 'https://sahamati.org.in / https://setu.co/data/account-aggregator',
    keys: [
      { name: 'MYCA_AA_PROVIDER', desc: 'AA Provider Name', default: 'setu', secret: false },
      { name: 'MYCA_AA_CLIENT_ID', desc: 'Account Aggregator Client ID', secret: false },
      { name: 'MYCA_AA_CLIENT_SECRET', desc: 'Account Aggregator Client Secret', secret: true },
      { name: 'MYCA_AA_PRODUCT_INSTANCE_ID', desc: 'Setu Product Instance ID', secret: false },
    ],
  },
  {
    title: '7. Client Document Chase & WhatsApp Notifications (REQ-CA-012, REQ-CA-013)',
    docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api / https://aws.amazon.com/ses',
    keys: [
      { name: 'MYCA_WHATSAPP_PHONE_NUMBER_ID', desc: 'Meta WhatsApp Business Phone Number ID', secret: false },
      { name: 'MYCA_WHATSAPP_ACCESS_TOKEN', desc: 'Meta Permanent System User Access Token', secret: true },
      { name: 'MYCA_WHATSAPP_BUSINESS_ACCOUNT_ID', desc: 'Meta WABA Account ID', secret: false },
      { name: 'MYCA_AWS_SES_REGION', desc: 'AWS Region for SES (Email)', default: 'ap-south-1', secret: false },
      { name: 'MYCA_AWS_ACCESS_KEY_ID', desc: 'AWS Access Key ID for SES', secret: false },
      { name: 'MYCA_AWS_SECRET_ACCESS_KEY', desc: 'AWS Secret Access Key for SES', secret: true },
      { name: 'MYCA_EMAIL_FROM', desc: 'Verified Sender Email Address', default: 'compliance@myca.firm', secret: false },
    ],
  },
  {
    title: '8. Practice Database & Document Vault (REQ-CA-001, REQ-CA-002, REQ-CA-003)',
    docs: 'TigerBeetle / PostgreSQL / S3 India Region (ap-south-1)',
    keys: [
      { name: 'MYCA_DATABASE_URL', desc: 'Database Connection String', default: 'postgresql://myca_user:password@127.0.0.1:5432/myca_firm', secret: true },
      { name: 'MYCA_S3_BUCKET', desc: 'S3 / Blob Document Bucket Name', default: 'myca-firm-documents', secret: false },
      { name: 'MYCA_S3_REGION', desc: 'S3 Storage Region', default: 'ap-south-1', secret: false },
      { name: 'MYCA_S3_ACCESS_KEY', desc: 'S3 Access Key', secret: false },
      { name: 'MYCA_S3_SECRET_KEY', desc: 'S3 Secret Key', secret: true },
    ],
  },
  {
    title: '9. Firm Single Sign-On (REQ-CA-004)',
    docs: 'Microsoft Entra ID (Azure AD) / Google Workspace OAuth',
    keys: [
      { name: 'MYCA_AUTH_TENANT_ID', desc: 'Directory / Tenant ID', secret: false },
      { name: 'MYCA_AUTH_CLIENT_ID', desc: 'SSO App Client ID', secret: false },
      { name: 'MYCA_AUTH_CLIENT_SECRET', desc: 'SSO App Client Secret', secret: true },
    ],
  },
  {
    title: '10. AI Telemetry & Quality Evals (REQ-CA-015)',
    docs: 'https://langfuse.com',
    keys: [
      { name: 'MYCA_LANGFUSE_PUBLIC_KEY', desc: 'Langfuse Public Key', secret: false },
      { name: 'MYCA_LANGFUSE_SECRET_KEY', desc: 'Langfuse Secret Key', secret: true },
      { name: 'MYCA_LANGFUSE_HOST', desc: 'Langfuse Host', default: 'https://cloud.langfuse.com', secret: false },
    ],
  },
];

function loadEnvFile(path) {
  const map = new Map();
  if (!existsSync(path)) return map;
  const lines = readFileSync(path, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx > 0) {
      const k = trimmed.slice(0, idx).trim();
      const v = trimmed.slice(idx + 1).trim();
      map.set(k, v);
    }
  }
  return map;
}

function mask(str) {
  if (!str) return '(empty)';
  if (str.length <= 4) return '****';
  return `${str.slice(0, 2)}****${str.slice(-2)}`;
}

if (isCheckOnly) {
  console.log(`\nChecking configuration in: ${targetEnvFile}\n`);
  const env = loadEnvFile(targetEnvFile);
  let totalKeys = 0;
  let configuredKeys = 0;
  for (const section of SECTIONS) {
    console.log(`\x1b[1m${section.title}\x1b[0m`);
    for (const k of section.keys) {
      totalKeys += 1;
      const val = env.get(k.name);
      if (val) {
        configuredKeys += 1;
        const display = k.secret ? mask(val) : val;
        console.log(`  \x1b[32m[✓]\x1b[0m ${k.name} = ${display}`);
      } else {
        console.log(`  \x1b[33m[ ]\x1b[0m ${k.name} (not set)`);
      }
    }
    console.log('');
  }
  console.log(`Summary: ${configuredKeys}/${totalKeys} keys configured.`);
  process.exit(0);
}

const currentEnv = loadEnvFile(targetEnvFile);
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question, defaultValue = '') {
  return new Promise((res) => {
    const suffix = defaultValue ? ` [${defaultValue}]: ` : ': ';
    rl.question(`  ${question}${suffix}`, (answer) => {
      const final = answer.trim() || defaultValue;
      res(final);
    });
  });
}

async function main() {
  console.log('\n===============================================================');
  console.log('   MyCA Production Environment Configuration Wizard');
  console.log('===============================================================');
  console.log(`Target file: ${targetEnvFile}`);
  console.log('Press ENTER to keep the current/default value, or type a new value.\n');

  for (const section of SECTIONS) {
    console.log(`\n\x1b[1m\x1b[34m--- ${section.title} ---\x1b[0m`);
    console.log(`Docs: \x1b[4m${section.docs}\x1b[0m`);
    for (const keyDef of section.keys) {
      const existing = currentEnv.get(keyDef.name) || '';
      const fallback = existing || keyDef.default || '';
      const displayFallback = keyDef.secret && fallback ? mask(fallback) : fallback;
      const val = await ask(
        `${keyDef.name} (${keyDef.desc})`,
        displayFallback
      );
      // If user typed the masked string, keep the existing secret
      const valueToSave = (keyDef.secret && val === mask(fallback)) ? existing : val;
      if (valueToSave) {
        currentEnv.set(keyDef.name, valueToSave);
      }
    }
  }

  // Generate clean .env file output
  let out = '# ==============================================================================\n';
  out += '# MyCA Production Environment Secrets\n';
  out += `# Generated: ${new Date().toISOString()}\n`;
  out += '# ==============================================================================\n\n';

  for (const section of SECTIONS) {
    out += `# ------------------------------------------------------------------------------\n`;
    out += `# ${section.title}\n`;
    out += `# Docs: ${section.docs}\n`;
    out += `# ------------------------------------------------------------------------------\n`;
    for (const key of section.keys) {
      const v = currentEnv.get(key.name) || '';
      out += `${key.name}=${v}\n`;
    }
    out += '\n';
  }

  writeFileSync(targetEnvFile, out, 'utf8');
  console.log('\n\x1b[32m✔ Configuration saved successfully to:\x1b[0m', targetEnvFile);
  console.log('Ensure this file is kept secure and never committed to version control.\n');
  rl.close();
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
