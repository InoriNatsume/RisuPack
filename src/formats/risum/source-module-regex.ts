import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { resolveProjectPath } from "../../core/project-paths.js";
import { readJson, writeJson } from "../bot/shared.js";
import { MODULE_SRC_DIR } from "./paths.js";
import { asArray, safeFilename, uniqueSourceFile } from "./source-module-fs.js";
import type { RegexPackMeta } from "./source-module-types.js";

export function extractRegexSources(
  projectDir: string,
  regexValue: unknown
): RegexPackMeta {
  const regexEntries = asArray<Record<string, unknown>>(regexValue);
  const usedRegexFiles = new Set<string>();
  const items = regexEntries.map((entry, index) => {
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

  return {
    version: 1,
    items
  };
}

export function buildRegexEntries(
  projectDir: string,
  _regexMeta?: RegexPackMeta
): Record<string, unknown>[] {
  return listRegexSourceFiles(projectDir).map((sourceFile) =>
    readJson<Record<string, unknown>>(
      resolveProjectPath(projectDir, sourceFile)
    )
  );
}

function listRegexSourceFiles(projectDir: string): string[] {
  const sourceRoot = join(projectDir, MODULE_SRC_DIR, "regex");
  return walkJsonFiles(sourceRoot, `${MODULE_SRC_DIR}/regex`);
}

function walkJsonFiles(directory: string, relativeDir: string): string[] {
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
      files.push(...walkJsonFiles(absolutePath, relativePath));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) {
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
