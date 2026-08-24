import { describe, expect, it, vi } from "vitest";
import { Fakenamely, FakenamelyError } from "../src/index.js";

/**
 * Every test here runs against a stubbed fetch. Hitting the live API from a
 * test suite would make the suite fail when the network does, and would put CI
 * traffic on a free service — neither of which tells anyone whether this client
 * builds the right URL.
 */
const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const okEnvelope = (data: unknown) => ({
  success: true,
  data,
  error: null,
  meta: {
    count: Array.isArray(data) ? data.length : 1,
    seed: "seed-1",
    deterministic: true,
    disclaimer: "Randomly generated fictional data…",
    docs: "https://fakenamely.com/api",
  },
});

const stub = (body: unknown, status = 200) => {
  const fetchMock = vi.fn(async () => jsonResponse(body, status));
  const client = new Fakenamely({ fetch: fetchMock as unknown as typeof fetch });
  return { client, fetchMock };
};

const calledUrl = (fetchMock: ReturnType<typeof vi.fn>): URL =>
  new URL(fetchMock.mock.calls[0][0] as string);

describe("URL construction", () => {
  it("hits the documented endpoint and passes only the params given", async () => {
    const { client, fetchMock } = stub(okEnvelope([{ full: "Ada L. Byron" }]));

    await client.name({ country: "jp", count: 10, gender: "female" });

    const url = calledUrl(fetchMock);
    expect(url.pathname).toBe("/api/v1/name");
    expect(url.searchParams.get("country")).toBe("jp");
    expect(url.searchParams.get("count")).toBe("10");
    expect(url.searchParams.get("gender")).toBe("female");
    // Absent params must not become "undefined" in the query string.
    expect(url.searchParams.has("seed")).toBe(false);
  });

  it("honours a custom base URL without doubling the slash", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(okEnvelope([])));
    const client = new Fakenamely({
      baseUrl: "https://example.test/",
      fetch: fetchMock as unknown as typeof fetch,
    });

    await client.address({});

    expect(calledUrl(fetchMock).toString()).toBe("https://example.test/api/v1/address");
  });

  it("sends a seed through unchanged, since reproducibility depends on it", async () => {
    const { client, fetchMock } = stub(okEnvelope([]));
    await client.identity({ seed: "checkout suite/v3", count: 2 });
    expect(calledUrl(fetchMock).searchParams.get("seed")).toBe("checkout suite/v3");
  });
});

describe("responses", () => {
  it("unwraps the envelope and returns the records", async () => {
    const { client } = stub(
      okEnvelope([{ type: "zip", value: "43215", context: { state: "Ohio" } }]),
    );

    const [field] = await client.field({ type: "zip" });

    expect(field.value).toBe("43215");
    expect(field.context?.state).toBe("Ohio");
  });

  it("exposes meta through request(), which is where the seed comes back", async () => {
    const { client } = stub(okEnvelope([{ imei: "004999011461786" }]));

    const { data, meta } = await client.request<{ imei: string }[]>("imei", { count: 1 });

    expect(data).toHaveLength(1);
    expect(meta?.seed).toBe("seed-1");
  });

  it("returns validation verdicts as a single object, not an array", async () => {
    const { client } = stub(
      okEnvelope({ type: "iban", input: "GB82…", valid: true, details: { countryCode: "GB" } }),
    );

    const result = await client.validate({ type: "iban", value: "GB82…" });

    expect(result.valid).toBe(true);
    expect(result.type).toBe("iban");
  });

  it("returns csv and sql exports as text, verbatim", async () => {
    const fetchMock = vi.fn(
      async () => new Response("fullName,city\nAda L. Byron,Columbus\n", { status: 200 }),
    );
    const client = new Fakenamely({ fetch: fetchMock as unknown as typeof fetch });

    const csv = await client.export("identity", { format: "csv", count: 1 });

    expect(csv).toContain("fullName,city");
    expect(calledUrl(fetchMock).searchParams.get("format")).toBe("csv");
  });
});

describe("errors", () => {
  it("raises the server's own message, with its status attached", async () => {
    const { client } = stub(
      { success: false, data: null, error: 'Unknown "type": "nope".' },
      400,
    );

    await expect(client.field({ type: "nope" as never })).rejects.toMatchObject({
      name: "FakenamelyError",
      status: 400,
      endpoint: "field",
    });
  });

  it("rejects an out-of-range count before spending a request on it", async () => {
    const { client, fetchMock } = stub(okEnvelope([]));

    await expect(client.identity({ count: 500 })).rejects.toBeInstanceOf(FakenamelyError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("allows imei its higher ceiling, and only imei", async () => {
    const { client, fetchMock } = stub(okEnvelope([]));

    await client.imei({ count: 1000 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(client.address({ count: 1000 })).rejects.toBeInstanceOf(FakenamelyError);
  });

  it("reports a transport failure as status 0, so it is distinguishable from a 400", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("getaddrinfo ENOTFOUND");
    });
    const client = new Fakenamely({ fetch: fetchMock as unknown as typeof fetch });

    await expect(client.name({})).rejects.toMatchObject({ status: 0 });
  });

  it("does not treat a 200 with success:false as a success", async () => {
    const { client } = stub({ success: false, data: null, error: "rate limited" }, 200);

    await expect(client.address({})).rejects.toThrow(/rate limited/);
  });
});
