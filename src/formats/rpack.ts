const ENCODE_MAP_HEX =
  "c40d1e0bbd2b3f55fc456ef566534f1ae0bb309486ba6bbf41506f9befdeb710611720df3289a89d6dabc990000c5dafd2c156e516649182657497ca23d652d1ffb4a0e82f8a58385a60199649dbd7c83b3e434ba56347aa6a2992f415cf623478d31d3ce2058e2a570e1bcd4c2df2402c2579480fb27ab5a76c37e69c7b547efe87dc9a02e433a2ebb12e03dd99a6b0e7d58818837cf6bee15c9fc321461f084ed076125feefd8f44eaa35e8b2809359e69cc0ac78507ad4af377e967d4da848093b64d73fa27267f04c6fbf1723951c236a968acf8edc5b9cbce75a43d81d942701c9511bcd88c98f959a113f7147db3ec71c0e38df001ae5b310624223ab8";

const ENCODE_MAP = Uint8Array.from(Buffer.from(ENCODE_MAP_HEX, "hex"));
const DECODE_MAP = buildDecodeMap(ENCODE_MAP);

export function encodeRPack(data: Uint8Array): Buffer {
  return remapBytes(data, ENCODE_MAP);
}

export function decodeRPack(data: Uint8Array): Buffer {
  return remapBytes(data, DECODE_MAP);
}

function remapBytes(data: Uint8Array, map: Uint8Array): Buffer {
  const source = Buffer.from(data);
  const result = Buffer.alloc(source.length);

  for (let index = 0; index < source.length; index += 1) {
    result[index] = map[source[index]];
  }

  return result;
}

function buildDecodeMap(encodeMap: Uint8Array): Uint8Array {
  if (encodeMap.length !== 256) {
    throw new Error(`Invalid RPack encode map length: ${encodeMap.length}`);
  }

  const decodeMap = new Uint8Array(256);
  const seen = new Set<number>();

  for (let index = 0; index < encodeMap.length; index += 1) {
    const encoded = encodeMap[index];
    if (seen.has(encoded)) {
      throw new Error(`Duplicate RPack mapping for byte ${encoded}`);
    }
    seen.add(encoded);
    decodeMap[encoded] = index;
  }

  if (seen.size !== 256) {
    throw new Error(`Incomplete RPack encode map: ${seen.size}`);
  }

  return decodeMap;
}
