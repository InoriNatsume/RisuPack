import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const MAP_PATH = join(MODULE_DIR, "..", "upstream", "rpack_map.bin");

let encodeMap = null;
let decodeMap = null;

export async function encodeRPack(data) {
  const source = Buffer.from(data);
  const maps = loadMaps();
  const result = Buffer.alloc(source.length);

  for (let index = 0; index < source.length; index += 1) {
    result[index] = maps.encode[source[index]];
  }

  return result;
}

export async function decodeRPack(data) {
  const source = Buffer.from(data);
  const maps = loadMaps();
  const result = Buffer.alloc(source.length);

  for (let index = 0; index < source.length; index += 1) {
    result[index] = maps.decode[source[index]];
  }

  return result;
}

function loadMaps() {
  if (encodeMap && decodeMap) {
    return { encode: encodeMap, decode: decodeMap };
  }

  const mapBytes = readFileSync(MAP_PATH);
  if (mapBytes.length !== 512) {
    throw new Error(`Invalid rpack_map.bin length: ${mapBytes.length}`);
  }

  encodeMap = mapBytes.subarray(0, 256);
  decodeMap = mapBytes.subarray(256, 512);
  return { encode: encodeMap, decode: decodeMap };
}
