import { createHash } from "node:crypto";
import bs58 from "bs58";

/**
 * A small IDL-driven borsh decoder.
 *
 * Programs publish their interface as an Anchor IDL. Two formats are in the wild:
 * the current spec (snake_case names, explicit `discriminator` arrays, `pubkey`, `defined: { name }`)
 * and the legacy one (camelCase names, discriminators derived from sha256, `publicKey`, `defined: "Name"`).
 * Both are normalized here, and every decoded name is camelCase so recipes read the same way for every program.
 *
 * Two non-Anchor programs (Raydium AMM v4 and the SPL token-swap fork FluxBeam runs) tag instructions with
 * a single byte instead of 8. Their IDLs set `"discriminator": "u8-index"` at the top level (see idl/).
 */

type IdlType =
  | string
  | { option: IdlType }
  | { coption: IdlType }
  | { vec: IdlType }
  | { array: [IdlType, number] }
  | { defined: string | { name: string } };

type IdlField = { name: string; type: IdlType };
type IdlTypeDef = {
  name: string;
  type:
    | { kind: "struct"; fields?: Array<IdlField | IdlType> }
    | { kind: "enum"; variants: Array<{ name: string; fields?: Array<IdlField | IdlType> }> }
    | { kind: "type"; alias: IdlType };
};
type IdlAccountItem = { name: string; accounts?: IdlAccountItem[] };
type IdlInstruction = { name: string; discriminator?: number[]; accounts: IdlAccountItem[]; args: IdlField[] };

export type Idl = {
  address?: string;
  metadata?: { name?: string; spec?: string; address?: string };
  name?: string;
  discriminator?: "u8-index";
  instructions: IdlInstruction[];
  accounts?: Array<{ name: string; discriminator?: number[]; type?: IdlTypeDef["type"] }>;
  events?: Array<{ name: string; discriminator?: number[]; fields?: IdlField[] }>;
  types?: IdlTypeDef[];
};

/** Decoded borsh values: small integers are numbers, 64-bit and wider are bigint, public keys are base58. */
export type Value = number | bigint | boolean | string | null | Value[] | { [key: string]: Value };
export type Fields = { [key: string]: Value };

export type DecodedInstruction = {
  name: string;
  args: Fields;
  /** IDL account name (camelCase) → address. Accounts past the IDL list are in `remaining`. */
  accounts: Record<string, string>;
  remaining: string[];
};

export type DecodedRecord = { name: string; data: Fields };

export const camel = (name: string) => name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const snake = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const sighash = (preimage: string) => createHash("sha256").update(preimage).digest().subarray(0, 8);
const key = (bytes: Uint8Array | number[]) => Buffer.from(bytes).toString("hex");

/** Anchor's event-CPI prefix: events emitted with `emit_cpi!` arrive as a self-invoke whose data starts with these 8 bytes. */
export const EVENT_IX_TAG = Buffer.from("e445a52e51cb9a1d", "hex");

class Reader {
  offset = 0;
  constructor(readonly buf: Buffer) {}

  private take(n: number): Buffer {
    if (this.offset + n > this.buf.length) throw new RangeError(`read past end (${this.offset}+${n} > ${this.buf.length})`);
    const slice = this.buf.subarray(this.offset, this.offset + n);
    this.offset += n;
    return slice;
  }

  u8 = () => this.take(1).readUInt8(0);
  u16 = () => this.take(2).readUInt16LE(0);
  u32 = () => this.take(4).readUInt32LE(0);
  i8 = () => this.take(1).readInt8(0);
  i16 = () => this.take(2).readInt16LE(0);
  i32 = () => this.take(4).readInt32LE(0);
  u64 = () => this.take(8).readBigUInt64LE(0);
  i64 = () => this.take(8).readBigInt64LE(0);
  f32 = () => this.take(4).readFloatLE(0);
  f64 = () => this.take(8).readDoubleLE(0);
  u128 = () => {
    const b = this.take(16);
    return b.readBigUInt64LE(0) | (b.readBigUInt64LE(8) << 64n);
  };
  i128 = () => {
    const b = this.take(16);
    return BigInt.asIntN(128, b.readBigUInt64LE(0) | (b.readBigUInt64LE(8) << 64n));
  };
  bytes = (n: number) => Buffer.from(this.take(n));
}

