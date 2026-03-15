import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

interface LorebookPackMetaItem {
  kind: "folder" | "entry";
  data: Record<string, unknown>;
  folderDir?: string;
  sourceFile?: string;
  entryType?: "css" | "text";
}

interface LorebookPackMeta {
  version: 1;
  items: LorebookPackMetaItem[];
}

interface RegexPackMetaItem {
  sourceFile: string;
}

interface RegexPackMeta {
  version: 1;
  items: RegexPackMetaItem[];
}

interface TriggerPackMetaItem {
  version: 1;
  mode: "none" | "lua" | "v2" | "unsupported-v1";
  sourceFile?: string;
  noteFile?: string;
  triggerIndex?: number;
  effectIndex?: number;
  data?: unknown;
}

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
  const regexDir = join(srcDir, "regex");
  const stylesDir = join(srcDir, "styles");
  const lorebookDir = join(srcDir, "lorebook");
  const rootLorebookDir = join(lorebookDir, "_root");

  mkdirSync(regexDir, { recursive: true });
  mkdirSync(stylesDir, { recursive: true });
  mkdirSync(rootLorebookDir, { recursive: true });
  mkdirSync(join(projectDir, MODULE_PACK_DIR), { recursive: true });

  const module = readJson<Record<string, unknown>>(inputPath);

  const triggers = asArray<Record<string, unknown>>(module.trigger);
  const triggerMode = detectTriggerMode(triggers);
  const triggerMeta = extractTriggerSources(projectDir, triggers, triggerMode);
  writeJson(join(projectDir, TRIGGER_META_PATH), triggerMeta);

  const lorebookEntries = asArray<Record<string, unknown>>(module.lorebook);
  const folderMap = createFolderMap(projectDir, lorebookEntries);
  const usedSourceFiles = new Set<string>();
  const lorebookMeta: LorebookPackMetaItem[] = [];

  for (const entry of lorebookEntries) {
    if (entry.mode === "folder") {
      const folderInfo = folderMap.get(asString(entry.key));
      lorebookMeta.push({
        kind: "folder",
        data: structuredClone(entry),
        folderDir: folderInfo?.relativeDir
      });
      continue;
    }

    const comment =
      typeof entry.comment === "string" && entry.comment
        ? entry.comment
        : `entry_${lorebookMeta.length}`;
    const content = typeof entry.content === "string" ? entry.content : "";
    const folderDir = resolveEntryFolderDir(entry, folderMap);
    const sourceFile = uniqueSourceFile(
      join(folderDir, `${safeFilename(comment)}.md`),
      usedSourceFiles
    );
    writeText(join(projectDir, sourceFile), content, false);
    lorebookMeta.push({
      kind: "entry",
      data: omitKeys(entry, ["content"]),
      folderDir,
      sourceFile
    });
  }

  writeJson(join(projectDir, LOREBOOK_META_PATH), {
    version: 1,
    items: lorebookMeta
  } satisfies LorebookPackMeta);

  const regexEntries = asArray<Record<string, unknown>>(module.regex);
  const usedRegexFiles = new Set<string>();
  const regexMeta: RegexPackMetaItem[] = regexEntries.map((entry, index) => {
    const label =
      typeof entry.comment === "string" && entry.comment
        ? entry.comment
        : `regex_${index + 1}`;
    const sourceFile = uniqueSourceFile(
      join(MODULE_SRC_DIR, "regex", `${safeFilename(label)}.json`),
      usedRegexFiles
    );
    writeJson(join(projectDir, sourceFile), entry);
    return { sourceFile };
  });
  writeJson(join(projectDir, REGEX_META_PATH), {
    version: 1,
    items: regexMeta
  } satisfies RegexPackMeta);

  const backgroundEmbedding =
    typeof module.backgroundEmbedding === "string"
      ? module.backgroundEmbedding
      : "";
  if (backgroundEmbedding) {
    writeText(
      join(stylesDir, "embedding.css"),
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

  const lorebookMetaRef = module.lorebook;
  if (
    typeof lorebookMetaRef === "string" &&
    lorebookMetaRef.startsWith("__BUILD_FROM__:")
  ) {
    const metaRef = lorebookMetaRef.slice("__BUILD_FROM__:".length);
    const lorebookMeta = readJson<LorebookPackMeta>(
      resolveProjectPath(projectDir, metaRef)
    );
    module.lorebook = lorebookMeta.items.map((item) => {
      const entry = structuredClone(item.data);
      if (item.kind === "folder") {
        return entry;
      }

      const sourceFile = item.sourceFile ?? "";
      let content = sourceFile ? readSource(projectDir, sourceFile) : "";
      if (item.entryType === "css") {
        content = wrapStyle(content);
      }
      entry.content = content;
      return entry;
    });
  }

  const regexMetaRef = module.regex;
  if (
    typeof regexMetaRef === "string" &&
    regexMetaRef.startsWith("__BUILD_FROM__:")
  ) {
    const metaRef = regexMetaRef.slice("__BUILD_FROM__:".length);
    const regexMeta = readJson<RegexPackMeta>(
      resolveProjectPath(projectDir, metaRef)
    );
    module.regex = regexMeta.items.map((item) =>
      readJson<Record<string, unknown>>(
        resolveProjectPath(projectDir, item.sourceFile)
      )
    );
  }

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

function createFolderMap(
  projectDir: string,
  lorebookEntries: Record<string, unknown>[]
): Map<string, { relativeDir: string }> {
  const folderMap = new Map<string, { relativeDir: string }>();
  const usedFolderDirs = new Set<string>();

  for (const [index, entry] of lorebookEntries.entries()) {
    if (entry.mode !== "folder") {
      continue;
    }
    const folderKey = asString(entry.key);
    if (!folderKey) {
      continue;
    }
    const comment =
      typeof entry.comment === "string" && entry.comment
        ? entry.comment
        : `folder_${index}`;
    const relativeDir = uniqueSourceFile(
      join(MODULE_SRC_DIR, "lorebook", safeFilename(comment)),
      usedFolderDirs
    );
    mkdirSync(join(projectDir, relativeDir), { recursive: true });
    folderMap.set(folderKey, { relativeDir: relativeDir.replace(/\\/g, "/") });
  }

  return folderMap;
}

function resolveEntryFolderDir(
  entry: Record<string, unknown>,
  folderMap: Map<string, { relativeDir: string }>
): string {
  const folderKey = asString(entry.folder);
  return (
    folderMap.get(folderKey)?.relativeDir ??
    join(MODULE_SRC_DIR, "lorebook", "_root").replace(/\\/g, "/")
  );
}

function uniqueSourceFile(
  sourceFile: string,
  usedSourceFiles: Set<string>
): string {
  const normalized = assertSafeSourceRelativePath(
    sourceFile.replace(/\\/g, "/")
  );
  if (!usedSourceFiles.has(normalized)) {
    usedSourceFiles.add(normalized);
    return normalized;
  }

  const lastSlash = normalized.lastIndexOf("/");
  const directory = lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
  const filename =
    lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dotIndex = filename.lastIndexOf(".");
  const baseName = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex >= 0 ? filename.slice(dotIndex) : "";

  let suffix = 2;
  while (true) {
    const candidate = directory
      ? `${directory}/${baseName}_${suffix}${extension}`
      : `${baseName}_${suffix}${extension}`;
    const normalizedCandidate = assertSafeSourceRelativePath(candidate);
    if (!usedSourceFiles.has(normalizedCandidate)) {
      usedSourceFiles.add(normalizedCandidate);
      return normalizedCandidate;
    }
    suffix += 1;
  }
}

function readSource(projectDir: string, sourceRef: string): string {
  const filepath = resolveProjectPath(projectDir, sourceRef);
  if (!existsSync(filepath)) {
    throw new Error(`module-vcs source 파일을 찾을 수 없습니다: ${filepath}`);
  }
  return readFileSync(filepath, "utf-8");
}

function wrapStyle(cssContent: string): string {
  return `<style>\n${cssContent.trim()}\n</style>`;
}

function stripStyleTags(content: string): string {
  let next = content.trim();
  if (next.startsWith("<style>")) {
    next = next.slice("<style>".length);
  }
  if (next.endsWith("</style>")) {
    next = next.slice(0, -"</style>".length);
  }
  return next.replace(/^\n+|\n+$/g, "");
}

function safeFilename(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return "_";
  }

  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(sanitized)) {
    return `_${sanitized}`;
  }

  return sanitized;
}

