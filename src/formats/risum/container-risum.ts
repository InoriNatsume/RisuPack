import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const CODEC_PATH = resolve(
  MODULE_DIR,
  "../../../third_party/container-risum-copy/lib/codec.mjs"
);

export async function loadRisumCodec(): Promise<{
  packModule: (module: unknown, assetBuffers?: Buffer[]) => Promise<Buffer>;
  unpackModule: (buf: Buffer) => Promise<{ module: any; assets: Buffer[] }>;
}> {
  return import(pathToFileURL(CODEC_PATH).href);
}
