import { loadEnvFile } from './runtime-config.mjs';

export class NimClient {
  constructor(options = {}) {
    const env = loadEnvFile();
    this.apiKey = options.apiKey ?? process.env.NVIDIA_NIM_API_KEY ?? process.env.NIM_API_KEY ?? env.NVIDIA_NIM_API_KEY ?? '';
    this.baseUrl = options.baseUrl ?? process.env.NVIDIA_NIM_BASE_URL ?? env.NVIDIA_NIM_BASE_URL ?? 'https://integrate.api.nvidia.com/v1';
    this.defaultModel = options.model ?? process.env.NVIDIA_NIM_MODEL ?? env.NVIDIA_NIM_MODEL ?? 'meta/llama-3.3-70b-instruct';
    this.fetchFn = options.fetchFn || ((...args) => globalThis.fetch(...args));
  }

  isConfigured() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async ping() {
    if (!this.isConfigured()) {
      return {
        ok: false,
        configured: false,
        provider: 'nvidia_nim',
        model: this.defaultModel,
        error: 'MISSING_NIM_KEY',
        hint: 'NVIDIA NIM API key is pending. Enter your free API key from https://build.nvidia.com in platform/.env as NVIDIA_NIM_API_KEY.',
      };
    }
    const started = Date.now();
    try {
      const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model: this.defaultModel,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 2,
        }),
      });
      const ms = Date.now() - started;
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          configured: true,
          provider: 'nvidia_nim',
          model: this.defaultModel,
          status: res.status,
          ms,
          error: data.message || data.error?.message || `HTTP ${res.status}`,
        };
      }
      return {
        ok: true,
        configured: true,
        provider: 'nvidia_nim',
        model: this.defaultModel,
        ms,
        status: 200,
        message: 'NVIDIA NIM API connected successfully',
      };
    } catch (err) {
      return {
        ok: false,
        configured: true,
        provider: 'nvidia_nim',
        model: this.defaultModel,
        error: String(err.message || err),
      };
    }
  }

  async complete({ prompt, messages, systemPrompt, model, temperature = 0.2, maxTokens = 1024 } = {}) {
    if (!this.isConfigured()) {
      return {
        ok: false,
        configured: false,
        error: 'MISSING_NIM_KEY',
        hint: 'NVIDIA NIM API key is pending. Add NVIDIA_NIM_API_KEY to platform/.env to activate free Llama-3.3-70B model inference.',
      };
    }

    const msgList = [];
    if (systemPrompt) {
      msgList.push({ role: 'system', content: String(systemPrompt) });
    }
    if (Array.isArray(messages) && messages.length > 0) {
      msgList.push(...messages);
    } else if (prompt) {
      msgList.push({ role: 'user', content: String(prompt) });
    } else {
      return { ok: false, error: 'PROMPT_REQUIRED' };
    }

    const targetModel = model || this.defaultModel;
    try {
      const res = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          model: targetModel,
          messages: msgList,
          temperature,
          max_tokens: maxTokens,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return {
          ok: false,
          configured: true,
          status: res.status,
          error: data.message || data.error?.message || `HTTP ${res.status}`,
        };
      }

      const reply = data.choices?.[0]?.message?.content || '';
      return {
        ok: true,
        configured: true,
        model: targetModel,
        reply,
        usage: data.usage || null,
      };
    } catch (err) {
      return { ok: false, configured: true, error: String(err.message || err) };
    }
  }
}

let defaultNimClient = null;
export function getNimClient() {
  if (!defaultNimClient) defaultNimClient = new NimClient();
  return defaultNimClient;
}
