import AdmZip from "adm-zip";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

import {
  listRelativeAssetFiles,
  planAssetFile,
  writeAssetFile
} from "../../core/assets.js";
import { readProjectMeta, writeProjectMeta } from "../../core/project-meta.js";
import {
  resolveProjectPath,
  toProjectRelativePath
} from "../../core/project-paths.js";
import type { BotAssetRecord, BotMeta } from "../../types/bot.js";
import type { ProjectMeta } from "../../types/project.js";
import type { BotContainerInfo } from "./container.js";
import {
  extensionForFormat,
  readJson,
  replaceExtension,
  readCardAssetDisplayMap,
  writeAssetsGitignore,
  writeJson,
  type CardLike
} from "./shared.js";
import {
  BOT_META_PATH,
  BUILT_CARD_PATH,
  BUILT_MODULE_PATH,
  CARD_PACK_DIR,
  MODULE_PROJECT_DIR,
  PRESERVED_DIR,
  X_META_DIR
} from "./paths.js";

const ASSETS_DIR = "assets";
const PRESERVED_MODULE_FILENAME = "module.risum";
const PRESERVED_PREFIX_FILENAME = "container-prefix.bin";

export async function extractZipContainer(
  inputPath: string,
  projectDir: string,
  sourceFormat: Extract<
    ProjectMeta["sourceFormat"],
    "charx" | "png" | "jpg" | "jpeg"
  >,
  container: BotContainerInfo
): Promise<CardLike> {
  const inputBytes = readFileSync(inputPath);
  const zipBytes = getZipBytes(inputBytes, container);
  const zip = new AdmZip(zipBytes);
  const cardEntry = zip.getEntry("card.json");

  if (!cardEntry) {
    throw new Error("card.json을 찾을 수 없는 .charx 파일입니다.");
  }

  const card = JSON.parse(cardEntry.getData().toString("utf-8")) as CardLike;
  const entries = zip.getEntries();
  const preservedModuleEntry = zip.getEntry("module.risum");

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, ASSETS_DIR), { recursive: true });
  mkdirSync(join(projectDir, CARD_PACK_DIR), { recursive: true });
  mkdirSync(join(projectDir, PRESERVED_DIR), { recursive: true });
  mkdirSync(join(projectDir, X_META_DIR), { recursive: true });

  const projectMeta: ProjectMeta = {
    kind: "bot",
    sourceFormat,
    sourceName: basename(inputPath),
    createdBy: "risu-workspace-tools",
    version: 1
  };
  writeProjectMeta(projectDir, projectMeta);
  const assetDisplayMap = readCardAssetDisplayMap(card);
  const usedAssetPaths = new Set<string>();

  const assetFiles: string[] = [];
  const botAssets: BotAssetRecord[] = [];
  const xMetaFiles: string[] = [];
  const preservedZipFiles: string[] = [];

  if (preservedModuleEntry) {
    const moduleBytes = preservedModuleEntry.getData();
    writeFileSync(
      join(projectDir, PRESERVED_DIR, PRESERVED_MODULE_FILENAME),
      moduleBytes
    );
  }

  if (container.kind === "jpeg-zip" && (container.zipOffset ?? 0) > 0) {
    writeFileSync(
      join(projectDir, PRESERVED_DIR, PRESERVED_PREFIX_FILENAME),
      inputBytes.subarray(0, container.zipOffset)
    );
  }

  for (const entry of entries) {
    if (entry.isDirectory) {
      continue;
    }

    const safeEntryPath = sanitizeArchiveEntryPath(entry.entryName);

    if (safeEntryPath === "card.json" || safeEntryPath === "module.risum") {
      continue;
    }

    if (safeEntryPath.startsWith("assets/")) {
      const normalizedPath = safeEntryPath;
      const bytes = entry.getData();
      const displayMeta = assetDisplayMap.get(normalizedPath);
      const normalized = planAssetFile(
        {
          bytes,
          outputDir: resolveProjectPath(projectDir, dirname(normalizedPath)),
          baseName: displayMeta?.name ?? basename(normalizedPath),
          declaredExt:
            displayMeta?.declaredExt ??
            (extname(normalizedPath).replace(/^\./, "") || undefined),
          mediaKind: displayMeta?.mediaKind
        },
        usedAssetPaths
      );
      writeAssetFile(normalized.path, bytes);
      const displayPath = toProjectRelativePath(projectDir, normalized.path);
      botAssets.push({
        sourcePath: normalizedPath,
        path: displayPath,
        originalName: displayMeta?.name ?? basename(normalizedPath),
        declaredExt: normalized.declaredExt,
        detectedExt: normalized.detectedExt,
        mediaKind: normalized.mediaKind
      });
      assetFiles.push(displayPath);
    } else {
      const relativeEntryPath = join("pack", safeEntryPath).replace(/\\/g, "/");
      const outPath = resolveProjectPath(projectDir, relativeEntryPath);
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, entry.getData());
      if (safeEntryPath.startsWith("x_meta/")) {
        xMetaFiles.push(safeEntryPath);
      } else {
        preservedZipFiles.push(safeEntryPath);
      }
    }
  }

  const botMeta: BotMeta = {
    format: sourceFormat,
    container: container.kind,
    cardFile: "card.json",
    assetRoot: ASSETS_DIR,
    assets: assetFiles.sort(),
    botAssets: botAssets.sort((left, right) =>
      left.path.localeCompare(right.path)
    ),
    xMetaFiles: xMetaFiles.sort(),
    preservedZipFiles: preservedZipFiles.sort(),
    embeddedModuleProjectDir: preservedModuleEntry
      ? MODULE_PROJECT_DIR
      : undefined,
    preservedModuleFile: preservedModuleEntry
      ? `${PRESERVED_DIR}/${PRESERVED_MODULE_FILENAME}`
      : undefined,
    preservedContainerPrefixFile:
      container.kind === "jpeg-zip" && (container.zipOffset ?? 0) > 0
        ? `${PRESERVED_DIR}/${PRESERVED_PREFIX_FILENAME}`
        : undefined
  };
  writeJson(join(projectDir, BOT_META_PATH), botMeta);
  writeAssetsGitignore(projectDir, ASSETS_DIR);
  return card;
}

