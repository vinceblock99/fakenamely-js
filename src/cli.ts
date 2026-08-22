#!/usr/bin/env node
/**
 * fakenamely — fictional test data from the command line.
 *
 * Deliberately thin: parse flags, call the client, print. Anything cleverer
 * (piping into a database, templating) is better done by the caller, and a CLI
 * that tries to do it becomes a worse version of the tools they already have.
 */
import { FakeNamely, FakeNamelyError } from "./index.js";
import type { FieldType, ValidatorType } from "./types.js";

const COMMANDS = ["identity", "address", "name", "field", "imei", "validate"] as const;
type Command = (typeof COMMANDS)[number];

/** Flags shared by the generating commands, already parsed into their types. */
type CliCommon = {
  readonly count?: number;
  readonly seed?: string;
  readonly country?: string;
  readonly gender?: "male" | "female";
  readonly state?: string;
  readonly fields?: string;
};

const USAGE = `fakenamely — fictional identities, addresses and names for tests and demos

Usage
  fakenamely <command> [options]

Commands
  identity      Complete fictional profiles
  address       Postal addresses (real locality, invented street)
  name          Personal names from a country's own name pools
  field         One field per record (--type)
  imei          Luhn-valid test IMEI numbers
  validate      Check a value against a checksum or format rule

Options
  --count <n>       How many records (1-100; imei allows 1-1000)
  --seed <string>   Same seed, same records — commit the result as a fixture
  --country <slug>  Country slug or ISO 3166-1 alpha-2 code, e.g. de
  --gender <g>      male | female
  --state <s>       US state slug or two-letter code
  --type <t>        Field type, or validator type for the validate command
  --value <v>       The value to validate
  --fields <list>   Comma-separated columns; returns flat rows
  --format <f>      json (default) | csv | sql
  --base-url <url>  Point at another host
  --help            Show this message

Examples
  fakenamely name --country jp --count 10
  fakenamely address --state CA --count 5 --format csv
  fakenamely identity --seed checkout-suite-v3 --count 3 > fixtures.json
  fakenamely field --type zip --count 5
  fakenamely validate --type iban --value GB82WEST12345698765432

The data is fictional and is for testing, QA, demos and seeding. It is never for
fraud, impersonation, shipping, billing, KYC or any real identity.
Docs: https://fakenamely.com/api`;

const parseArgs = (argv: readonly string[]): Record<string, string | true> => {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
};

const asNumber = (value: string | true | undefined): number | undefined => {
  if (value === undefined || value === true) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new FakeNamelyError(`"${value}" is not a number.`, 0, "cli");
  }
  return n;
};

const asString = (value: string | true | undefined): string | undefined =>
  value === undefined || value === true ? undefined : value;

const run = async (argv: readonly string[]): Promise<number> => {
  const [command, ...rest] = argv;
  const flags = parseArgs(rest);

  if (!command || command === "--help" || flags.help) {
    console.log(USAGE);
    return command ? 0 : 1;
  }

  if (!(COMMANDS as readonly string[]).includes(command)) {
    console.error(`Unknown command "${command}". Try one of: ${COMMANDS.join(", ")}`);
    return 1;
  }

  const client = new FakeNamely({ baseUrl: asString(flags["base-url"]) });
  const common = {
    count: asNumber(flags.count),
    seed: asString(flags.seed),
    country: asString(flags.country),
    gender: asString(flags.gender) as "male" | "female" | undefined,
    state: asString(flags.state),
    fields: asString(flags.fields),
  };
  const format = asString(flags.format);

  // csv and sql come back as text, so they bypass the typed helpers entirely.
  if (format && format !== "json") {
    if (command !== "identity" && command !== "address" && command !== "name") {
      console.error(`--format ${format} is only available for identity, address and name.`);
      return 1;
    }
    const text = await client.export(command, {
      ...common,
      format: format as "csv" | "sql",
    });
    console.log(text.trimEnd());
    return 0;
  }

  const result = await runJson(client, command as Command, common, flags);
  console.log(JSON.stringify(result, null, 2));
  return 0;
};

const runJson = async (
  client: FakeNamely,
  command: Command,
  common: CliCommon,
  flags: Record<string, string | true>,
): Promise<unknown> => {
  if (command === "validate") {
    const type = asString(flags.type);
    const value = asString(flags.value);
    if (!type || !value) {
      throw new FakeNamelyError(
        "validate needs both --type and --value, e.g. --type iban --value GB82WEST12345698765432",
        0,
        "cli",
      );
    }
    return client.validate({ type: type as ValidatorType, value });
  }

  if (command === "field") {
    const type = asString(flags.type);
    if (!type) {
      throw new FakeNamelyError(
        "field needs --type, e.g. --type zip. Supported: name, phone, email, username, password, guid, zip, coordinates, company, imei",
        0,
        "cli",
      );
    }
    return client.field({
      type: type as FieldType,
      count: common.count,
      seed: common.seed,
      country: common.country,
    });
  }

  if (command === "imei") {
    return client.imei({ count: common.count, seed: common.seed });
  }

  if (common.fields) {
    return client.rows(command, { ...common, fields: common.fields });
  }

  if (command === "identity") return client.identity(common);
  if (command === "address") return client.address(common);
  return client.name(common);
};

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
