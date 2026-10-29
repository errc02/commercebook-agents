/**
 * The CommerceBook API client: one base URL, the key header, a request id on every write (the API takes it as the
 * idempotency key, so a retried write runs once), retries on 429 and 5xx that honour Retry-After, and typed errors
 * that carry the API's error code and detail. No dependencies: it uses the fetch of Node 20 or the browser.
 */
export const DEFAULT_BASE_URL = 'https://commercebook.ai/api/v1';
export const SDK_VERSION = '0.1.0';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Query = Record<string, string | number | boolean | null | undefined>;

export interface CommerceBookOptions {
  /** An agent link key or a named key from Agent access (cb_agent_...). Leave it out for the calls that need no key. */
  key?: string;
  /** The API root. A site origin such as https://commercebook.ai gets /api/v1 added. */
  baseUrl?: string;
  /** Retries after a 429, a 5xx or a network failure. 3 by default; 0 turns retries off. */
  maxRetries?: number;
  /** The longest wait, in seconds, the client accepts from Retry-After before it gives up and throws. 60 by default. */
  maxRetryAfterSeconds?: number;
  /** Another fetch, for tests or a runtime without a global fetch. */
  fetch?: typeof fetch;
  /** Extra headers on every call. */
  headers?: Record<string, string>;
}

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** The request id (X-Request-Id). Writes get a new one per call by default; send your own to repeat a write safely. */
  requestId?: string;
  signal?: AbortSignal;
}

/** A refusal from the API: the HTTP status, the code (error), the detail and, for not_permitted, the activity and the hint. */
export class CommerceBookError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail: string | null;
  readonly activity: string | null;
  readonly hint: string | null;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;
  readonly body: unknown;

  constructor(init: { status: number; code: string; detail?: string | null; activity?: string | null; hint?: string | null; requestId?: string | null; retryAfterSeconds?: number | null; body?: unknown }) {
    super(init.detail ? `${init.code}: ${init.detail}` : init.code);
    this.name = 'CommerceBookError';
    this.status = init.status;
    this.code = init.code;
    this.detail = init.detail ?? null;
    this.activity = init.activity ?? null;
    this.hint = init.hint ?? null;
    this.requestId = init.requestId ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    this.body = init.body ?? null;
  }
}

/** The API root for a base: a root ending in /api/v1 (or a local functions path) is kept; an origin gets /api/v1. */
export function apiRoot(base: string): string {
  const b = base.trim().replace(/\/+$/, '');
  if (/\/api\/v1$/.test(b) || /\/\.netlify\/functions\/api$/.test(b)) return b;
  return `${b}/api/v1`;
}

/** Seconds from a Retry-After header: a number of seconds or an HTTP date. */
export function retryAfterSeconds(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const s = value.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const at = Date.parse(s);
  return Number.isNaN(at) ? null : Math.max(0, (at - now) / 1000);
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error('aborted'));
    }, { once: true });
  });

function newRequestId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `cb-${Date.now().toString(16)}-${Math.random().toString(16).slice(2, 14)}`;
}

export class CommerceBookClient {
  readonly baseUrl: string;
  private readonly key: string;
  private readonly maxRetries: number;
  private readonly maxRetryAfter: number;
  private readonly fetchImpl: typeof fetch;
  private readonly extraHeaders: Record<string, string>;

  constructor(options: CommerceBookOptions = {}) {
    this.baseUrl = apiRoot(options.baseUrl ?? DEFAULT_BASE_URL);
    this.key = (options.key ?? '').trim();
    this.maxRetries = Math.max(0, options.maxRetries ?? 3);
    this.maxRetryAfter = options.maxRetryAfterSeconds ?? 60;
    const f = options.fetch ?? globalThis.fetch;
    if (!f) throw new Error('No fetch is available. Use Node 20 or later, or pass options.fetch.');
    this.fetchImpl = f.bind(globalThis);
    this.extraHeaders = options.headers ?? {};
  }

  /** True when the client sends a key. */
  get hasKey(): boolean {
    return this.key.length > 0;
  }

  /** The first 13 characters of the key, the only part ever shown. */
  get keyPrefix(): string | null {
    return this.key ? this.key.slice(0, 13) : null;
  }

  /** One call of the API. path is relative to the API root, for example /market/search. */
  async request<T = unknown>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    for (const [k, v] of Object.entries(options.query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    const write = method !== 'GET';
    const requestId = options.requestId ?? (write ? newRequestId() : undefined);
    const headers: Record<string, string> = {
      accept: 'application/json',
      'user-agent': `commercebook-sdk-js/${SDK_VERSION}`,
      ...this.extraHeaders,
      ...(this.key ? { authorization: `Bearer ${this.key}` } : {}),
      ...(requestId ? { 'x-request-id': requestId } : {}),
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
    };
    const body = options.body !== undefined ? JSON.stringify(options.body) : undefined;

    for (let attempt = 0; ; attempt++) {
      let res: Response;
      try {
        res = await this.fetchImpl(url, { method, headers, body, signal: options.signal });
      } catch (e) {
        if (options.signal?.aborted || attempt >= this.maxRetries) throw e;
        await sleep(backoff(attempt), options.signal);
        continue;
      }
      const rid = res.headers.get('x-request-id') ?? requestId ?? null;
      const wait = retryAfterSeconds(res.headers.get('retry-after'));
      if (RETRY_STATUS.has(res.status) && attempt < this.maxRetries && (wait === null || wait <= this.maxRetryAfter)) {
        await res.text().catch(() => '');
        await sleep(wait !== null ? wait * 1000 : backoff(attempt), options.signal);
        continue;
      }
      const text = await res.text();
      let data: unknown = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          if (!res.ok) throw new CommerceBookError({ status: res.status, code: `http_${res.status}`, detail: text.slice(0, 200), requestId: rid, retryAfterSeconds: wait });
          data = text;
        }
      }
      if (!res.ok) {
        const e = (data && typeof data === 'object' ? data : {}) as { error?: string; detail?: string | null; activity?: string | null; hint?: string | null };
        throw new CommerceBookError({ status: res.status, code: e.error ?? `http_${res.status}`, detail: e.detail ?? null, activity: e.activity ?? null, hint: e.hint ?? null, requestId: rid, retryAfterSeconds: wait, body: data });
      }
      return data as T;
    }
  }
}

function backoff(attempt: number): number {
  return Math.min(8000, 500 * 2 ** attempt) + Math.floor(Math.random() * 250);
}