function sanitizeArchiveEntryPath(entryName: string): string {
  const normalized = entryName.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`안전하지 않은 아카이브 경로입니다: ${entryName}`);
  }

  const segments = normalized.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`안전하지 않은 아카이브 경로입니다: ${entryName}`);
  }

  return normalized;
}

export async function buildZipContainer(
  projectDir: string,
  outputPath?: string
): Promise<void> {
  const botMeta = readJson<BotMeta>(join(projectDir, BOT_META_PATH));
  const projectMeta = readProjectMeta(projectDir);

  const zip = new AdmZip();
  const builtCardPath = join(projectDir, BUILT_CARD_PATH);
  if (!existsSync(builtCardPath)) {
    throw new Error(
      `봇 source build 결과를 찾을 수 없습니다: ${builtCardPath}`
    );
  }
  const nextCard = readJson<CardLike>(builtCardPath);

  zip.addFile(
    "card.json",
    Buffer.from(JSON.stringify(nextCard, null, 2), "utf-8")
  );

  const builtModulePath = join(projectDir, BUILT_MODULE_PATH);
  if (existsSync(builtModulePath)) {
    const moduleBytes = readFileSync(builtModulePath);
    zip.addFile("module.risum", moduleBytes);
  } else if (botMeta.preservedModuleFile) {
    const moduleBytes = readFileSync(
      resolveProjectPath(projectDir, botMeta.preservedModuleFile)
    );
    zip.addFile("module.risum", moduleBytes);
  }

  const assetsToPack = mapZipAssetsForBuild(projectDir, botMeta);

  for (const asset of assetsToPack) {
    const data = readFileSync(resolveProjectPath(projectDir, asset.path));
    zip.addFile(asset.sourcePath, data);
  }

  for (const metaFile of botMeta.xMetaFiles) {
    const data = readFileSync(
      resolveProjectPath(projectDir, join("pack", metaFile))
    );
    zip.addFile(metaFile, data);
  }

  for (const preservedFile of botMeta.preservedZipFiles ?? []) {
    const data = readFileSync(
      resolveProjectPath(projectDir, join("pack", preservedFile))
    );
    zip.addFile(preservedFile, data);
  }

  const finalOutput =
    outputPath ??
    join(
      projectDir,
      "dist",
      replaceExtension(
        projectMeta.sourceName,
        extensionForFormat(botMeta.format)
      )
    );
  mkdirSync(join(finalOutput, ".."), { recursive: true });

  const zipBytes = zip.toBuffer();
  if (
    botMeta.container === "jpeg-zip" &&
    botMeta.preservedContainerPrefixFile
  ) {
    const prefix = readFileSync(
      join(projectDir, botMeta.preservedContainerPrefixFile)
    );
    writeFileSync(finalOutput, Buffer.concat([prefix, zipBytes]));
    return;
  }

  writeFileSync(finalOutput, zipBytes);
}

