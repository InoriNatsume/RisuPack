const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

const CRC32_TABLE = buildCrc32Table();

export interface ParsedPngTextChunk {
  key: string;
  value: Buffer;
}

export function assertPngSignature(bytes: Buffer): void {
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error("PNG 시그니처가 없는 파일입니다.");
  }
}

export function listTextChunks(bytes: Buffer): ParsedPngTextChunk[] {
  assertPngSignature(bytes);
  const chunks: ParsedPngTextChunk[] = [];

  forEachChunk(bytes, (type, chunkData) => {
    if (type !== "tEXt") {
      return;
    }

    const zeroIndex = chunkData.indexOf(0x00);
    if (zeroIndex < 0) {
      return;
    }

    chunks.push({
      key: chunkData.subarray(0, zeroIndex).toString("latin1"),
      value: chunkData.subarray(zeroIndex + 1)
    });
  });

  return chunks;
}

export function rewritePngTextChunks(
  sourceBytes: Buffer,
  replacements: ParsedPngTextChunk[],
  stripKeys: Set<string>
): Buffer {
  assertPngSignature(sourceBytes);
  const output: Buffer[] = [sourceBytes.subarray(0, PNG_SIGNATURE.length)];

  forEachChunk(sourceBytes, (type, chunkData, rawChunk) => {
    if (type === "IEND") {
      for (const replacement of replacements) {
        output.push(createTextChunk(replacement.key, replacement.value));
      }
      output.push(rawChunk);
      return;
    }

    if (type === "tEXt") {
      const zeroIndex = chunkData.indexOf(0x00);
      if (zeroIndex >= 0) {
        const key = chunkData.subarray(0, zeroIndex).toString("latin1");
        if (stripKeys.has(key)) {
          return;
        }
      }
    }

    output.push(rawChunk);
  });

  return Buffer.concat(output);
}

export function decodeBase64TextChunk(value: Buffer): Buffer {
  return Buffer.from(value.toString("latin1"), "base64");
}

export function encodeBase64TextChunk(value: Buffer): Buffer {
  return Buffer.from(value.toString("base64"), "latin1");
}

export function extractAssetChunkIndex(key: string): string | null {
  if (!key.startsWith("chara-ext-asset_")) {
    return null;
  }

  return key.replace("chara-ext-asset_:", "").replace("chara-ext-asset_", "");
}

export function guessFileExtension(bytes: Buffer, fallback = "bin"): string {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  if (bytes.length >= 6) {
    const head = bytes.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") {
      return "gif";
    }
  }
  return fallback;
}

function createTextChunk(key: string, value: Buffer): Buffer {
  const keyBytes = Buffer.from(key, "latin1");
  const chunkData = Buffer.concat([keyBytes, Buffer.from([0x00]), value]);
  return createChunk("tEXt", chunkData);
}

function createChunk(type: string, chunkData: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(chunkData.length, 0);
  const typeBytes = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, chunkData])), 0);
  return Buffer.concat([length, typeBytes, chunkData, crc]);
}

function forEachChunk(
  bytes: Buffer,
  callback: (type: string, chunkData: Buffer, rawChunk: Buffer) => void
): void {
  let offset = PNG_SIGNATURE.length;

  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const chunkStart = offset;
    const chunkEnd = offset + 12 + length;
    if (chunkEnd > bytes.length) {
      throw new Error("손상된 PNG 청크 길이입니다.");
    }

    const chunkData = bytes.subarray(offset + 8, offset + 8 + length);
    callback(type, chunkData, bytes.subarray(chunkStart, chunkEnd));

    offset = chunkEnd;
    if (type === "IEND") {
      return;
    }
  }
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let round = 0; round < 8; round += 1) {
      if ((value & 1) !== 0) {
        value = 0xedb88320 ^ (value >>> 1);
      } else {
        value >>>= 1;
      }
    }
    table[index] = value >>> 0;
  }
  return table;
}
