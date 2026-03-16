import { decodeRPack, encodeRPack } from "./rpack.mjs";

const MODULE_MAGIC = 0x6f;
const MODULE_VERSION = 0x00;
const ASSET_MARKER = 0x01;
const END_MARKER = 0x00;
const MODULE_TYPE = "risuModule";

export async function packModule(module, assetBuffers = []) {
  const exportedModule = cloneModuleForContainer(module);
  const mainPayload = Buffer.from(
    JSON.stringify({ type: MODULE_TYPE, module: exportedModule }, null, 2),
    "utf-8"
  );
  const encodedMain = Buffer.from(await encodeRPack(mainPayload));
  const chunks = [createHeader(encodedMain.length), encodedMain];

  for (const assetBuffer of assetBuffers) {
    const encodedAsset = Buffer.from(
      await encodeRPack(Buffer.from(assetBuffer))
    );
    chunks.push(createAssetChunk(encodedAsset));
  }

  chunks.push(Buffer.from([END_MARKER]));
  return Buffer.concat(chunks);
}

export async function unpackModule(input) {
  const cursor = createCursor(input);
  const magic = readByte(cursor, "magic");
  if (magic !== MODULE_MAGIC) {
    throw new Error(
      `Invalid magic byte: 0x${magic.toString(16)} (expected 0x6F)`
    );
  }

  const version = readByte(cursor, "version");
  if (version !== MODULE_VERSION) {
    throw new Error(`Unsupported version: ${version} (expected 0)`);
  }

  const encodedMain = readChunkPayload(cursor, "main");
  const decodedMain = Buffer.from(await decodeRPack(encodedMain)).toString(
    "utf-8"
  );
  const parsedMain = JSON.parse(decodedMain);
  if (!parsedMain || parsedMain.type !== MODULE_TYPE) {
    throw new Error(
      `Invalid module type: "${String(parsedMain?.type)}" (expected "risuModule")`
    );
  }

  const assets = [];
  while (!atEnd(cursor)) {
    const marker = readByte(cursor, "chunk marker");
    if (marker === END_MARKER) {
      break;
    }
    if (marker !== ASSET_MARKER) {
      throw new Error(
        `Unexpected marker: 0x${marker.toString(16)} at pos ${cursor.offset - 1}`
      );
    }

    const encodedAsset = readChunkPayload(cursor, "asset");
    assets.push(Buffer.from(await decodeRPack(encodedAsset)));
  }

  return {
    module: parsedMain.module,
    assets
  };
}

function cloneModuleForContainer(module) {
  const cloned = structuredClone(module);
  if (!cloned || !Array.isArray(cloned.assets)) {
    return cloned;
  }

  cloned.assets = cloned.assets.map((asset) => {
    if (!Array.isArray(asset)) {
      return asset;
    }
    return [asset[0], "", asset[2]];
  });
  return cloned;
}

function createHeader(mainLength) {
  const header = Buffer.alloc(6);
  header.writeUInt8(MODULE_MAGIC, 0);
  header.writeUInt8(MODULE_VERSION, 1);
  header.writeUInt32LE(mainLength, 2);
  return header;
}

function createAssetChunk(encodedAsset) {
  const chunk = Buffer.alloc(5 + encodedAsset.length);
  chunk.writeUInt8(ASSET_MARKER, 0);
  chunk.writeUInt32LE(encodedAsset.length, 1);
  encodedAsset.copy(chunk, 5);
  return chunk;
}

function createCursor(input) {
  return {
    buffer: Buffer.from(input),
    offset: 0
  };
}

function atEnd(cursor) {
  return cursor.offset >= cursor.buffer.length;
}

function readByte(cursor, label) {
  ensureAvailable(cursor, 1, label);
  const value = cursor.buffer.readUInt8(cursor.offset);
  cursor.offset += 1;
  return value;
}

function readChunkPayload(cursor, label) {
  ensureAvailable(cursor, 4, `${label} length`);
  const length = cursor.buffer.readUInt32LE(cursor.offset);
  cursor.offset += 4;
  ensureAvailable(cursor, length, `${label} payload`);
  const payload = cursor.buffer.subarray(cursor.offset, cursor.offset + length);
  cursor.offset += length;
  return payload;
}

function ensureAvailable(cursor, size, label) {
  const remaining = cursor.buffer.length - cursor.offset;
  if (remaining < size) {
    throw new Error(
      `Unexpected end of file while reading ${label}: need ${size} bytes, have ${remaining}`
    );
  }
}
