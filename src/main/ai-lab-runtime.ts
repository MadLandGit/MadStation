/**
 * AI Lab data, credential coordination, API requests, and local-model discovery.
 * The Electron composition root injects storage and credential adapters; this
 * module never imports Electron and never returns credential values to callers
 * except to the request path that needs them.
 */

export interface AiLabCredentialStore {
  read(): Promise<Record<string, string>>;
  write(items: Record<string, string>): Promise<unknown>;
}

type UnknownRecord = Record<string, unknown>;
type FileSystemLike = {
  existsSync(path: string): boolean;
  readFileSync(path: string, encoding: string): string;
  writeFileSync(path: string, data: string, encoding: string): void;
  mkdirSync(path: string, options?: { recursive?: boolean }): unknown;
  copyFileSync(source: string, destination: string): void;
  renameSync(source: string, destination: string): void;
  unlinkSync(path: string): void;
};
type PathLike = { join(...parts: string[]): string; dirname(path: string): string };

type ApiResult = { ok: false; error: string } | { ok: true; [key: string]: unknown };
type BoundApiCredential = { key: string; provider: string; endpoint: string; model: string };
const BOUND_API_CREDENTIAL_PREFIX = 'mad-station-bound-ai-key:v1:';
const ALLOWED_API_PROVIDERS = new Set(['openai-compatible', 'anthropic', 'gemini']);

export interface AiLabRuntimeDependencies {
  credentials: AiLabCredentialStore;
  getDataPath(): string;
  path: PathLike;
  fs: FileSystemLike;
  cleanId(value: unknown, maxLength?: number): string;
  isPlainObject(value: unknown): value is UnknownRecord;
  fetchImpl?: typeof fetch;
  now?(): number;
  setTimer?(callback: () => void, timeoutMs: number): ReturnType<typeof setTimeout>;
  clearTimer?(timer: ReturnType<typeof setTimeout>): void;
  temporarySuffix?(): string;
}

