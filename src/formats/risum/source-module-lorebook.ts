import { mkdirSync } from "node:fs";
import { join } from "node:path";

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
  return lorebookMeta.items.map((item) => {
    const entry = structuredClone(item.data);
    if (item.kind === "folder") {
      return entry;
    }

    const sourceFile = item.sourceFile ?? "";
    entry.content = sourceFile ? readSource(projectDir, sourceFile) : "";
    return entry;
  });
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