function assertSafeSourceRelativePath(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`안전하지 않은 source 경로입니다: ${sourcePath}`);
  }

  const segments = normalized.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`안전하지 않은 source 경로입니다: ${sourcePath}`);
  }

  return normalized;
}

function detectTriggerMode(
  triggers: Record<string, unknown>[]
): "none" | "lua" | "v2" | "unsupported-v1" {
  const firstTrigger = triggers[0];
  const firstEffect = asArray<Record<string, unknown>>(firstTrigger?.effect)[0];
  const firstType =
    typeof firstEffect?.type === "string" ? firstEffect.type : "";

  if (!firstType) {
    return triggers.length > 0 ? "unsupported-v1" : "none";
  }
  if (firstType === "triggerlua") {
    return "lua";
  }
  if (firstType === "v2Header") {
    return "v2";
  }
  return "unsupported-v1";
}

function extractTriggerSources(
  projectDir: string,
  triggers: Record<string, unknown>[],
  mode: "none" | "lua" | "v2" | "unsupported-v1"
): TriggerPackMetaItem {
  switch (mode) {
    case "none":
      return {
        version: 1,
        mode,
        data: []
      };
    case "lua": {
      const triggerIndex = 0;
      const effectIndex = 0;
      const sourceFile = `${MODULE_SRC_DIR}/trigger.lua`;
      const firstTrigger = structuredClone(triggers[triggerIndex] ?? {});
      const firstEffect = asArray<Record<string, unknown>>(firstTrigger.effect)[
        effectIndex
      ];
      const code =
        typeof firstEffect?.code === "string" ? firstEffect.code : "";
      writeText(join(projectDir, sourceFile), code, false);
      return {
        version: 1,
        mode,
        sourceFile,
        triggerIndex,
        effectIndex,
        data: triggers
      };
    }
    case "v2": {
      const sourceFile = `${MODULE_SRC_DIR}/trigger.json`;
      writeJson(join(projectDir, sourceFile), triggers);
      return {
        version: 1,
        mode,
        sourceFile
      };
    }
    case "unsupported-v1": {
      const noteFile = `${MODULE_SRC_DIR}/trigger.unsupported.txt`;
      writeText(
        join(projectDir, noteFile),
        [
          "이 모듈의 trigger는 RisuAI V1 형식이라 현재 source 편집을 지원하지 않습니다.",
          "build 시에는 원본 trigger 데이터가 그대로 보존됩니다."
        ].join("\n"),
        true
      );
      return {
        version: 1,
        mode,
        noteFile,
        data: triggers
      };
    }
  }
}

