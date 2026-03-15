import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { loadRisumCodec } from "./container-risum.js";

export async function inspectRisum(
  inputPath: string
): Promise<Record<string, unknown>> {
  const { unpackModule } = await loadRisumCodec();
  const inputBytes = readFileSync(inputPath);
  const { module, assets } = await unpackModule(inputBytes);

  return {
    kind: "module",
    format: "risum",
    file: basename(inputPath),
    name: module.name ?? "",
    id: module.id ?? "",
    description: module.description ?? "",
    lorebookCount: Array.isArray(module.lorebook) ? module.lorebook.length : 0,
    regexCount: Array.isArray(module.regex) ? module.regex.length : 0,
    triggerCount: Array.isArray(module.trigger) ? module.trigger.length : 0,
    assetDeclaredCount: Array.isArray(module.assets) ? module.assets.length : 0,
    assetEmbeddedCount: assets.length,
    lowLevelAccess: module.lowLevelAccess ?? false
  };
}
