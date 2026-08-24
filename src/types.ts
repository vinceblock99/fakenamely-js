/**
 * Response shapes for the Fakenamely API.
 *
 * These are written against the published OpenAPI document at
 * https://fakenamely.com/api/openapi.json and verified against live responses.
 * Where the API omits a field rather than guessing at it — `phoneE164` is the
 * documented example, dropped whenever the number cannot be checked against the
 * country's published numbering plan — the type is optional here too.
 */

/** Every JSON endpoint answers with this envelope. */
export interface ApiEnvelope<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: string | null;
  readonly meta?: ResponseMeta;
}

export interface ResponseMeta {
  readonly count: number;
  /** The seed used. "n/a" on the validation endpoint, which generates nothing. */
  readonly seed: string;
  /** True when the same request returns byte-identical records. */
  readonly deterministic: boolean;
  readonly country?: string;
  readonly fictional?: boolean;
  readonly kind?: string;
  readonly disclaimer: string;
  readonly docs: string;
}

export interface PersonName {
  readonly full: string;
  readonly first: string;
  /** Empty for locales whose names carry no middle name. */
  readonly middle: string;
  readonly last: string;
  readonly prefix: string;
  readonly initials: string;
}

export interface Address {
  /** House number and street. Both are invented; the locality is real. */
  readonly street: string;
  readonly city: string;
  /** What this country calls the subdivision: State, Province, Prefecture… */
  readonly regionLabel: string;
  readonly stateOrRegion: string;
  /** Empty outside the countries that publish a short subdivision code. */
  readonly stateCode: string;
  /** Empty for Hong Kong, which has no postal code system at all. */
  readonly postalCode: string;
  readonly country: string;
  readonly countryCode: string;
  /** A point near the city centre, not at the street address. */
  readonly geo: { readonly lat: number; readonly lng: number };
}

export interface Contact {
  readonly phone: string;
  /** Omitted when the number cannot be validated against the numbering plan. */
  readonly phoneE164?: string;
  readonly email: string;
  readonly username: string;
}

export interface Online {
  readonly password: string;
  readonly website: string;
  readonly userAgent: string;
  readonly browserColor: string;
  readonly guid: string;
}

export interface Personal {
  readonly birthday: string;
  readonly birthdayLong: string;
  readonly age: number;
  readonly zodiac: string;
  /** Only ever the masked form; the API never returns an unmasked identifier. */
  readonly nationalId: { readonly masked: string };
  readonly nationalIdLabel: string;
}

export interface Physical {
  readonly heightCm: number;
  readonly heightImperial: string;
  readonly weightKg: number;
  readonly weightImperial: string;
  readonly bloodType: string;
  readonly hairColor: string;
  readonly eyeColor: string;
}

export interface Finance {
  readonly creditCard: {
    readonly type: string;
    /** Built on a published sandbox test prefix; no bank issued it. */
    readonly number: string;
    readonly cvv: string;
    readonly expiry: string;
  };
  readonly currency: string;
  readonly tracking: { readonly ups: string };
}

export interface Vehicle {
  readonly make: string;
  readonly model: string;
  readonly year: number;
  readonly vin: string;
  readonly plate: string;
}

export interface Identity {
  readonly seed: string;
  readonly sex: "male" | "female";
  readonly name: PersonName;
  readonly address: Address;
  readonly contact: Contact;
  readonly online: Online;
  readonly personal: Personal;
  readonly physical: Physical;
  readonly finance: Finance;
  readonly vehicle: Vehicle;
  readonly favoriteColor: string;
  readonly meta: { readonly fake: true; readonly disclaimer: string };
}

export type FieldType =
  | "name"
  | "phone"
  | "email"
  | "username"
  | "password"
  | "guid"
  | "zip"
  | "coordinates"
  | "company"
  | "imei";

export interface FieldValue {
  readonly type: FieldType;
  readonly value: string;
  /** Surrounding context kept out of the value itself, e.g. a ZIP's city. */
  readonly context?: Readonly<Record<string, string>>;
}

export interface Imei {
  readonly imei: string;
  readonly rbi: string;
  readonly tac: string;
  readonly serial: string;
  readonly checkDigit: string;
  readonly body: string;
}

export type ValidatorType = "luhn" | "card" | "iban" | "aba" | "vin" | "password";

export interface ValidationResult {
  readonly type: ValidatorType;
  readonly input: string;
  readonly valid: boolean;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** A flat, column-selected row, returned when `fields` is supplied. */
export type Row = Readonly<Record<string, unknown>>;

export type Format = "json" | "csv" | "sql";
export type Gender = "male" | "female";

/**
 * Request parameters are type ALIASES rather than interfaces on purpose: only
 * an alias gets an implicit index signature, and without one none of these can
 * be passed to the internal query-string builder, which is keyed by string.
 */
export type CommonParams = {
  /** 1-100 for every endpoint except imei, which allows 1-1000. */
  readonly count?: number;
  /** Any string. The same seed returns byte-identical records. */
  readonly seed?: string;
};

export type IdentityParams = CommonParams & {
  /** Country slug or ISO 3166-1 alpha-2 code, e.g. "germany" or "de". */
  readonly country?: string;
  readonly gender?: Gender;
  /** US state slug or two-letter code. Only valid for the United States. */
  readonly state?: string;
};

export type AddressParams = CommonParams & {
  readonly country?: string;
  readonly state?: string;
};

export type NameParams = CommonParams & {
  readonly country?: string;
  readonly gender?: Gender;
};

export type FieldParams = CommonParams & {
  readonly type: FieldType;
  readonly country?: string;
};

export type ValidateParams = {
  readonly type: ValidatorType;
  readonly value: string;
};
