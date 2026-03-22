import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";

import {
  makeBuildFromRef,
  makeSourceRef,
  parseSourceRef
} from "../../core/source-refs.js";
import { readJson, writeJson } from "../../core/json-files.js";
import { omitKeys } from "../../core/object-utils.js";
import { normalizeRelativePath } from "../../core/path-utils.js";
import {
  readPreferredMetaJson,
  writeMirroredMetaJson
} from "../../core/source-meta.js";
import { resolveProjectPath } from "../../core/project-paths.js";
import {
  compareWorkspaceName,
  safeWorkspaceName,
  uniqueWorkspaceRelativePath
} from "../../core/workspace-naming.js";
import type {
  PresetRegexPackMeta,
  PromptTemplatePackMeta
} from "../../types/preset.js";
import {
  PRESET_DIST_DIR,
  PRESET_DIST_JSON_PATH,
  PRESET_META_PATH,
  PRESET_PACK_DIR,
  PRESET_REGEX_SOURCE_META_PATH,
  PRESET_RAW_PATH,
  PRESET_REGEX_META_PATH,
  PRESET_SRC_DIR,
  PROMPT_TEMPLATE_SOURCE_META_PATH,
  PROMPT_TEMPLATE_META_PATH
} from "./paths.js";

const PRESET_SOURCES = {
  name: "name.txt",
  mainPrompt: "main-prompt.md",
  jailbreak: "jailbreak.md",
  globalNote: "global-note.md",
  customPromptTemplateToggle: "custom-prompt-template-toggle.txt",
  templateDefaultVariables: "template-default-variables.txt"
} as const;

export function extractPresetSources(
  projectDir: string,
  preset: Record<string, unknown>
): void {
  const srcDir = join(projectDir, PRESET_SRC_DIR);
  const promptDir = join(srcDir, "prompt-template");
  const regexDir = join(srcDir, "regex");
  mkdirSync(promptDir, { recursive: true });
  mkdirSync(regexDir, { recursive: true });
  mkdirSync(join(projectDir, PRESET_PACK_DIR), { recursive: true });

  writeText(join(srcDir, PRESET_SOURCES.name), asString(preset.name));
  writeText(
    join(srcDir, PRESET_SOURCES.mainPrompt),
    asString(preset.mainPrompt)
  );
  writeText(join(srcDir, PRESET_SOURCES.jailbreak), asString(preset.jailbreak));
  writeText(
    join(srcDir, PRESET_SOURCES.globalNote),
    asString(preset.globalNote)
  );
  writeText(
    join(srcDir, PRESET_SOURCES.customPromptTemplateToggle),
    asString(preset.customPromptTemplateToggle)
  );
  writeText(
    join(srcDir, PRESET_SOURCES.templateDefaultVariables),
    asString(preset.templateDefaultVariables)
  );

  const promptTemplate = Array.isArray(preset.promptTemplate)
    ? (preset.promptTemplate as Record<string, unknown>[])
    : [];
  const promptMeta: PromptTemplatePackMeta = {
    version: 1,
    items: promptTemplate.map((item, index) => {
      const slug = promptItemSlug(item, index);
      const jsonFile = `${PRESET_SRC_DIR}/prompt-template/${slug}.json`;
      const text = typeof item.text === "string" ? item.text : undefined;
      writeJson(join(projectDir, jsonFile), omitKeys(item, ["text"]));

      const metaItem: PromptTemplatePackMeta["items"][number] = {
        jsonFile
      };

      if (text != null) {
        const textFile = `${PRESET_SRC_DIR}/prompt-template/${slug}.md`;
        writeText(join(projectDir, textFile), text);
        metaItem.textFile = textFile;
      }

      return metaItem;
    })
  };
  writeMirroredMetaJson(
    projectDir,
    PROMPT_TEMPLATE_SOURCE_META_PATH,
    PROMPT_TEMPLATE_META_PATH,
    promptMeta
  );

  const regexEntries = Array.isArray(preset.regex)
    ? (preset.regex as Record<string, unknown>[])
    : [];
  const usedRegexFiles = new Set<string>();
  const regexMeta: PresetRegexPackMeta = {
    version: 1,
    items: regexEntries.map((entry, index) => {
      const label =
        typeof entry.comment === "string" && entry.comment
          ? entry.comment
          : `regex_${index + 1}`;
      const sourceFile = uniqueSourceFile(
        `${PRESET_SRC_DIR}/regex/${safeWorkspaceName(label)}.json`,
        usedRegexFiles
      );
      writeJson(join(projectDir, sourceFile), entry);
      return { sourceFile };
    })
  };
  writeMirroredMetaJson(
    projectDir,
    PRESET_REGEX_SOURCE_META_PATH,
    PRESET_REGEX_META_PATH,
    regexMeta
  );

  const presetMeta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(preset)) {
    if (
      [
        "name",
        "mainPrompt",
        "jailbreak",
        "globalNote",
        "customPromptTemplateToggle",
        "templateDefaultVariables",
        "promptTemplate",
        "regex"
      ].includes(key)
    ) {
      continue;
    }
    presetMeta[key] = value;
  }

  presetMeta.name = makeSourceRef(`src/${PRESET_SOURCES.name}`);
  presetMeta.mainPrompt = makeSourceRef(`src/${PRESET_SOURCES.mainPrompt}`);
  presetMeta.jailbreak = makeSourceRef(`src/${PRESET_SOURCES.jailbreak}`);
  presetMeta.globalNote = makeSourceRef(`src/${PRESET_SOURCES.globalNote}`);
  presetMeta.customPromptTemplateToggle = makeSourceRef(
    `src/${PRESET_SOURCES.customPromptTemplateToggle}`
  );
  presetMeta.templateDefaultVariables = makeSourceRef(
    `src/${PRESET_SOURCES.templateDefaultVariables}`
  );
  presetMeta.promptTemplate = makeBuildFromRef(
    PROMPT_TEMPLATE_SOURCE_META_PATH
  );
  presetMeta.regex = makeBuildFromRef(PRESET_REGEX_SOURCE_META_PATH);
  writeJson(join(projectDir, PRESET_META_PATH), presetMeta);
}

