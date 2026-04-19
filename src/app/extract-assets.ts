import AdmZip from "adm-zip";
import { basename, extname, join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { detectInputFormat } from "../core/detect.js";
import {
  planAssetFile,
  writeAssetFile,
  detectAssetMediaKind,
  type AssetMediaKind
} from "../core/assets.js";
import { detectBotContainer } from "../formats/bot/container.js";
import {
  listTextChunks,
  extractAssetChunkIndex,
  decodeBase64TextChunk
} from "../formats/bot/png-chunks.js";
import {
  readCardAssetDisplayMap,
  type CardLike
} from "../formats/bot/shared.js";
import { loadRisumCodec } from "../formats/risum/container-risum.js";
import type { SupportedInputFormat } from "../types/project.js";

// ── Types ──

export interface AssetEntry {
  file: string;
  originalName: string;
  declaredExt?: string;
  detectedExt: string;
  mediaKind: AssetMediaKind;
  sourceRef: string;
}

export interface AssetsManifest {
  source: string;
  format: SupportedInputFormat;
  assets: AssetEntry[];
}

export interface ExtractAssetsResult {
  manifest: AssetsManifest;
  manifestPath: string;
  assetCount: number;
}

// ── Main entry ──

export async function extractAssets(
  inputPath: string,
  outputDir: string
): Promise<ExtractAssetsResult> {
  const format = detectInputFormat(inputPath);

  if (format === "risup" || format === "risupreset") {
    throw new Error(
      "프리셋 파일(.risup, .risupreset)에는 에셋이 없습니다."
    );
  }

  const assetsDir = join(outputDir, "assets");
  mkdirSync(assetsDir, { recursive: true });

  let entries: AssetEntry[];

  switch (format) {
    case "charx":
    case "jpg":
    case "jpeg":
      entries = extractAssetsFromZipBot(inputPath, assetsDir, format);
      break;
    case "png":
      entries = extractAssetsFromPngBot(inputPath, assetsDir);
      break;
    case "risum":
      entries = await extractAssetsFromRisum(inputPath, assetsDir);
      break;
    default:
      throw new Error(`에셋 추출을 지원하지 않는 포맷입니다: ${format}`);
  }

  const manifest: AssetsManifest = {
    source: basename(inputPath),
    format,
    assets: entries
  };

  const manifestPath = join(outputDir, "assets-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  return {
    manifest,
    manifestPath,
    assetCount: entries.length
  };
}

// ── ZIP-based extraction (charx / jpg / jpeg) ──

function extractAssetsFromZipBot(
  inputPath: string,
  assetsDir: string,
  format: SupportedInputFormat
): AssetEntry[] {
  const inputBytes = readFileSync(inputPath);
  const container = detectBotContainer(inputPath);

  let zipBytes: Buffer;
  if (container.kind === "jpeg-zip") {
    if (container.zipOffset == null || container.zipOffset < 0) {
      throw new Error("JPEG+ZIP 컨테이너에서 ZIP 시작점을 찾지 못했습니다.");
    }
    zipBytes = inputBytes.subarray(container.zipOffset);
  } else {
    zipBytes = inputBytes;
  }

  const zip = new AdmZip(zipBytes);
  const cardEntry = zip.getEntry("card.json");
  const card: CardLike = cardEntry
    ? (JSON.parse(cardEntry.getData().toString("utf-8")) as CardLike)
    : {};

  const assetDisplayMap = readCardAssetDisplayMap(card);
  const usedPaths = new Set<string>();
  const entries: AssetEntry[] = [];

  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) {
      continue;
    }

    const entryPath = entry.entryName.replace(/\\/g, "/");

    if (!entryPath.startsWith("assets/")) {
      continue;
    }
    if (entryPath === "card.json" || entryPath === "module.risum") {
      continue;
    }
    if (entryPath.startsWith("x_meta/")) {
      continue;
    }

    const bytes = entry.getData();
    const displayMeta = assetDisplayMap.get(entryPath);
    const normalized = planAssetFile(
      {
        bytes,
        outputDir: assetsDir,
        baseName: displayMeta?.name ?? basename(entryPath),
        declaredExt:
          displayMeta?.declaredExt ??
          (extname(entryPath).replace(/^\./, "") || undefined),
        mediaKind: displayMeta?.mediaKind
      },
      usedPaths
    );

    writeAssetFile(normalized.path, bytes);

    entries.push({
      file: `assets/${normalized.fileName}`,
      originalName: displayMeta?.name ?? basename(entryPath),
      declaredExt: normalized.declaredExt,
      detectedExt: normalized.detectedExt,
      mediaKind: normalized.mediaKind,
      sourceRef: entryPath
    });
  }

  return entries;
}

// ── PNG chunk-based extraction ──

