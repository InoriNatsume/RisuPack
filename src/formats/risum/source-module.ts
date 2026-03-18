import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { resolveProjectPath } from "../../core/project-paths.js";
import { readJson, writeJson } from "../bot/shared.js";
import {
  LOREBOOK_META_PATH,
  MODULE_DIST_JSON_PATH,
  MODULE_JSON_PATH,
  MODULE_META_PATH,
  MODULE_PACK_DIR,
  MODULE_SRC_DIR,
  REGEX_META_PATH,
  TRIGGER_META_PATH
} from "./paths.js";
import {
  asArray,
  readSource,
  stripStyleTags,
  wrapStyle,
  writeText
} from "./source-module-fs.js";
import {
  buildLorebookEntries,
  extractLorebookSources
} from "./source-module-lorebook.js";
import {
  buildRegexEntries,
  extractRegexSources
} from "./source-module-regex.js";
import {
  buildTriggersFromMeta,
  detectTriggerMode,
  extractTriggerSources
} from "./source-module-trigger.js";
import type {
  LorebookPackMeta,
  TriggerPackMetaItem
} from "./source-module-types.js";

export function extractModuleSources(
  projectDir: string,
  inputFilename = MODULE_JSON_PATH
): void {
  const inputPath = join(projectDir, inputFilename);
  if (!existsSync(inputPath)) {
    throw new Error(
      `module-vcs extract 입력 파일을 찾을 수 없습니다: ${inputPath}`
    );
  }

  const srcDir = join(projectDir, MODULE_SRC_DIR);
  mkdirSync(join(srcDir, "regex"), { recursive: true });
  mkdirSync(join(srcDir, "styles"), { recursive: true });
  mkdirSync(join(srcDir, "lorebook", "_root"), { recursive: true });
  mkdirSync(join(projectDir, MODULE_PACK_DIR), { recursive: true });

  const module = readJson<Record<string, unknown>>(inputPath);

  const triggers = asArray<Record<string, unknown>>(module.trigger);
  const triggerMode = detectTriggerMode(triggers);
  const triggerMeta = extractTriggerSources(projectDir, triggers, triggerMode);
  writeJson(join(projectDir, TRIGGER_META_PATH), triggerMeta);

  const lorebookMeta = extractLorebookSources(projectDir, module.lorebook);
  writeJson(join(projectDir, LOREBOOK_META_PATH), lorebookMeta);

  const regexMeta = extractRegexSources(projectDir, module.regex);
  writeJson(join(projectDir, REGEX_META_PATH), regexMeta);

  const backgroundEmbedding =
    typeof module.backgroundEmbedding === "string"
      ? module.backgroundEmbedding
      : "";
  if (backgroundEmbedding) {
    writeText(
      join(srcDir, "styles", "embedding.css"),
      `${stripStyleTags(backgroundEmbedding)}\n`,
      false
    );
  }

  const metaModule: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(module)) {
    if (
      key === "lorebook" ||
      key === "backgroundEmbedding" ||
      key === "regex" ||
      key === "trigger"
    ) {
      continue;
    }

    metaModule[key] = value;
  }

  metaModule.trigger = `__BUILD_FROM__:${TRIGGER_META_PATH.replace(/\\/g, "/")}`;
  metaModule.backgroundEmbedding = backgroundEmbedding
    ? "__SOURCE__:src/styles/embedding.css"
    : "";
  metaModule.lorebook = `__BUILD_FROM__:${LOREBOOK_META_PATH.replace(/\\/g, "/")}`;
  metaModule.regex = `__BUILD_FROM__:${REGEX_META_PATH.replace(/\\/g, "/")}`;
  writeJson(join(projectDir, MODULE_META_PATH), metaModule);
}

export function buildModuleSources(projectDir: string): void {
  const module = readJson<Record<string, unknown>>(
    join(projectDir, MODULE_META_PATH)
  );
  const lorebookMeta: LorebookPackMeta = existsSync(
    join(projectDir, LOREBOOK_META_PATH)
  )
    ? readJson<LorebookPackMeta>(join(projectDir, LOREBOOK_META_PATH))
    : { version: 1 as const, items: [] };

  const triggerMetaRef = module.trigger;
  if (
    typeof triggerMetaRef === "string" &&
    triggerMetaRef.startsWith("__BUILD_FROM__:")
  ) {
    const metaRef = triggerMetaRef.slice("__BUILD_FROM__:".length);
    const triggerMeta = readJson<TriggerPackMetaItem>(
      resolveProjectPath(projectDir, metaRef)
    );
    module.trigger = buildTriggersFromMeta(projectDir, triggerMeta);
  }

  module.lorebook = buildLorebookEntries(projectDir, lorebookMeta);
  module.regex = buildRegexEntries(projectDir);

  const bgRef = module.backgroundEmbedding;
  if (typeof bgRef === "string" && bgRef.startsWith("__SOURCE__:")) {
    const sourcePath = bgRef.slice("__SOURCE__:".length);
    const css = readSource(projectDir, sourcePath).replace(/\n+$/, "");
    module.backgroundEmbedding = wrapStyle(css);
  }

  const outputPath = join(projectDir, MODULE_DIST_JSON_PATH);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeJson(outputPath, module);
}