export function createAiLabRuntime(dependencies: AiLabRuntimeDependencies) {
  const { credentials, getDataPath, path, fs, cleanId, isPlainObject } = dependencies;
  const fetchImpl = dependencies.fetchImpl || fetch;
  const now = dependencies.now || Date.now;
  const setTimer = dependencies.setTimer || setTimeout;
  const clearTimer = dependencies.clearTimer || clearTimeout;
  const temporarySuffix = dependencies.temporarySuffix || (() => 'runtime');

  function normalizedApiEndpoint(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim() || value.length > 2048) return null;
    try {
      const parsed = new URL(value.trim());
      if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
      const host = parsed.hostname.toLowerCase();
      const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
      // Plain HTTP is only acceptable for the explicit local-model loopback endpoints.
      if (parsed.protocol === 'http:' && !isLoopback) return null;
      parsed.hash = '';
      return parsed.href.replace(/\/+$/, '');
    } catch { return null; }
  }

  function decodeBoundCredential(value: unknown): BoundApiCredential | null {
    if (typeof value !== 'string' || !value.startsWith(BOUND_API_CREDENTIAL_PREFIX)) return null;
    try {
      const parsed = JSON.parse(value.slice(BOUND_API_CREDENTIAL_PREFIX.length)) as unknown;
      if (!isPlainObject(parsed)) return null;
      const key = typeof parsed.key === 'string' ? parsed.key : '';
      const provider = typeof parsed.provider === 'string' ? parsed.provider : '';
      const endpoint = normalizedApiEndpoint(parsed.endpoint);
      const model = typeof parsed.model === 'string' ? parsed.model.trim().slice(0, 240) : '';
      if (!key || !ALLOWED_API_PROVIDERS.has(provider) || !endpoint || !model) return null;
      return { key, provider, endpoint, model };
    } catch { return null; }
  }

  function encodeBoundCredential(binding: BoundApiCredential): string {
    return `${BOUND_API_CREDENTIAL_PREFIX}${JSON.stringify(binding)}`;
  }

  function sanitizeDataForStorage(data: unknown): UnknownRecord {
    const safe: UnknownRecord = isPlainObject(data) ? JSON.parse(JSON.stringify(data)) as UnknownRecord : {};
    if (Array.isArray(safe.models)) {
      safe.models = safe.models.map((model: unknown) => {
        const out: UnknownRecord = isPlainObject(model) ? { ...model } : {};
        delete out.apiKey;
        return out;
      });
    }
    return safe;
  }

  async function migrateLegacyApiKeys(data: unknown, options: { failOnMigrationError?: boolean } = {}) {
    const source = isPlainObject(data) ? data : {};
    const models = Array.isArray(source.models) ? source.models : [];
    const storedCredentials = await credentials.read();
    const nextCredentials = { ...storedCredentials };
    let changed = false;
    let legacyKeyCount = 0;
    for (const model of models as UnknownRecord[]) {
      const id = cleanId(model?.id, 160);
      const legacyKey = typeof model?.apiKey === 'string' ? model.apiKey.trim() : '';
      if (id && legacyKey) { nextCredentials[id] = legacyKey; changed = true; legacyKeyCount += 1; }
      if (Object.prototype.hasOwnProperty.call(model || {}, 'apiKey')) changed = true;
    }
    let migrationWarning = '';
    if (legacyKeyCount) {
      try {
        await credentials.write(nextCredentials);
      } catch {
        migrationWarning = 'An existing AI Lab API key could not be moved to secure storage. It was not used or copied into the new AI Lab file.';
        if (options.failOnMigrationError) throw new Error(migrationWarning);
      }
    }
    return { data: sanitizeDataForStorage(source), credentials: nextCredentials, changed, migrationWarning };
  }

  async function apiKeyStatusForModels(models: unknown) {
    const storedCredentials = await credentials.read();
    return (Array.isArray(models) ? models : []).map((model: UnknownRecord) => {
      const id = cleanId(model?.id, 160);
      const bound = decodeBoundCredential(storedCredentials[id]);
      const endpoint = normalizedApiEndpoint(model?.endpoint);
      const provider = String(model?.provider || 'openai-compatible');
      const modelName = typeof model?.model === 'string' ? model.model.trim().slice(0, 240) : '';
      const matches = Boolean(bound && endpoint && bound.provider === provider && bound.endpoint === endpoint && bound.model === modelName);
      const hasLegacyKey = typeof storedCredentials[id] === 'string' && Boolean(storedCredentials[id]) && !bound;
      return { ...model, apiKeyConfigured: matches, ...(hasLegacyKey ? { apiKeyNeedsRebind: true } : {}) };
    });
  }

  async function setApiKey(payload: unknown) {
    const data = isPlainObject(payload) ? payload : {};
    const modelId = cleanId(data.modelId, 160);
    if (!modelId) return { ok: false, error: 'Invalid API model.' };
    const key = String(data.apiKey || '').trim();
    if (!key || key.length > 1000) return { ok: false, error: 'Enter a valid API key.' };
    try {
      // Bind the credential to the endpoint/provider/model that is currently saved
      // by the host. A renderer request cannot later replay that key to another URL.
      const loaded = await loadData();
      const models = Array.isArray((loaded.data as UnknownRecord).models) ? (loaded.data as UnknownRecord).models as UnknownRecord[] : [];
      const model = models.find((entry) => cleanId(entry?.id, 160) === modelId);
      if (!model) return { ok: false, error: 'Save the API model before configuring its key.' };
      const provider = String(model.provider || 'openai-compatible');
      const endpoint = normalizedApiEndpoint(model.endpoint);
      const modelName = typeof model.model === 'string' ? model.model.trim().slice(0, 240) : '';
      if (!ALLOWED_API_PROVIDERS.has(provider) || !endpoint || !modelName) {
        return { ok: false, error: 'Save a valid HTTPS API endpoint and model before configuring its key.' };
      }
      const storedCredentials = await credentials.read();
      storedCredentials[modelId] = encodeBoundCredential({ key, provider, endpoint, model: modelName });
      await credentials.write(storedCredentials);
      return { ok: true, configured: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not securely store the API key.' };
    }
  }

  async function clearApiKey(modelIdInput: unknown) {
    const id = cleanId(modelIdInput, 160);
    if (!id) return { ok: false, error: 'Invalid API model.' };
    try {
      const storedCredentials = await credentials.read();
      delete storedCredentials[id];
      await credentials.write(storedCredentials);
      return { ok: true, configured: false };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not clear the stored API key.' };
    }
  }

  function saveDataFile(data: unknown, options: { createBackup?: boolean } = {}) {
    const safe = sanitizeDataForStorage(data);
    const file = getDataPath();
    const tmp = `${file}.tmp-${temporarySuffix()}`;
    const payload = JSON.stringify(safe, null, 2);
    let lastError: unknown = null;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          fs.writeFileSync(tmp, payload, 'utf8');
          if (options.createBackup !== false && fs.existsSync(file)) {
            try { fs.copyFileSync(file, `${file}.bak`); } catch { /* retain the last good primary file */ }
          }
          fs.renameSync(tmp, file);
          return safe;
        } catch (error) {
          lastError = error;
          const code = (error as { code?: string })?.code;
          if (!['EPERM', 'EACCES', 'EBUSY'].includes(String(code)) || attempt === 2) break;
        }
      }
    } finally {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* best-effort temporary cleanup */ }
    }
    throw lastError || new Error('Could not save AI Lab data.');
  }

  async function loadData() {
    const file = getDataPath();
    for (const candidate of [file, `${file}.bak`]) {
      if (!fs.existsSync(candidate)) continue;
      try {
        const raw = JSON.parse(fs.readFileSync(candidate, 'utf8'));
        const migrated = await migrateLegacyApiKeys(isPlainObject(raw) ? raw : {});
        if (candidate !== file) {
          try { saveDataFile(migrated.data, { createBackup: false }); } catch { /* keep the recovered backup readable */ }
        }
        return { data: migrated.data, credentialWarning: migrated.migrationWarning || '' };
      } catch {
        if (candidate === file) {
          try { fs.renameSync(file, `${file}.corrupt-${now()}.json`); } catch { /* preserve any recoverable source */ }
        }
      }
    }
    return { data: {}, credentialWarning: '' };
  }

  async function getData(): Promise<ApiResult> {
    try {
      const loaded = await loadData();
      const models = await apiKeyStatusForModels((loaded.data as UnknownRecord).models);
      return { ok: true, data: { ...loaded.data, models }, credentialWarning: loaded.credentialWarning || '' };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not load AI Lab data.' };
    }
  }

  async function saveData(data: unknown): Promise<ApiResult> {
    try {
      const incoming = isPlainObject(data) ? JSON.parse(JSON.stringify(data)) as UnknownRecord : {};
      // Older clients may still include plaintext keys; migrate before saving and fail closed on write failure.
      await migrateLegacyApiKeys(incoming, { failOnMigrationError: true });
      const saved = saveDataFile(incoming);
      const models = await apiKeyStatusForModels(saved.models);
      return { ok: true, data: { ...saved, models } };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not save AI Lab data.' };
    }
  }

  async function readBoundedResponseText(response: Response, maxBytes = 4 * 1024 * 1024): Promise<string> {
    const announced = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(announced) && announced > maxBytes) {
      try { await response.body?.cancel(); } catch { /* cancellation is best-effort */ }
      throw new Error('The model response exceeded the 4 MB safety limit.');
    }
    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('The model response exceeded the 4 MB safety limit.');
      return text;
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          try { await reader.cancel(); } catch { /* cancellation is best-effort */ }
          throw new Error('The model response exceeded the 4 MB safety limit.');
        }
        chunks.push(value);
      }
    } finally {
      try { reader.releaseLock(); } catch { /* stream may already be released */ }
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return new TextDecoder().decode(bytes);
  }

  async function requestJson(url: string, options: RequestInit = {}, timeoutMs = 60000): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimer(() => controller.abort(), timeoutMs);
    try {
      // Do not follow redirects when sending prompts or credentials. A remote API
      // endpoint must not redirect custom credential headers to a second host.
      const response = await fetchImpl(url, { ...options, redirect: 'error', signal: controller.signal });
      const text = await readBoundedResponseText(response);
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; } catch { /* provider may return plain text */ }
      if (!response.ok) {
        const parsed = isPlainObject(body) ? body : {};
        const errorValue = isPlainObject(parsed.error) ? parsed.error.message : parsed.error;
        throw new Error(String(errorValue || text.slice(0, 400) || `HTTP ${response.status}`));
      }
      return body;
    } finally { clearTimer(timer as ReturnType<typeof setTimeout>); }
  }

  function extractAiText(body: unknown): string {
    const value = isPlainObject(body) ? body : {};
    const choices = Array.isArray(value.choices) ? value.choices as UnknownRecord[] : [];
    const output = Array.isArray(value.output) ? value.output as UnknownRecord[] : [];
    const candidates = Array.isArray(value.candidates) ? value.candidates as UnknownRecord[] : [];
    const content = Array.isArray(value.content) ? value.content as UnknownRecord[] : [];
    const choiceMessage = isPlainObject(choices[0]?.message) ? choices[0].message as UnknownRecord : {};
    const outputContent = Array.isArray(output[0]?.content) ? output[0].content as UnknownRecord[] : [];
    const candidateContent = isPlainObject(candidates[0]?.content) ? candidates[0].content as UnknownRecord : {};
    const candidateParts = Array.isArray(candidateContent.parts) ? candidateContent.parts as UnknownRecord[] : [];
    const joinText = (parts: UnknownRecord[]) => parts.map((part) => String(part?.text || '')).join('');
    const text = choiceMessage.content || choices[0]?.text || outputContent[0]?.text || joinText(candidateParts) || joinText(content);
    return typeof text === 'string' ? text : '';
  }

  async function request(payloadInput: unknown): Promise<ApiResult> {
    const payload = isPlainObject(payloadInput) ? payloadInput : {};
    let provider = String(payload.provider || 'openai-compatible');
    let endpoint = String(payload.endpoint || '').trim().replace(/\/+$/, '');
    let model = String(payload.model || '').trim().slice(0, 240);
    const prompt = String(payload.prompt || '').trim().slice(0, 100_000);
    const modelId = cleanId(payload.modelId, 160);
    if (!endpoint || !model || !prompt) return { ok: false, error: 'Endpoint, model, and instruction are required.' };
    if (!ALLOWED_API_PROVIDERS.has(provider)) return { ok: false, error: 'The API provider is not supported.' };
    const normalizedEndpoint = normalizedApiEndpoint(endpoint);
    if (!normalizedEndpoint) return { ok: false, error: 'Use HTTPS for remote API endpoints, or HTTP only for localhost. Credentials, query strings, and fragments are not allowed in endpoints.' };
    endpoint = normalizedEndpoint;

    let apiKey = '';
    if (modelId) {
      try {
        const storedCredentials = await credentials.read();
        const rawCredential = storedCredentials[modelId];
        if (rawCredential) {
          const bound = decodeBoundCredential(rawCredential);
          if (!bound) {
            return { ok: false, error: 'This saved API key is not bound to a verified endpoint. Re-enter the key in AI Lab API model settings.' };
          }
          if (bound.provider !== provider || bound.endpoint !== endpoint || bound.model !== model) {
            return { ok: false, error: 'The API request does not match the endpoint and model saved with this key. Review API model settings and re-enter the key if the endpoint changed.' };
          }
          apiKey = bound.key;
        }
      } catch {
        return { ok: false, error: 'Could not read the API key securely.' };
      }
    }

    let url = endpoint;
    let body: UnknownRecord;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider === 'gemini') {
      if (!apiKey) return { ok: false, error: 'Configure an API key in AI Lab API model settings.' };
      url = `${endpoint}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
      headers['x-goog-api-key'] = apiKey;
      body = { contents: [{ parts: [{ text: prompt }] }] };
    } else if (provider === 'anthropic') {
      if (!apiKey) return { ok: false, error: 'Configure an API key in AI Lab API model settings.' };
      url = `${endpoint}/v1/messages`;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      headers['x-api-key'] = apiKey;
      body = { model, max_tokens: Math.max(1, Math.min(8192, Number(payload.maxTokens) || 2048)), messages: [{ role: 'user', content: prompt }] };
    } else {
      url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;
      const host = (() => { try { return new URL(endpoint).hostname.toLowerCase(); } catch { return ''; } })();
      const localEndpoint = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
      // `apiKeyRequired: false` is a renderer preference, not authorization to send
      // private prompts to an arbitrary public endpoint without TLS or credentials.
      if (!apiKey && !localEndpoint) return { ok: false, error: 'Remote API endpoints require a securely configured API key.' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      body = { model, messages: [{ role: 'user', content: prompt }], temperature: Number.isFinite(Number(payload.temperature)) ? Math.max(0, Math.min(2, Number(payload.temperature))) : 0.2 };
    }
    try {
      const started = now();
      const result = await requestJson(url, { method: 'POST', headers, body: JSON.stringify(body) });
      return { ok: true, text: extractAiText(result), elapsedMs: now() - started };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'AI request failed.' };
    }
  }

  async function scanLocalModels(): Promise<ApiResult> {
    const servers = [] as Array<{ provider: string; endpoint: string; ok: boolean; models: Array<{ model: string }> }>;
    const models = [] as Array<{ type: string; provider: string; endpoint: string; model: string; label: string; local: boolean }>;
    const seenModels = new Set<string>();
    const candidates = [
      { provider: 'Ollama', endpoint: 'http://localhost:11434', kind: 'ollama' },
      { provider: 'LM Studio', endpoint: 'http://localhost:1234/v1', kind: 'openai' },
      { provider: 'LocalAI', endpoint: 'http://localhost:8080/v1', kind: 'openai' },
      { provider: 'vLLM', endpoint: 'http://localhost:8000/v1', kind: 'openai' },
    ] as const;
    const probed = await Promise.all(candidates.map(async (candidate) => {
      try {
        const body = candidate.kind === 'ollama'
          ? await requestJson(`${candidate.endpoint}/api/tags`, { method: 'GET' }, 1400)
          : await requestJson(`${candidate.endpoint}/models`, { method: 'GET' }, 1400);
        const record = isPlainObject(body) ? body : {};
        const rawModels = candidate.kind === 'ollama' ? (Array.isArray(record.models) ? record.models : []) : (isPlainObject(record) && Array.isArray(record.data) ? record.data : []);
        const normalized = (rawModels as UnknownRecord[]).map((m) => ({
          type: 'openai-compatible',
          provider: candidate.provider,
          endpoint: candidate.kind === 'ollama' ? `${candidate.endpoint}/v1` : candidate.endpoint,
          model: String(m?.name || m?.id || '').trim(),
          label: `${candidate.provider} · ${m?.name || m?.id || ''}`,
          local: true,
        })).filter((item) => item.model);
        return { server: { provider: candidate.provider, endpoint: candidate.endpoint, ok: true, models: normalized.map((item) => ({ model: item.model })) }, normalized };
      } catch {
        return { server: { provider: candidate.provider, endpoint: candidate.endpoint, ok: false, models: [] }, normalized: [] };
      }
    }));
    for (const entry of probed) {
      servers.push(entry.server);
      for (const model of entry.normalized) {
        const key = `${model.provider}:${model.endpoint}:${model.model}`;
        if (!seenModels.has(key)) { seenModels.add(key); models.push(model); }
      }
    }
    return { ok: true, servers: servers.filter((server) => server.ok), models };
  }

  return {
    sanitizeDataForStorage,
    migrateLegacyApiKeys,
    apiKeyStatusForModels,
    setApiKey,
    clearApiKey,
    saveDataFile,
    loadData,
    getData,
    saveData,
    requestJson,
    readBoundedResponseText,
    extractAiText,
    request,
    scanLocalModels,
  };
}
