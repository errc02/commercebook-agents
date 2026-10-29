/**
 * A small client for the CommerceBook warehouse API (SPEC-30 section 2). Reads COMMERCEBOOK_API_KEY and
 * COMMERCEBOOK_BASE (default https://commercebook.ai). The key is sent as Authorization: Bearer and never logged.
 * SPEC-47: an empty key is a keyless client (the sign-up tools of the remote server, which send no Authorization);
 * `fetch` lets the remote server at https://commercebook.ai/mcp call the API in the same process, and `headers` carry
 * the caller's address to the API's keyless limit.
 */
export interface ClientConfig {
  base: string;
  key: string;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public detail: string | null,
    public requestId: string | null,
    /** SPEC-52: a 403 not_permitted names the activity and where the owner turns it on. */
    public activity: string | null = null,
    public hint: string | null = null,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ApiError';
  }

  /** The text of a refused tool call: the code, the detail, the status and, when the API gave them, the activity and the hint. */
  toResult(): Record<string, unknown> {
    return {
      error: this.code,
      detail: this.detail,
      status: this.status,
      request_id: this.requestId,
      ...(this.activity ? { activity: this.activity } : {}),
      ...(this.hint ? { hint: this.hint } : {}),
    };
  }
}

export function configFromEnv(env: Record<string, string | undefined> = process.env): ClientConfig {
  const key = (env.COMMERCEBOOK_API_KEY ?? '').trim();
  if (!key) throw new Error('COMMERCEBOOK_API_KEY is not set. Issue a key from Agent access on CommerceBook.');
  const base = (env.COMMERCEBOOK_BASE ?? 'https://commercebook.ai').trim().replace(/\/+$/, '');
  return { base, key };
}

/** The API root: a full base ending in /api/v1 is kept; a site origin gets /api/v1 appended. */
export function apiRoot(base: string): string {
  if (/\/api\/v1$/.test(base) || /\/\.netlify\/functions\/api$/.test(base)) return base;
  return `${base}/api/v1`;
}

export class ApiClient {
  private readonly root: string;
  constructor(private readonly config: ClientConfig) {
    this.root = apiRoot(config.base);
  }

  /** The key's prefix, the only part ever shown. */
  get keyPrefix(): string {
    return this.config.key.slice(0, 13);
  }

  get baseUrl(): string {
    return this.root;
  }

  /** The headers of every call: the key when there is one, and the configured extras. */
  private headers(accept: string, json: boolean): Record<string, string> {
    return {
      ...(this.config.headers ?? {}),
      ...(this.config.key ? { authorization: `Bearer ${this.config.key}` } : {}),
      accept,
      ...(json ? { 'content-type': 'application/json' } : {}),
    };
  }

  private send(url: URL | string, init: RequestInit): Promise<Response> {
    return (this.config.fetch ?? fetch)(url, init);
  }

  async request<T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const url = new URL(`${this.root}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    const res = await this.send(url, {
      method,
      headers: this.headers('application/json', body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const requestId = res.headers.get('x-request-id');
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new ApiError(res.status, 'invalid_response', text.slice(0, 200), requestId);
    }
    if (!res.ok) {
      const e = (data ?? {}) as { error?: string; detail?: string | null; activity?: string | null; hint?: string | null };
      throw new ApiError(res.status, e.error ?? `http_${res.status}`, e.detail ?? null, requestId, e.activity ?? null, e.hint ?? null);
    }
    return data as T;
  }

  /** A GET whose answer is text (GET /instructions: text/markdown). Errors still arrive as the API's JSON. */
  async getText(path: string): Promise<string> {
    const res = await this.send(`${this.root}${path}`, { headers: this.headers('text/markdown, application/json;q=0.5', false) });
    const text = await res.text();
    if (!res.ok) {
      let e: { error?: string; detail?: string | null } = {};
      try {
        e = text ? (JSON.parse(text) as typeof e) : {};
      } catch {
        /* not JSON */
      }
      throw new ApiError(res.status, e.error ?? `http_${res.status}`, e.detail ?? null, res.headers.get('x-request-id'));
    }
    return text;
  }

  get<T = unknown>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>('GET', path, undefined, query);
  }
  post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
  put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }
  patch<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }
  del<T = unknown>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
