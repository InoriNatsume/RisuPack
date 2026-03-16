import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { planAssetFile, writeAssetFile } from "../../core/assets.js";
import { readProjectMeta, writeProjectMeta } from "../../core/project-meta.js";
import {
  resolveProjectPath,
  toProjectRelativePath
} from "../../core/project-paths.js";
import type { ProjectMeta } from "../../types/project.js";
import type { BotMeta, PngAssetRecord } from "../../types/bot.js";
import {
  extensionForFormat,
  readJson,
  replaceExtension,
  writeAssetsGitignore,
  writeJson,
  type CardLike
} from "./shared.js";
import {
  BOT_META_PATH,
  BUILT_CARD_PATH,
  CARD_PACK_DIR,
  CARD_RAW_PATH,
  PRESERVED_DIR
} from "./paths.js";
import {
  decodeBase64TextChunk,
  encodeBase64TextChunk,
  extractAssetChunkIndex,
  listTextChunks,
  rewritePngTextChunks
} from "./png-chunks.js";

const ASSETS_DIR = "assets";
const PRESERVED_PNG_FILENAME = "container-base.png";

type PngCardChunkKey = "ccv3" | "chara";

export async function extractPngContainer(
  inputPath: string,
  projectDir: string,
  sourceFormat: Extract<
    ProjectMeta["sourceFormat"],
    "charx" | "png" | "jpg" | "jpeg"
  >
): Promise<void> {
  const inputBytes = readFileSync(inputPath);
  const textChunks = listTextChunks(inputBytes);
  const cardChunkKeys: PngCardChunkKey[] = [];
  let selectedCardChunk: PngCardChunkKey | null = null;
  let selectedCardBytes: Buffer | null = null;

  for (const chunk of textChunks) {
    if (chunk.key === "chara") {
      cardChunkKeys.push("chara");
      if (!selectedCardBytes) {
        selectedCardChunk = "chara";
        selectedCardBytes = decodeBase64TextChunk(chunk.value);
      }
      continue;
    }

    if (chunk.key === "ccv3") {
      cardChunkKeys.push("ccv3");
      selectedCardChunk = "ccv3";
      selectedCardBytes = decodeBase64TextChunk(chunk.value);
    }
  }

  if (!selectedCardBytes || !selectedCardChunk) {
    throw new Error("PNG 카드 데이터(chara/ccv3)를 찾지 못했습니다.");
  }

  const card = JSON.parse(selectedCardBytes.toString("utf-8")) as CardLike;

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, ASSETS_DIR), { recursive: true });
  mkdirSync(join(projectDir, CARD_PACK_DIR), { recursive: true });
  mkdirSync(join(projectDir, PRESERVED_DIR), { recursive: true });

  const projectMeta: ProjectMeta = {
    kind: "bot",
    sourceFormat,
    sourceName: basename(inputPath),
    createdBy: "risu-workspace-tools",
    version: 1
  };
  writeProjectMeta(projectDir, projectMeta);

  writeJson(join(projectDir, CARD_RAW_PATH), card);
  writeFileSync(
    join(projectDir, PRESERVED_DIR, PRESERVED_PNG_FILENAME),
    inputBytes
  );

  const assetRecords: PngAssetRecord[] = [];
  const usedPaths = new Set<string>();
  const cardAssets = readCardAssets(card);
  for (const chunk of textChunks) {
    const assetIndex = extractAssetChunkIndex(chunk.key);
    if (assetIndex == null) {
      continue;
    }

    const assetBytes = decodeBase64TextChunk(chunk.value);
    const assetMeta = cardAssets.get(assetIndex);
    const normalized = planAssetFile(
      {
        bytes: assetBytes,
        outputDir: join(projectDir, ASSETS_DIR, "png-assets"),
        baseName: assetMeta?.name ?? `asset_${assetIndex}`,
        declaredExt: assetMeta?.declaredExt,
        mediaKind: assetMeta?.mediaKind
      },
      usedPaths
    );
    writeAssetFile(normalized.path, assetBytes);

    assetRecords.push({
      chunkKey: chunk.key,
      assetIndex,
      path: toProjectRelativePath(projectDir, normalized.path),
      originalName: assetMeta?.name ?? `asset_${assetIndex}`,
      declaredExt: normalized.declaredExt,
      detectedExt: normalized.detectedExt,
      mediaKind: normalized.mediaKind
    });
  }

  const botMeta: BotMeta = {
    format: sourceFormat,
    container: "png-chunks",
    cardFile: "card.json",
    assetRoot: ASSETS_DIR,
    assets: assetRecords.map((record) => record.path).sort(),
    xMetaFiles: [],
    preservedContainerFile: `${PRESERVED_DIR}/${PRESERVED_PNG_FILENAME}`,
    pngCardChunkKeys: uniqueCardChunkKeys(cardChunkKeys),
    pngAssets: assetRecords.sort(
      (left, right) => Number(left.assetIndex) - Number(right.assetIndex)
    )
  };
  writeJson(join(projectDir, BOT_META_PATH), botMeta);
  writeAssetsGitignore(projectDir, ASSETS_DIR);
}