export function buildPresetSources(projectDir: string): void {
  mkdirSync(join(projectDir, PRESET_DIST_DIR), { recursive: true });
  const preset = readJson<Record<string, unknown>>(
    join(projectDir, PRESET_META_PATH)
  );

  for (const key of [
    "name",
    "mainPrompt",
    "jailbreak",
    "globalNote",
    "customPromptTemplateToggle",
    "templateDefaultVariables"
  ]) {
    const sourcePath = parseSourceRef(preset[key]);
    if (sourcePath) {
      preset[key] = readText(resolveProjectPath(projectDir, sourcePath), key);
    }
  }

  const promptMeta = readPreferredMetaJson<PromptTemplatePackMeta>(
    projectDir,
    PROMPT_TEMPLATE_SOURCE_META_PATH,
    PROMPT_TEMPLATE_META_PATH
  ) ?? {
    version: 1 as const,
    items: []
  };
  const regexMeta = readPreferredMetaJson<PresetRegexPackMeta>(
    projectDir,
    PRESET_REGEX_SOURCE_META_PATH,
    PRESET_REGEX_META_PATH
  ) ?? {
    version: 1 as const,
    items: []
  };

  preset.promptTemplate = buildPromptTemplateEntries(projectDir, promptMeta);
  preset.regex = buildRegexEntries(projectDir, regexMeta);

  writeJson(join(projectDir, PRESET_DIST_JSON_PATH), preset);
}

export function readPresetEditableSummary(
  projectDir: string
): Record<string, unknown> {
  const srcDir = join(projectDir, PRESET_SRC_DIR);
  const promptDir = join(srcDir, "prompt-template");
  const regexDir = join(srcDir, "regex");
  return {
    name: readText(join(srcDir, PRESET_SOURCES.name)),
    promptTemplateFiles: readDirSafe(promptDir).length,
    regexFiles: readDirSafe(regexDir).length
  };
}

