import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { basename, join, parse } from "node:path";

import { MODULE_SRC_DIR } from "./paths.js";
import {
  asArray,
  asString,
  omitKeys,
  readSource,
  safeFilename,
  uniqueSourceFile,
  writeText
} from "./source-module-fs.js";
import type {
  LorebookPackMeta,
  LorebookPackMetaItem
} from "./source-module-types.js";

export function extractLorebookSources(
  projectDir: string,
  lorebookValue: unknown
): LorebookPackMeta {
  const lorebookEntries = asArray<Record<string, unknown>>(lorebookValue);
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

  return {
    version: 1,
    items: lorebookMeta
  };
}

export function buildLorebookEntries(
  projectDir: string,
  lorebookMeta: LorebookPackMeta
): Record<string, unknown>[] {
  const scanned = scanLorebookWorkspace(projectDir);
  const remainingFolders = new Set(scanned.folderDirs);
  const remainingFiles = new Set(scanned.entryFiles);
  const folderKeyByDir = new Map<string, string>();
  const usedKeys = new Set<string>();
  const built: Record<string, unknown>[] = [];

  for (const item of lorebookMeta.items) {
    if (item.kind === "folder") {
      const folderDir = normalizeRelativePath(item.folderDir);
      if (!folderDir || !remainingFolders.has(folderDir)) {
        continue;
      }
      const entry = structuredClone(item.data);
      const key = asString(entry.key);
      if (key) {
        usedKeys.add(key);
        folderKeyByDir.set(folderDir, key);
      }
      built.push(entry);
      remainingFolders.delete(folderDir);
      continue;
    }

    const sourceFile = normalizeRelativePath(item.sourceFile);
    if (!sourceFile || !remainingFiles.has(sourceFile)) {
      continue;
    }
    const entry = structuredClone(item.data);
    const key = asString(entry.key);
    if (key) {
      usedKeys.add(key);
    }
    entry.content = readSource(projectDir, sourceFile);
    built.push(entry);
    remainingFiles.delete(sourceFile);
  }

  for (const folderDir of [...remainingFolders].sort((left, right) =>
    compareWorkspaceName(left, right)
  )) {
    const folderName = basename(folderDir);
    const folderKey = createUniqueLorebookKey(folderName, usedKeys);
    folderKeyByDir.set(folderDir, folderKey);
    built.push({
      mode: "folder",
      key: folderKey,
      comment: folderName
    });
  }

  for (const sourceFile of [...remainingFiles].sort((left, right) =>
    compareWorkspaceName(left, right)
  )) {
    const parsed = parse(sourceFile);
    const fileBase = parsed.name;
    const folderDir = normalizeRelativePath(
      join(parsed.dir).replace(/\\/g, "/")
    );
    const entry: Record<string, unknown> = {
      key: createUniqueLorebookKey(fileBase, usedKeys),
      comment: fileBase,
      content: readSource(projectDir, sourceFile)
    };
    const folderKey =
      folderDir && folderDir !== rootLorebookDir()
        ? folderKeyByDir.get(folderDir)
        : undefined;
    if (folderKey) {
      entry.folder = folderKey;
    }
    built.push(entry);
  }

  return built;
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

function scanLorebookWorkspace(projectDir: string): {
  folderDirs: string[];
  entryFiles: string[];
} {
  const sourceRoot = join(projectDir, MODULE_SRC_DIR, "lorebook");
  const folders: string[] = [];
  const files: string[] = [];
  walkLorebookDir(sourceRoot, rootLorebookDir(), folders, files);
  return {
    folderDirs: folders,
    entryFiles: files
  };
}

function walkLorebookDir(
  absoluteDir: string,
  relativeDir: string,
  folders: string[],
  files: string[]
): void {
  if (!existsSync(absoluteDir)) {
    return;
  }

  const entries = readdirSync(absoluteDir, { withFileTypes: true }).sort(
    (left, right) => compareWorkspaceName(left.name, right.name)
  );

  for (const entry of entries) {
    const relativePath = join(relativeDir, entry.name).replace(/\\/g, "/");
    const absolutePath = join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      if (
        relativePath !== rootLorebookDir() &&
        relativePath !== rootEntryDir()
      ) {
        folders.push(relativePath);
      }
      walkLorebookDir(absolutePath, relativePath, folders, files);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(relativePath);
    }
  }
}

function rootLorebookDir(): string {
  return `${MODULE_SRC_DIR}/lorebook`;
}

function rootEntryDir(): string {
  return `${MODULE_SRC_DIR}/lorebook/_root`;
}

function normalizeRelativePath(value: string | undefined): string | undefined {
  return value ? value.replace(/\\/g, "/") : undefined;
}

function createUniqueLorebookKey(base: string, usedKeys: Set<string>): string {
  const normalizedBase = safeFilename(base) || "entry";
  let candidate = normalizedBase;
  let suffix = 2;
  while (usedKeys.has(candidate)) {
    candidate = `${normalizedBase}_${suffix}`;
    suffix += 1;
  }
  usedKeys.add(candidate);
  return candidate;
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
