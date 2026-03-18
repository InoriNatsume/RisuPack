import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";

import { resolveProjectPath } from "../../core/project-paths.js";
import type {
  PresetRegexPackMeta,
  PromptTemplatePackMeta
} from "../../types/preset.js";
import { readJson, writeJson } from "../bot/shared.js";
import {
  PRESET_DIST_DIR,
  PRESET_DIST_JSON_PATH,
  PRESET_META_PATH,
  PRESET_PACK_DIR,
  PRESET_RAW_PATH,
  PRESET_REGEX_META_PATH,
  PRESET_SRC_DIR,
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

  writeJson(join(projectDir, PRESET_RAW_PATH), preset);

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
  writeJson(join(projectDir, PROMPT_TEMPLATE_META_PATH), promptMeta);

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
        `${PRESET_SRC_DIR}/regex/${safeFilename(label)}.json`,
        usedRegexFiles
      );
      writeJson(join(projectDir, sourceFile), entry);
      return { sourceFile };
    })
  };
  writeJson(join(projectDir, PRESET_REGEX_META_PATH), regexMeta);

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

  presetMeta.name = `__SOURCE__:src/${PRESET_SOURCES.name}`;
  presetMeta.mainPrompt = `__SOURCE__:src/${PRESET_SOURCES.mainPrompt}`;
  presetMeta.jailbreak = `__SOURCE__:src/${PRESET_SOURCES.jailbreak}`;
  presetMeta.globalNote = `__SOURCE__:src/${PRESET_SOURCES.globalNote}`;
  presetMeta.customPromptTemplateToggle = `__SOURCE__:src/${PRESET_SOURCES.customPromptTemplateToggle}`;
  presetMeta.templateDefaultVariables = `__SOURCE__:src/${PRESET_SOURCES.templateDefaultVariables}`;
  presetMeta.promptTemplate = `__BUILD_FROM__:${PROMPT_TEMPLATE_META_PATH}`;
  presetMeta.regex = `__BUILD_FROM__:${PRESET_REGEX_META_PATH}`;
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
    const value = preset[key];
    if (typeof value === "string" && value.startsWith("__SOURCE__:")) {
      preset[key] = readText(
        resolveProjectPath(projectDir, value.slice("__SOURCE__:".length)),
        key
      );
    }
  }

  preset.promptTemplate = listRelativeFiles(
    projectDir,
    `${PRESET_SRC_DIR}/prompt-template`,
    ".json"
  ).map((jsonFile) => {
    const entry = readJson<Record<string, unknown>>(
      resolveProjectPath(projectDir, jsonFile)
    );
    const textFile = jsonFile.replace(/\.json$/i, ".md");
    const textPath = resolveProjectPath(projectDir, textFile);
    if (existsSync(textPath)) {
      entry.text = readText(textPath);
    }
    return entry;
  });

  preset.regex = listRelativeFiles(
    projectDir,
    `${PRESET_SRC_DIR}/regex`,
    ".json"
  ).map((sourceFile) =>
    readJson<Record<string, unknown>>(
      resolveProjectPath(projectDir, sourceFile)
    )
  );

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
  return safeFilename(parts.join("-"));
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

function omitKeys(
  value: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key))
  );
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
  const normalized = sourceFile.replace(/\\/g, "/");
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
    if (!usedSourceFiles.has(candidate)) {
      usedSourceFiles.add(candidate);
      return candidate;
    }
    suffix += 1;
  }
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

function compareWorkspaceName(left: string, right: string): number {
  const leftKey = buildSortKey(left);
  const rightKey = buildSortKey(right);
  const baseDiff = leftKey.base.localeCompare(rightKey.base, "en", {
    sensitivity: "base"
  });
  if (baseDiff !== 0) {
    return baseDiff;
  }
  if (leftKey.suffix !== rightKey.suffix) {
    return leftKey.suffix - rightKey.suffix;
  }
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

function buildSortKey(value: string): { base: string; suffix: number } {
  const match = /^(.*?)(?:_(\d+))?(?:\.[^.]+)?$/i.exec(value);
  return {
    base: (match?.[1] ?? value).toLowerCase(),
    suffix: Number(match?.[2] ?? "1")
  };
}