export async function buildPngContainer(
  projectDir: string,
  outputPath?: string
): Promise<void> {
  const botMeta = readJson<BotMeta>(join(projectDir, BOT_META_PATH));
  const projectMeta = readProjectMeta(projectDir);

  if (!botMeta.preservedContainerFile) {
    throw new Error("PNG 재조립에 필요한 원본 컨테이너 파일이 없습니다.");
  }

  const builtCardPath = join(projectDir, BUILT_CARD_PATH);
  if (!existsSync(builtCardPath)) {
    throw new Error(
      `봇 source build 결과를 찾을 수 없습니다: ${builtCardPath}`
    );
  }
  const nextCard = readJson<CardLike>(builtCardPath);
  const basePng = readFileSync(
    resolveProjectPath(projectDir, botMeta.preservedContainerFile)
  );
  const cardBuffer = Buffer.from(JSON.stringify(nextCard), "utf-8");
  const replacementChunks = [];

  for (const key of botMeta.pngCardChunkKeys ?? ["ccv3"]) {
    replacementChunks.push({
      key,
      value: encodeBase64TextChunk(cardBuffer)
    });
  }

  for (const asset of botMeta.pngAssets ?? []) {
    const assetBytes = readFileSync(resolveProjectPath(projectDir, asset.path));
    replacementChunks.push({
      key: asset.chunkKey,
      value: encodeBase64TextChunk(assetBytes)
    });
  }

  const stripKeys = new Set<string>(["ccv3", "chara"]);
  for (const asset of botMeta.pngAssets ?? []) {
    stripKeys.add(asset.chunkKey);
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

  const rebuilt = rewritePngTextChunks(basePng, replacementChunks, stripKeys);
  writeFileSync(finalOutput, rebuilt);
}

function uniqueCardChunkKeys(keys: PngCardChunkKey[]): PngCardChunkKey[] {
  return Array.from(new Set(keys));
}

function readCardAssets(card: CardLike): Map<
  string,
  {
    name: string;
    declaredExt?: string;
    mediaKind: "image" | "audio" | "video" | "binary";
  }
> {
  const result = new Map<
    string,
    {
      name: string;
      declaredExt?: string;
      mediaKind: "image" | "audio" | "video" | "binary";
    }
  >();
  const data = (card.data ?? {}) as Record<string, unknown>;
  const assets = Array.isArray(data.assets) ? data.assets : [];

  for (const asset of assets) {
    if (!asset || typeof asset !== "object") {
      continue;
    }
    const record = asset as Record<string, unknown>;
    const uri = typeof record.uri === "string" ? record.uri : "";
    if (!uri.startsWith("__asset:")) {
      continue;
    }
    result.set(uri.replace("__asset:", ""), {
      name:
        typeof record.name === "string" && record.name
          ? record.name
          : uri.replace("__asset:", "asset_"),
      declaredExt: typeof record.ext === "string" ? record.ext : undefined,
      mediaKind: toMediaKind(record.type)
    });
  }

  const risuExt = ((data.extensions as Record<string, unknown> | undefined)
    ?.risuai ?? {}) as Record<string, unknown>;
  const additionalAssets = Array.isArray(risuExt.additionalAssets)
    ? (risuExt.additionalAssets as unknown[])
    : [];

  for (const item of additionalAssets) {
    if (!Array.isArray(item) || item.length < 2) {
      continue;
    }
    const uri = typeof item[1] === "string" ? item[1] : "";
    if (!uri.startsWith("__asset:")) {
      continue;
    }
    result.set(uri.replace("__asset:", ""), {
      name:
        typeof item[0] === "string" && item[0]
          ? item[0]
          : uri.replace("__asset:", "asset_"),
      declaredExt: typeof item[2] === "string" ? item[2] : undefined,
      mediaKind: "image"
    });
  }

  const emotions = Array.isArray(risuExt.emotions)
    ? (risuExt.emotions as unknown[])
    : [];
  for (const item of emotions) {
    if (!Array.isArray(item) || item.length < 2) {
      continue;
    }
    const uri = typeof item[1] === "string" ? item[1] : "";
    if (!uri.startsWith("__asset:")) {
      continue;
    }
    result.set(uri.replace("__asset:", ""), {
      name:
        typeof item[0] === "string" && item[0]
          ? item[0]
          : uri.replace("__asset:", "emotion_"),
      declaredExt: "png",
      mediaKind: "image"
    });
  }

  return result;
}

function toMediaKind(
  typeValue: unknown
): "image" | "audio" | "video" | "binary" {
  const type = typeof typeValue === "string" ? typeValue.toLowerCase() : "";
  if (
    ["icon", "emotion", "background", "portrait", "x-risu-asset"].includes(type)
  ) {
    return "image";
  }
  if (type === "audio") {
    return "audio";
  }
  if (type === "video") {
    return "video";
  }
  return "binary";
}