function getZipBytes(inputBytes: Buffer, container: BotContainerInfo): Buffer {
  switch (container.kind) {
    case "zip-charx":
      return inputBytes;
    case "jpeg-zip":
      if (container.zipOffset == null || container.zipOffset < 0) {
        throw new Error("JPEG+ZIP 컨테이너에서 ZIP 시작점을 찾지 못했습니다.");
      }
      return inputBytes.subarray(container.zipOffset);
    case "png-chunks":
      throw new Error("PNG 청크형은 ZIP 바이트로 읽을 수 없습니다.");
    default:
      return assertNever(container.kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`처리할 수 없는 값입니다: ${String(value)}`);
}

function mapZipAssetsForBuild(
  projectDir: string,
  botMeta: BotMeta
): Array<{ path: string; sourcePath: string }> {
  const currentAssetPaths = listRelativeAssetFiles(
    resolveProjectPath(projectDir, botMeta.assetRoot),
    botMeta.assetRoot
  );
  const previousRecords =
    botMeta.botAssets?.map((asset, index) => ({
      index,
      path: asset.path,
      sourcePath: asset.sourcePath,
      originalName: asset.originalName
    })) ??
    botMeta.assets.map((asset, index) => ({
      index,
      path: asset,
      sourcePath: asset,
      originalName: basename(asset)
    }));

  return assignWorkspaceAssets(currentAssetPaths, previousRecords).map(
    ({ path, record }) => ({
      path,
      sourcePath: record?.sourcePath ?? path
    })
  );
}

function assignWorkspaceAssets<
  T extends { path: string; originalName?: string }
>(
  currentPaths: string[],
  previousRecords: T[]
): Array<{ path: string; record?: T }> {
  const indexedRecords = previousRecords.map((record, index) => ({
    ...record,
    index
  }));
  const byPath = new Map(indexedRecords.map((record) => [record.path, record]));
  const byStem = new Map<string, Array<T & { index: number }>>();
  indexedRecords.forEach((record) => {
    const stemKeys = new Set([
      stemFromPath(record.path),
      stemFromPath(record.originalName ?? record.path)
    ]);
    for (const key of stemKeys) {
      if (!key) {
        continue;
      }
      const items = byStem.get(key) ?? [];
      items.push(record);
      byStem.set(key, items);
    }
  });

  const results: Array<{ path: string; record?: T }> = [];
  const used = new Set<number>();
  const orderedPrevious = indexedRecords;

  for (const path of currentPaths) {
    const exact = byPath.get(path);
    if (exact && !used.has(exact.index)) {
      used.add(exact.index);
      results.push({ path, record: exact });
      continue;
    }

    const stemMatches = byStem.get(stemFromPath(path)) ?? [];
    const availableStem = stemMatches.find((item) => !used.has(item.index));
    if (availableStem) {
      used.add(availableStem.index);
      results.push({ path, record: availableStem });
      continue;
    }

    const nextByOrder = orderedPrevious.find((item) => !used.has(item.index));
    if (nextByOrder) {
      used.add(nextByOrder.index);
      results.push({ path, record: nextByOrder });
      continue;
    }

    results.push({ path });
  }

  return results;
}

function stemFromPath(value: string): string {
  return basename(value)
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
}
