import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

import {
  makeBuildFromRef,
  makeSourceRef,
  parseBuildFromRef,
  parseSourceRef
} from "../../core/source-refs.js";
import {
  readPreferredMetaJson,
  writeMirroredMetaJson
} from "../../core/source-meta.js";
import { readJson, writeJson } from "../../core/json-files.js";
import { resolveProjectPath } from "../../core/project-paths.js";
import {
  LOREBOOK_SOURCE_META_PATH,
  LOREBOOK_META_PATH,
  MODULE_DIST_JSON_PATH,
  MODULE_JSON_PATH,
  MODULE_META_PATH,
  MODULE_PACK_DIR,
  MODULE_SRC_DIR,
  REGEX_SOURCE_META_PATH,
  REGEX_META_PATH,
  TRIGGER_SOURCE_META_PATH,
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
  RegexPackMeta,
  TriggerPackMetaItem
} from "./source-module-types.js";

export function extractModuleSources(
  projectDir: string,
  inputFilename = MODULE_JSON_PATH
): void {
  const inputPath = join(projectDir, inputFilename);
  if (!existsSync(inputPath)) {
    throw new Error(`모듈 extract 입력 파일을 찾을 수 없습니다: ${inputPath}`);
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
  writeMirroredMetaJson(
    projectDir,
    TRIGGER_SOURCE_META_PATH,
    TRIGGER_META_PATH,
    triggerMeta
  );

  const lorebookMeta = extractLorebookSources(projectDir, module.lorebook);
  writeMirroredMetaJson(
    projectDir,
    LOREBOOK_SOURCE_META_PATH,
    LOREBOOK_META_PATH,
    lorebookMeta
  );

  const regexMeta = extractRegexSources(projectDir, module.regex);
  writeMirroredMetaJson(
    projectDir,
    REGEX_SOURCE_META_PATH,
    REGEX_META_PATH,
    regexMeta
  );

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

  metaModule.trigger = makeBuildFromRef(TRIGGER_SOURCE_META_PATH);
  metaModule.backgroundEmbedding = backgroundEmbedding
    ? makeSourceRef("src/styles/embedding.css")
    : "";
  metaModule.lorebook = makeBuildFromRef(LOREBOOK_SOURCE_META_PATH);
  metaModule.regex = makeBuildFromRef(REGEX_SOURCE_META_PATH);
  writeJson(join(projectDir, MODULE_META_PATH), metaModule);
}

export function buildModuleSources(projectDir: string): void {
  const module = readJson<Record<string, unknown>>(
    join(projectDir, MODULE_META_PATH)
  );
  const lorebookMeta = readPreferredMetaJson<LorebookPackMeta>(
    projectDir,
    LOREBOOK_SOURCE_META_PATH,
    LOREBOOK_META_PATH
  ) ?? { version: 1 as const, items: [] };
  const regexMeta = readPreferredMetaJson<RegexPackMeta>(
    projectDir,
    REGEX_SOURCE_META_PATH,
    REGEX_META_PATH
  ) ?? { version: 1 as const, items: [] };

  const triggerMetaRef = module.trigger;
  const preferredTriggerMeta = readPreferredMetaJson<TriggerPackMetaItem>(
    projectDir,
    TRIGGER_SOURCE_META_PATH,
    TRIGGER_META_PATH
  );
  if (preferredTriggerMeta) {
    module.trigger = buildTriggersFromMeta(projectDir, preferredTriggerMeta);
  } else if (parseBuildFromRef(triggerMetaRef)) {
    const metaRef = parseBuildFromRef(triggerMetaRef)!;
    module.trigger = buildTriggersFromMeta(
      projectDir,
      readJson<TriggerPackMetaItem>(resolveProjectPath(projectDir, metaRef))
    );
  }

  module.lorebook = buildLorebookEntries(projectDir, lorebookMeta);
  module.regex = buildRegexEntries(projectDir, regexMeta);

  const sourcePath = parseSourceRef(module.backgroundEmbedding);
  if (sourcePath) {
    const css = readSource(projectDir, sourcePath).replace(/\n+$/, "");
    module.backgroundEmbedding = wrapStyle(css);
  }

  const outputPath = join(projectDir, MODULE_DIST_JSON_PATH);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeJson(outputPath, module);
}
