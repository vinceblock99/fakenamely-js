import type {
  Address,
  AddressParams,
  ApiEnvelope,
  FieldParams,
  FieldValue,
  Format,
  Identity,
  IdentityParams,
  Imei,
  NameParams,
  PersonName,
  ResponseMeta,
  Row,
  ValidateParams,
  ValidationResult,
} from "./types.js";

export * from "./types.js";

const DEFAULT_BASE_URL = "https://fakenamely.com";

/** Anything that can be flattened into a query string. */
type QueryParams = Readonly<Record<string, unknown>>;

/** Per-endpoint ceilings, as published in the API documentation. */
const MAX_COUNT: Readonly<Record<string, number>> = {
  identity: 100,
  address: 100,
  name: 100,
  field: 100,
  imei: 1000,
};

/**
 * Thrown for anything the caller can act on: a rejected parameter, a rate-limit
 * response, a transport failure. `status` is 0 when the request never reached
 * the server, so a caller can tell a network problem from a 400.
 */
export class FakenamelyError extends Error {
  readonly status: number;
  readonly endpoint: string;

  constructor(message: string, status: number, endpoint: string) {
    super(message);
    this.name = "FakenamelyError";
    this.status = status;
    this.endpoint = endpoint;
  }
}

export interface ClientOptions {
  /** Override for self-hosting or testing. Defaults to https://fakenamely.com */
  readonly baseUrl?: string;
  /** Milliseconds before the request is aborted. Defaults to 15000. */
  readonly timeoutMs?: number;
  /** Injected for tests; defaults to the global fetch. */
  readonly fetch?: typeof globalThis.fetch;
  /** Sent as User-Agent where the runtime allows it. */
  readonly userAgent?: string;
}

/**
 * Client for the Fakenamely API — fictional identities, addresses and
 * names for tests, fixtures and demos.
 *
 * No API key exists to pass: the service is keyless and CORS-open, so this
 * works from Node, Deno, Bun, a browser, an edge runtime, or a test file.
 *
 * Seeds are the reason to prefer this over generating data inline. The same
 * seed and parameters always return byte-identical records, so a fixture can be
 * fetched once, committed, and regenerated exactly when it needs to change.
 */
export class Fakenamely {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly userAgent: string;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 15_000;
    const impl = options.fetch ?? globalThis.fetch;
    if (typeof impl !== "function") {
      throw new FakenamelyError(
        "No fetch implementation found. Use Node 18+, or pass one as options.fetch.",
        0,
        "constructor",
      );
    }
    // Bound so a runtime that checks the receiver (undici does) still accepts it.
    this.fetchImpl = impl.bind(globalThis);
    this.userAgent = options.userAgent ?? "fakenamely-js";
  }

  /** Complete fictional profiles: name, address, contact, personal, finance. */
  identity(params: IdentityParams = {}): Promise<Identity[]> {
    return this.list<Identity>("identity", params);
  }

  /** Postal addresses: a real locality, a real postal code, an invented street. */
  address(params: AddressParams = {}): Promise<Address[]> {
    return this.list<Address>("address", params);
  }

  /** Personal names drawn from the requested country's own name pools. */
  name(params: NameParams = {}): Promise<PersonName[]> {
    return this.list<PersonName>("name", params);
  }

  /** One field per record — phone, email, zip, coordinates, company, imei… */
  field(params: FieldParams): Promise<FieldValue[]> {
    return this.list<FieldValue>("field", params);
  }

  /** Luhn-valid IMEI numbers built on reporting-body identifiers. */
  imei(params: { count?: number; seed?: string } = {}): Promise<Imei[]> {
    return this.list<Imei>("imei", params);
  }

  /**
   * Check a value against a published format or checksum rule. Nothing you
   * submit here is logged or stored, and a `true` verdict means the value is
   * well-formed — never that an account, card or vehicle exists.
   */
  async validate(params: ValidateParams): Promise<ValidationResult> {
    const { data } = await this.request<ValidationResult>("validate", params);
    return data;
  }

  /**
   * Flat, column-selected rows instead of nested objects — the same column set
   * the bulk exporter uses, e.g. `fields: "fullName,email,city,postalCode"`.
   */
  rows(
    endpoint: "identity" | "address" | "name",
    params: (IdentityParams | AddressParams | NameParams) & { fields: string },
  ): Promise<Row[]> {
    return this.list<Row>(endpoint, params);
  }

  /**
   * CSV or SQL text rather than JSON. Returned verbatim, because the point of
   * asking for CSV is to write it somewhere, not to parse it back.
   */
  async export(
    endpoint: "identity" | "address" | "name",
    params: (IdentityParams | AddressParams | NameParams) & {
      format: Exclude<Format, "json">;
    },
  ): Promise<string> {
    this.assertCount(endpoint, params.count);
    const response = await this.send(endpoint, params);
    const text = await response.text();
    if (!response.ok) {
      throw new FakenamelyError(text.slice(0, 300), response.status, endpoint);
    }
    return text;
  }

  /**
   * The escape hatch: the full envelope, including `meta`. Every method above
   * discards `meta` for ergonomics, and `meta` is where the seed that produced
   * a batch is reported — which is what you want when the batch was random and
   * you have just decided to keep it.
   */
  async request<T>(
    endpoint: string,
    params: QueryParams = {},
  ): Promise<{ data: T; meta?: ResponseMeta }> {
    this.assertCount(endpoint, params.count as number | undefined);
    const response = await this.send(endpoint, params);

    let body: ApiEnvelope<T>;
    try {
      body = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new FakenamelyError(
        `Expected JSON from /api/v1/${endpoint}, got ${response.status} ${response.statusText}.`,
        response.status,
        endpoint,
      );
    }

    if (!response.ok || !body.success || body.data === null) {
      throw new FakenamelyError(
        body.error ?? `Request to /api/v1/${endpoint} failed with ${response.status}.`,
        response.status,
        endpoint,
      );
    }

    return { data: body.data, meta: body.meta };
  }

  private async list<T>(
    endpoint: string,
    params: QueryParams,
  ): Promise<T[]> {
    const { data } = await this.request<T[]>(endpoint, params);
    return data;
  }

  /**
   * Reject an impossible count before spending a round trip on it. The server
   * enforces these too; catching it here just turns a 400 into a stack trace
   * that points at the caller's own line.
   */
  private assertCount(endpoint: string, count: unknown): void {
    if (count === undefined) return;
    const max = MAX_COUNT[endpoint] ?? 100;
    if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > max) {
      throw new FakenamelyError(
        `count must be an integer between 1 and ${max} for /${endpoint} (received ${String(count)}). For larger sets use the bulk exporter at ${this.baseUrl}/bulk.`,
        0,
        endpoint,
      );
    }
  }

  private send(
    endpoint: string,
    params: QueryParams,
  ): Promise<Response> {
    const url = new URL(`${this.baseUrl}/api/v1/${endpoint}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    return this.fetchImpl(url.toString(), {
      method: "GET",
      headers: { accept: "application/json", "user-agent": this.userAgent },
      signal: controller.signal,
    })
      .catch((cause: unknown) => {
        const reason = cause instanceof Error ? cause.message : String(cause);
        throw new FakenamelyError(
          `Request to /api/v1/${endpoint} did not complete: ${reason}`,
          0,
          endpoint,
        );
      })
      .finally(() => clearTimeout(timer));
  }
}

/** Convenience factory for callers who would rather not write `new`. */
export const createClient = (options?: ClientOptions): Fakenamely =>
  new Fakenamely(options);