function extractAssetsFromPngBot(
  inputPath: string,
  assetsDir: string
): AssetEntry[] {
  const inputBytes = readFileSync(inputPath);
  const textChunks = listTextChunks(inputBytes);

  // Read card JSON (ccv3 priority, chara fallback)
  let card: CardLike = {};
  for (const chunk of textChunks) {
    if (chunk.key === "ccv3") {
      card = JSON.parse(
        decodeBase64TextChunk(chunk.value).toString("utf-8")
      ) as CardLike;
      break;
    }
    if (chunk.key === "chara" && Object.keys(card).length === 0) {
      card = JSON.parse(
        decodeBase64TextChunk(chunk.value).toString("utf-8")
      ) as CardLike;
    }
  }

  // Build index→metadata map from card data
  const assetMetaByIndex = readPngCardAssetMeta(card);

  const usedPaths = new Set<string>();
  const entries: AssetEntry[] = [];

  for (const chunk of textChunks) {
    const assetIndex = extractAssetChunkIndex(chunk.key);
    if (assetIndex == null) {
      continue;
    }

    const assetBytes = decodeBase64TextChunk(chunk.value);
    const meta = assetMetaByIndex.get(assetIndex);
    const normalized = planAssetFile(
      {
        bytes: assetBytes,
        outputDir: assetsDir,
        baseName: meta?.name ?? `asset_${assetIndex}`,
        declaredExt: meta?.declaredExt,
        mediaKind: meta?.mediaKind
      },
      usedPaths
    );

    writeAssetFile(normalized.path, assetBytes);

    entries.push({
      file: `assets/${normalized.fileName}`,
      originalName: meta?.name ?? `asset_${assetIndex}`,
      declaredExt: normalized.declaredExt,
      detectedExt: normalized.detectedExt,
      mediaKind: normalized.mediaKind,
      sourceRef: chunk.key
    });
  }

  return entries;
}

/** Map chunk index → asset metadata from card JSON (V3 data.assets + V2 emotions/additionalAssets). */
function readPngCardAssetMeta(card: CardLike): Map<
  string,
  { name: string; declaredExt?: string; mediaKind?: AssetMediaKind }
> {
  const result = new Map<
    string,
    { name: string; declaredExt?: string; mediaKind?: AssetMediaKind }
  >();

  const data = (card.data ?? {}) as Record<string, unknown>;

  // V3: data.assets[]
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
    const index = uri.replace("__asset:", "");
    result.set(index, {
      name:
        typeof record.name === "string" && record.name
          ? record.name
          : `asset_${index}`,
      declaredExt: typeof record.ext === "string" ? record.ext : undefined,
      mediaKind: toMediaKind(record.type)
    });
  }

  // V2: extensions.risuai
  const risuExt = ((data.extensions as Record<string, unknown> | undefined)
    ?.risuai ?? {}) as Record<string, unknown>;

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
    const index = uri.replace("__asset:", "");
    if (result.has(index)) {
      continue;
    }
    result.set(index, {
      name:
        typeof item[0] === "string" && item[0]
          ? item[0]
          : `emotion_${index}`,
      declaredExt: "png",
      mediaKind: "image"
    });
  }

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
    const index = uri.replace("__asset:", "");
    if (result.has(index)) {
      continue;
    }
    result.set(index, {
      name:
        typeof item[0] === "string" && item[0]
          ? item[0]
          : `asset_${index}`,
      declaredExt: typeof item[2] === "string" ? item[2] : undefined,
      mediaKind: "image"
    });
  }

  return result;
}

// ── Risum extraction ──

async function extractAssetsFromRisum(
  inputPath: string,
  assetsDir: string
): Promise<AssetEntry[]> {
  const inputBytes = readFileSync(inputPath);
  const codec = await loadRisumCodec();
  const { module: mod, assets: assetBuffers } =
    await codec.unpackModule(inputBytes);

  const moduleAssets: Array<[string, string, string]> = Array.isArray(
    mod.assets
  )
    ? mod.assets
    : [];

  const usedPaths = new Set<string>();
  const entries: AssetEntry[] = [];

  for (let i = 0; i < assetBuffers.length; i++) {
    const bytes = assetBuffers[i];
    const tuple = moduleAssets[i] as
      | [string, string, string]
      | undefined;
    const name = tuple?.[0] ?? `asset_${i}`;
    const declaredExt = tuple?.[2] ?? undefined;

    const normalized = planAssetFile(
      {
        bytes,
        outputDir: assetsDir,
        baseName: name,
        declaredExt
      },
      usedPaths
    );

    writeAssetFile(normalized.path, bytes);

    entries.push({
      file: `assets/${normalized.fileName}`,
      originalName: name,
      declaredExt: normalized.declaredExt,
      detectedExt: normalized.detectedExt,
      mediaKind: normalized.mediaKind,
      sourceRef: `asset-block[${i}]`
    });
  }

  return entries;
}

// ── Helpers ──

function toMediaKind(typeValue: unknown): AssetMediaKind | undefined {
  const type = typeof typeValue === "string" ? typeValue.toLowerCase() : "";
  if (!type) {
    return undefined;
  }
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