function promptItemSlug(item: Record<string, unknown>, index: number): string {
  const parts = [
    String(index + 1).padStart(3, "0"),
    asString(item.type) || "item",
    asString(item.type2),
    asString(item.role),
    asString(item.name)
  ].filter(Boolean);
  return safeWorkspaceName(parts.join("-"));
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function writeText(path: string, content: string): void {
  writeFileSync(path, content.replace(/\r\n/g, "\n"), "utf-8");
}

function readText(path: string, label?: string): string {
  if (!existsSync(path)) {
    if (label) {
      throw new Error(
        `프리셋 build에 필요한 source 파일이 없습니다 (${label}): ${path}`
      );
    }
    return "";
  }
  return readFileSync(path, "utf-8");
}

function readDirSafe(path: string): string[] {
  return existsSync(path) ? readdirSync(path) : [];
}

function uniqueSourceFile(
  sourceFile: string,
  usedSourceFiles: Set<string>
): string {
  return uniqueWorkspaceRelativePath(sourceFile, usedSourceFiles);
}

function listRelativeFiles(
  projectDir: string,
  relativeDir: string,
  extension: string
): string[] {
  return walkRelativeFiles(
    join(projectDir, relativeDir),
    relativeDir.replace(/\\/g, "/"),
    extension.toLowerCase()
  );
}

function walkRelativeFiles(
  directory: string,
  relativeDir: string,
  extension: string
): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  const entries = readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => compareWorkspaceName(left.name, right.name)
  );
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = join(relativeDir, entry.name).replace(/\\/g, "/");
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkRelativeFiles(absolutePath, relativePath, extension));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
      files.push(relativePath);
    }
  }

  return files;
}

function buildPromptTemplateEntries(
  projectDir: string,
  promptMeta: PromptTemplatePackMeta
): Record<string, unknown>[] {
  const scannedJsonFiles = listRelativeFiles(
    projectDir,
    `${PRESET_SRC_DIR}/prompt-template`,
    ".json"
  );
  const remainingJsonFiles = new Set(scannedJsonFiles);
  const orderedJsonFiles: string[] = [];
  const textFileByJsonFile = new Map<string, string>();

  for (const item of promptMeta.items) {
    const jsonFile = normalizeRelativePath(item.jsonFile);
    if (!jsonFile || !remainingJsonFiles.has(jsonFile)) {
      continue;
    }
    orderedJsonFiles.push(jsonFile);
    remainingJsonFiles.delete(jsonFile);
    if (item.textFile) {
      textFileByJsonFile.set(jsonFile, normalizeRelativePath(item.textFile)!);
    }
  }

  for (const jsonFile of scannedJsonFiles) {
    if (!remainingJsonFiles.has(jsonFile)) {
      continue;
    }
    orderedJsonFiles.push(jsonFile);
    remainingJsonFiles.delete(jsonFile);
  }

  return orderedJsonFiles.map((jsonFile) => {
    const entry = readJson<Record<string, unknown>>(
      resolveProjectPath(projectDir, jsonFile)
    );
    const textFile =
      textFileByJsonFile.get(jsonFile) ?? jsonFile.replace(/\.json$/i, ".md");
    const textPath = resolveProjectPath(projectDir, textFile);
    if (existsSync(textPath)) {
      entry.text = readText(textPath);
    }
    return entry;
  });
}

function buildRegexEntries(
  projectDir: string,
  regexMeta: PresetRegexPackMeta
): Record<string, unknown>[] {
  const scannedFiles = listRelativeFiles(
    projectDir,
    `${PRESET_SRC_DIR}/regex`,
    ".json"
  );
  const remainingFiles = new Set(scannedFiles);
  const orderedFiles: string[] = [];

  for (const item of regexMeta.items) {
    const sourceFile = normalizeRelativePath(item.sourceFile);
    if (!sourceFile || !remainingFiles.has(sourceFile)) {
      continue;
    }
    orderedFiles.push(sourceFile);
    remainingFiles.delete(sourceFile);
  }

  for (const sourceFile of scannedFiles) {
    if (!remainingFiles.has(sourceFile)) {
      continue;
    }
    orderedFiles.push(sourceFile);
    remainingFiles.delete(sourceFile);
  }

  return orderedFiles.map((sourceFile) =>
    readJson<Record<string, unknown>>(
      resolveProjectPath(projectDir, sourceFile)
    )
  );
}