function buildTriggersFromMeta(
  projectDir: string,
  meta: TriggerPackMetaItem
): unknown[] {
  switch (meta.mode) {
    case "none":
      return [];
    case "lua": {
      const triggers = structuredClone(
        asArray<Record<string, unknown>>(meta.data)
      );
      const triggerIndex = meta.triggerIndex ?? 0;
      const effectIndex = meta.effectIndex ?? 0;
      const trigger = triggers[triggerIndex];
      const effect = asArray<Record<string, unknown>>(trigger?.effect)[
        effectIndex
      ];
      if (!meta.sourceFile) {
        throw new Error("Lua trigger 재조립에 필요한 source 파일이 없습니다.");
      }
      if (effect && typeof effect === "object") {
        effect.code = readSource(projectDir, meta.sourceFile);
      }
      return triggers;
    }
    case "v2":
      if (!meta.sourceFile) {
        throw new Error("V2 trigger 재조립에 필요한 source 파일이 없습니다.");
      }
      return readJson<unknown[]>(
        resolveProjectPath(projectDir, meta.sourceFile)
      );
    case "unsupported-v1":
      return asArray<Record<string, unknown>>(meta.data);
  }
}

function omitKeys(
  value: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key))
  );
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function writeText(path: string, content: string, appendNewline = true): void {
  const normalized = content.replace(/\r\n/g, "\n");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, appendNewline ? `${normalized}\n` : normalized, "utf-8");
}