export type Coder = ReturnType<typeof createCoder>;

export function createCoder(idl: Idl) {
  const types = new Map((idl.types ?? []).map((t) => [t.name, t]));
  // Legacy IDLs define account layouts inline on the account entry instead of under `types`.
  for (const a of idl.accounts ?? []) if (a.type && !types.has(a.name)) types.set(a.name, { name: a.name, type: a.type });
  const programId = idl.address ?? idl.metadata?.address ?? "";

  const readType = (r: Reader, type: IdlType): Value => {
    if (typeof type === "string") {
      switch (type) {
        case "bool":
          return r.u8() !== 0;
        case "u8":
          return r.u8();
        case "i8":
          return r.i8();
        case "u16":
          return r.u16();
        case "i16":
          return r.i16();
        case "u32":
          return r.u32();
        case "i32":
          return r.i32();
        case "f32":
          return r.f32();
        case "u64":
          return r.u64();
        case "i64":
          return r.i64();
        case "f64":
          return r.f64();
        case "u128":
          return r.u128();
        case "i128":
          return r.i128();
        case "pubkey":
        case "publicKey":
          return bs58.encode(r.bytes(32));
        case "string":
          return r.bytes(r.u32()).toString("utf8");
        case "bytes":
          return r.bytes(r.u32()).toString("hex");
        default:
          throw new Error(`unsupported IDL type ${type}`);
      }
    }
    if ("option" in type) return r.u8() === 0 ? null : readType(r, type.option);
    if ("coption" in type) return r.u32() === 0 ? (r.offset += size(type.coption), null) : readType(r, type.coption);
    if ("vec" in type) return Array.from({ length: r.u32() }, () => readType(r, type.vec));
    if ("array" in type) {
      const [inner, length] = type.array;
      // Fixed byte arrays are almost always padding or raw hashes: keep them compact as hex.
      if (inner === "u8") return r.bytes(length).toString("hex");
      return Array.from({ length }, () => readType(r, inner));
    }
    return readDefined(r, typeof type.defined === "string" ? type.defined : type.defined.name);
  };

  const readFields = (r: Reader, fields: Array<IdlField | IdlType> = []): Fields | Value[] => {
    const named = fields.every((f) => typeof f === "object" && f !== null && "name" in f && "type" in f);
    if (named) {
      const out: Fields = {};
      for (const f of fields as IdlField[]) out[camel(f.name)] = readType(r, f.type);
      return out;
    }
    return (fields as IdlType[]).map((t) => readType(r, t));
  };

  const readDefined = (r: Reader, name: string): Value => {
    const def = types.get(name);
    if (!def) throw new Error(`type ${name} is not in the IDL`);
    const t = def.type;
    if (t.kind === "struct") return readFields(r, t.fields);
    if (t.kind === "type") return readType(r, t.alias);
    const variant = t.variants[r.u8()];
    if (!variant) throw new Error(`bad variant for enum ${name}`);
    if (!variant.fields?.length) return camel(variant.name);
    return { [camel(variant.name)]: readFields(r, variant.fields) };
  };

  /** Fixed byte size of a type (for skipping unset COption payloads and computing memcmp offsets). */
  const size = (type: IdlType): number => {
    const widths: Record<string, number> = { u8: 1, i8: 1, bool: 1, u16: 2, i16: 2, u32: 4, i32: 4, f32: 4, u64: 8, i64: 8, f64: 8, u128: 16, i128: 16, pubkey: 32, publicKey: 32 };
    if (typeof type === "string") {
      const width = widths[type];
      if (width === undefined) throw new Error(`${type} has no fixed size`);
      return width;
    }
    if ("array" in type) return size(type.array[0]) * type.array[1];
    if ("defined" in type) {
      const def = types.get(typeof type.defined === "string" ? type.defined : type.defined.name);
      if (def?.type.kind === "struct") return ((def.type.fields ?? []) as IdlField[]).reduce((sum, f) => sum + size(f.type), 0);
      if (def?.type.kind === "type") return size(def.type.alias);
    }
    throw new Error("variable-size type");
  };

  // ---- discriminators -------------------------------------------------------
  const indexTagged = idl.discriminator === "u8-index";
  const instructionByTag = new Map<string, IdlInstruction>();
  for (const [i, ix] of idl.instructions.entries()) {
    const disc = indexTagged ? [i] : (ix.discriminator ?? [...sighash(`global:${snake(ix.name)}`)]);
    instructionByTag.set(key(disc), ix);
  }
  const tagLength = indexTagged ? 1 : 8;

  const eventByTag = new Map(
    (idl.events ?? []).map((e) => {
      // Legacy IDLs keep event fields on the event; the current spec points at a type with the same name.
      const fields = e.fields ?? (types.get(e.name)?.type as { fields?: IdlField[] } | undefined)?.fields ?? [];
      return [key(e.discriminator ?? sighash(`event:${e.name}`)), { name: e.name, fields }] as const;
    }),
  );

  const accountByTag = new Map(
    (idl.accounts ?? []).map((a) => {
      const type = a.type ?? types.get(a.name)?.type;
      return [key(a.discriminator ?? sighash(`account:${a.name}`)), { name: a.name, type }] as const;
    }),
  );

  const flattenAccounts = (items: IdlAccountItem[]): string[] =>
    items.flatMap((a) => (a.accounts ? flattenAccounts(a.accounts) : [camel(a.name)]));
  const accountNames = new Map(idl.instructions.map((ix) => [ix, flattenAccounts(ix.accounts)]));

  return {
    programId,
    name: idl.metadata?.name ?? idl.name ?? "program",

    /** Decodes instruction data. Returns undefined for unknown discriminators (newer program versions add instructions). */
    instruction(data: Buffer, accounts: string[] = []): DecodedInstruction | undefined {
      const ix = instructionByTag.get(key(data.subarray(0, tagLength)));
      if (!ix) return undefined;
      const r = new Reader(data.subarray(tagLength));
      const args: Fields = {};
      try {
        for (const arg of ix.args) args[camel(arg.name)] = readType(r, arg.type);
      } catch {
        // Older clients send fewer trailing args than the current IDL lists (e.g. an optional flag added later).
      }
      const names = accountNames.get(ix) ?? [];
      const named: Record<string, string> = {};
      for (const [i, n] of names.entries()) {
        const address = accounts[i];
        if (address) named[n] = address;
      }
      return { name: camel(ix.name), args, accounts: named, remaining: accounts.slice(names.length) };
    },

    /** Decodes an event body: 8-byte event discriminator, then borsh fields. */
    event(data: Buffer): DecodedRecord | undefined {
      const e = eventByTag.get(key(data.subarray(0, 8)));
      if (!e) return undefined;
      try {
        return { name: e.name, data: readFields(new Reader(data.subarray(8)), e.fields) as Fields };
      } catch {
        return undefined;
      }
    },

    /** Decodes account data that starts with an Anchor account discriminator. */
    account(data: Buffer): DecodedRecord | undefined {
      const a = accountByTag.get(key(data.subarray(0, 8)));
      if (!a?.type) return undefined;
      try {
        const r = new Reader(data.subarray(8));
        const value = a.type.kind === "struct" ? readFields(r, a.type.fields) : readDefined(r, a.name);
        return { name: a.name, data: value as Fields };
      } catch {
        return undefined;
      }
    },

    /** Decodes data with a named type and no discriminator (accounts of non-Anchor programs). */
    decodeType(name: string, data: Buffer): Fields {
      return readDefined(new Reader(data), name) as Fields;
    },

    /** The 8 bytes a memcmp filter at offset 0 needs to match accounts of this type. */
    accountDiscriminator(name: string): Buffer | undefined {
      for (const [tag, a] of accountByTag) if (a.name === name) return Buffer.from(tag, "hex");
      return undefined;
    },

    /** Byte offset of a field inside an account (after the 8-byte discriminator), for memcmp filters. */
    fieldOffset(accountName: string, field: string): number | undefined {
      const a = [...accountByTag.values()].find((x) => x.name === accountName);
      if (a?.type?.kind !== "struct") return undefined;
      let offset = 8;
      for (const f of (a.type.fields ?? []) as IdlField[]) {
        if (camel(f.name) === field) return offset;
        try {
          offset += size(f.type);
        } catch {
          return undefined; // variable-size field before the target
        }
      }
      return undefined;
    },
  };
}
