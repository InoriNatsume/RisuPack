import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { readJson, writeJson } from "../../core/json-files.js";
import { normalizeRelativePath } from "../../core/path-utils.js";
import { resolveProjectPath } from "../../core/project-paths.js";
import { compareWorkspaceName } from "../../core/workspace-naming.js";
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
  regexMeta?: RegexPackMeta
): Record<string, unknown>[] {
  const scannedFiles = listRegexSourceFiles(projectDir);
  const remainingFiles = new Set(scannedFiles);
  const orderedFiles: string[] = [];

  for (const item of regexMeta?.items ?? []) {
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
