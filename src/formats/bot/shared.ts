import type { AssetMediaKind } from "../../core/assets.js";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { BotEditableData, BotMeta } from "../../types/bot.js";

export interface CardLike {
  spec?: string;
  spec_version?: string;
  data?: Record<string, unknown>;
}

export interface CardAssetDisplayMeta {
  name: string;
  declaredExt?: string;
  mediaKind?: AssetMediaKind;
}

export function toEditableData(card: CardLike): BotEditableData {
  const data = (card.data ?? {}) as Record<string, unknown>;
  const risuExt = ((data.extensions as Record<string, unknown> | undefined)
    ?.risuai ?? {}) as Record<string, unknown>;

  return {
    name: asString(data.name),
    description: asString(data.description),
    firstMessage: asString(data.first_mes),
    additionalFirstMessages: asStringArray(data.alternate_greetings),
    globalNote: asString(data.post_history_instructions),
    css: asString(risuExt.backgroundHTML),
    defaultVariables: asString(risuExt.defaultVariables)
  };
}

export function applyEditableData<T extends CardLike>(
  card: T,
  editable: BotEditableData
): T {
  const nextCard = structuredClone(card);
  if (!nextCard.data) {
    nextCard.data = {};
  }

  const data = nextCard.data as Record<string, unknown>;
  data.name = editable.name;
  data.description = editable.description;
  data.first_mes = editable.firstMessage;
  data.alternate_greetings = editable.additionalFirstMessages;
  data.post_history_instructions = editable.globalNote;

  if (!data.extensions || typeof data.extensions !== "object") {
    data.extensions = {};
  }
  const extensions = data.extensions as Record<string, unknown>;
  if (!extensions.risuai || typeof extensions.risuai !== "object") {
    extensions.risuai = {};
  }
  const risuai = extensions.risuai as Record<string, unknown>;
  risuai.backgroundHTML = editable.css;
  risuai.defaultVariables = editable.defaultVariables;

  return nextCard;
}

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function writeAssetsGitignore(
  projectDir: string,
  assetRoot: string
): void {
  // 에셋은 추출하지만 기본 Git 추적 대상에서는 제외합니다.
  writeFileSync(
    join(projectDir, assetRoot, ".gitignore"),
    "*\n!.gitignore\n",
    "utf-8"
  );
}

export function replaceExtension(
  fileName: string,
  nextExtension: string
): string {
  return fileName.replace(/\.[^.]+$/, "") + nextExtension;
}

export function extensionForFormat(format: BotMeta["format"]): string {
  switch (format) {
    case "charx":
      return ".charx";
    case "jpg":
      return ".jpg";
    case "jpeg":
      return ".jpeg";
    case "png":
      return ".png";
    default:
      return ".charx";
  }
}

export function readCardAssetDisplayMap(
  card: CardLike
): Map<string, CardAssetDisplayMeta> {
  const result = new Map<string, CardAssetDisplayMeta>();
  const data = (card.data ?? {}) as Record<string, unknown>;
  const cardAssets = Array.isArray(data.assets) ? data.assets : [];

  for (const asset of cardAssets) {
    if (!asset || typeof asset !== "object") {
      continue;
    }
    const record = asset as Record<string, unknown>;
    const uri = asString(record.uri);
    const resolvedPath = resolveZipAssetPathFromUri(uri);
    if (!resolvedPath) {
      continue;
    }

    result.set(resolvedPath, {
      name: asString(record.name) || fileNameFromPath(resolvedPath) || "asset",
      declaredExt: asOptionalString(record.ext),
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
    const resolvedPath = resolveZipAssetPathFromUri(asString(item[1]));
    if (!resolvedPath || result.has(resolvedPath)) {
      continue;
    }
    result.set(resolvedPath, {
      name: asString(item[0]) || fileNameFromPath(resolvedPath) || "asset",
      declaredExt: asOptionalString(item[2]),
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
    const resolvedPath = resolveZipAssetPathFromUri(asString(item[1]));
    if (!resolvedPath || result.has(resolvedPath)) {
      continue;
    }
    result.set(resolvedPath, {
      name: asString(item[0]) || fileNameFromPath(resolvedPath) || "asset",
      declaredExt: "png",
      mediaKind: "image"
    });
  }

  return result;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function resolveZipAssetPathFromUri(uri: string): string | null {
  if (!uri || uri.startsWith("ccdefault:") || uri.startsWith("__asset:")) {
    return null;
  }

  if (uri.startsWith("embeded://")) {
    return normalizeAssetSourcePath(uri.replace("embeded://", ""));
  }

  if (uri.startsWith("~risuasset:")) {
    const key = uri.replace("~risuasset:", "");
    if (key.includes("/")) {
      return normalizeAssetSourcePath(key);
    }
    return null;
  }

  return normalizeAssetSourcePath(uri);
}

function normalizeAssetSourcePath(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.startsWith("assets/") ? normalized : `assets/${normalized}`;
}

function fileNameFromPath(value: string): string {
  const normalized = value.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function toMediaKind(typeValue: unknown): AssetMediaKind | undefined {
  const type = asString(typeValue).toLowerCase();
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
