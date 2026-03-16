import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { decode, encode } from "msgpackr";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const RPACK_PATH = resolve(
  MODULE_DIR,
  "../../../third_party/container-risum-copy/lib/rpack.mjs"
);
const RISUPRESET_KEY = "risupreset";

export interface DecodedRisupContainer {
  preset: Record<string, unknown>;
  outerType: string;
  presetVersion: number;
}

export async function decodeRisupContainer(
  inputBytes: Buffer,
  format: "risup" | "risupreset"
): Promise<DecodedRisupContainer> {
  const data =
    format === "risup" ? await decodeRPackBytes(inputBytes) : inputBytes;
  const outer = decode(gunzipSync(data)) as Record<string, unknown>;
  const outerType = typeof outer.type === "string" ? outer.type : "";
  const presetVersion =
    typeof outer.presetVersion === "number" ? outer.presetVersion : -1;

  if (
    (presetVersion === 0 || presetVersion === 2) &&
    (outerType === "preset" || outerType === "risupreset")
  ) {
    const encrypted = asUint8Array(outer.preset ?? outer.pres);
    const decrypted = decryptPresetBytes(encrypted);
    return {
      preset: decode(decrypted) as Record<string, unknown>,
      outerType,
      presetVersion
    };
  }

  throw new Error(
    `알 수 없는 risup 포맷입니다 (presetVersion: ${String(outer.presetVersion)})`
  );
}

export async function encodeRisupContainer(
  preset: Record<string, unknown>,
  format: "risup" | "risupreset",
  containerMeta?: { outerType?: string; presetVersion?: number }
): Promise<Buffer> {
  const innerPacked = Buffer.from(encode(preset));
  const encrypted = encryptPresetBytes(innerPacked);
  const outerType = containerMeta?.outerType || "preset";
  const presetVersion = containerMeta?.presetVersion ?? 2;
  const outer = Buffer.from(
    encode({
      presetVersion,
      type: outerType,
      preset: encrypted
    })
  );
  const compressed = gzipSync(outer);

  if (format === "risup") {
    return Buffer.from(await encodeRPackBytes(compressed));
  }

  return Buffer.from(compressed);
}

async function encodeRPackBytes(data: Uint8Array): Promise<Uint8Array> {
  const { encodeRPack } = await import(pathToFileURL(RPACK_PATH).href);
  return encodeRPack(data);
}

async function decodeRPackBytes(data: Uint8Array): Promise<Uint8Array> {
  const { decodeRPack } = await import(pathToFileURL(RPACK_PATH).href);
  return decodeRPack(data);
}

function encryptPresetBytes(data: Uint8Array): Buffer {
  const key = createHash("sha256").update(RISUPRESET_KEY).digest();
  const iv = Buffer.alloc(12, 0);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(data)),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([encrypted, authTag]);
}

function decryptPresetBytes(data: Uint8Array): Buffer {
  const key = createHash("sha256").update(RISUPRESET_KEY).digest();
  const iv = Buffer.alloc(12, 0);
  const buffer = Buffer.from(data);
  const authTag = buffer.subarray(buffer.length - 16);
  const ciphertext = buffer.subarray(0, buffer.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function asUint8Array(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Buffer.isBuffer(value)) {
    return value;
  }
  throw new Error("risup 암호화 데이터가 Uint8Array 형식이 아닙니다.");
}
