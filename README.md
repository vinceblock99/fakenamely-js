# fakenamely

Official JavaScript/TypeScript client and CLI for the [FakeName Generator API](https://fakenamely.com/api) — free, keyless, CORS-open fictional identities, addresses and names for tests, fixtures and demos.

No account, no API key, no rate-limit dashboard to check. It is a GET request.

```bash
npm install fakenamely
```

```ts
import { FakeNamely } from "fakenamely";

const fn = new FakeNamely();

// A committable fixture: the same seed always returns the same records.
const users = await fn.identity({ count: 25, country: "de", seed: "checkout-suite-v3" });

// Addresses whose city, region and postal code genuinely agree.
const addresses = await fn.address({ state: "CA", count: 10 });

// Names from a country's own pools, not transliterated English ones.
const names = await fn.name({ country: "jp", count: 10 });
```

Or from the terminal, without installing anything:

```bash
npx fakenamely name --country jp --count 10
npx fakenamely address --state CA --count 5 --format csv > addresses.csv
npx fakenamely identity --seed checkout-suite-v3 --count 3 > fixtures.json
```

## Why a seed matters

A suite that generates fresh random data on every run has a failure mode of its own: when it fails, you cannot reproduce it. Every generating endpoint accepts a `seed`, and the same seed with the same parameters returns byte-identical records — so a fixture can be fetched once, committed next to the test that reads it, and regenerated exactly when it needs to change.

```ts
const a = await fn.address({ seed: "invoice-tests", count: 5 });
const b = await fn.address({ seed: "invoice-tests", count: 5 });
// a and b are identical, today and next year.
```

When you generated something random and then decided to keep it, the seed comes back in `meta`:

```ts
const { data, meta } = await fn.request("identity", { count: 10 });
console.log(meta?.seed); // pass this next time to get the same ten back
```

## What you get

| Method | Endpoint | Returns |
| --- | --- | --- |
| `fn.identity(params)` | `/api/v1/identity` | Full profiles: name, address, contact, personal, physical, finance, vehicle |
| `fn.address(params)` | `/api/v1/address` | Street, city, region, postal code, country, coordinates |
| `fn.name(params)` | `/api/v1/name` | Full, first, middle, last, prefix, initials |
| `fn.field(params)` | `/api/v1/field` | One field per record: `name`, `phone`, `email`, `username`, `password`, `guid`, `zip`, `coordinates`, `company`, `imei` |
| `fn.imei(params)` | `/api/v1/imei` | Luhn-valid test IMEIs, split into RBI, TAC, serial and check digit |
| `fn.validate(params)` | `/api/v1/validate` | Checksum/format verdicts: `luhn`, `card`, `iban`, `aba`, `vin`, `password` |
| `fn.rows(endpoint, params)` | any | Flat, column-selected rows via `fields: "fullName,email,city"` |
| `fn.export(endpoint, params)` | any | CSV or SQL as text |
| `fn.request(endpoint, params)` | any | The raw envelope, including `meta` |

Common parameters: `count` (1–100; `imei` allows 1–1000), `seed`, `country` (slug or ISO 3166-1 alpha-2), `gender`, `state` (US only). 38 countries are supported.

Larger sets come from the [bulk exporter](https://fakenamely.com/bulk), which writes up to 100,000 rows as CSV, JSON or SQL.

## What the data actually is

The point of this data is that it passes validation without describing anyone. That means some fields are real and some are invented, and it is worth knowing which:

- **Real:** the city, its region, and a postal code genuinely issued for that place. US postal codes come from the [GeoNames](https://download.geonames.org/export/zip/) dataset (CC BY 4.0), filtered to codes that take ordinary residential street mail. US and Canadian telephone area codes come from that city's own rate centre.
- **Invented:** the street name and the house number. A generated address is region-valid and resolves to no building.
- **Reserved by design:** US phone numbers come from the 555-0100–555-0199 block the North American Numbering Plan keeps for fiction. Email addresses use `example.com`, `example.net` and `example.org` — RFC 2606 reserved names that publish a null MX record, so they accept no mail at all.
- **Never real:** national-ID placeholders are returned masked and use never-issued ranges. Payment-card numbers are built on published sandbox test prefixes with a valid Luhn check digit, so a validator accepts the scheme while no bank issued the number.
- **Approximate:** coordinates are a random point near the city centre, not at the address.

The full account of what is real, what is invented, and what is known to be wrong is published at [fakenamely.com/methodology](https://fakenamely.com/methodology).

## What it must not be used for

This data exists to make software fail in a test environment instead of in front of a customer. It is for fixtures, QA, seeding, demos and screenshots.

It is not for identity verification or KYC, not for shipping or billing, not for impersonating a real person, not for creating accounts that evade a ban or a trial limit, and not for any document intended to pass as genuine. Generated records identify nobody, which is exactly why they cannot stand in for an identity. See the [terms of use](https://fakenamely.com/terms).

## Errors

Every failure raises a `FakeNamelyError` carrying the server's own message, the HTTP `status` and the `endpoint`. A `status` of `0` means the request never reached the server — a bad parameter caught locally, or a transport failure — so a network problem is distinguishable from a rejected request.

```ts
import { FakeNamely, FakeNamelyError } from "fakenamely";

try {
  await fn.identity({ count: 500 });
} catch (error) {
  if (error instanceof FakeNamelyError) {
    console.error(error.status, error.message);
  }
}
```

## Runtime support

Node 18+, Deno, Bun, browsers and edge runtimes. The client uses the global `fetch` and ships no dependencies; pass your own implementation as `options.fetch` if you need to.

```ts
const fn = new FakeNamely({
  baseUrl: "https://fakenamely.com", // default
  timeoutMs: 15_000,                 // default
});
```

## Development

```bash
npm install
npm test        # unit tests, all against a stubbed fetch — no network
npm run build
```

Tests never call the live API: a suite that depends on the network fails when the network does, and would put CI traffic on a free service.

## License

MIT © [fakenamely.com](https://fakenamely.com)
