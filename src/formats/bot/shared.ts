import type { AssetMediaKind } from "../../core/assets.js";
import { readFileSync } from "node:fs";

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

export function stripEditableData<T extends CardLike>(card: T): T {
  const nextCard = structuredClone(card);
  if (!nextCard.data) {
    return nextCard;
  }

  const data = nextCard.data as Record<string, unknown>;
  delete data.name;
  delete data.description;
  delete data.first_mes;
  delete data.alternate_greetings;
  delete data.post_history_instructions;

  if (!data.extensions || typeof data.extensions !== "object") {
    return nextCard;
  }

  const extensions = data.extensions as Record<string, unknown>;
  if (!extensions.risuai || typeof extensions.risuai !== "object") {
    return nextCard;
  }

  const risuai = extensions.risuai as Record<string, unknown>;
  delete risuai.backgroundHTML;
  delete risuai.defaultVariables;
  if (Object.keys(risuai).length === 0) {
    delete extensions.risuai;
  }
  if (Object.keys(extensions).length === 0) {
    delete data.extensions;
  }

  return nextCard;
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
    const resolvedPaths = resolveZipAssetPathsFromUri(uri);
    if (resolvedPaths.length === 0) {
      continue;
    }

    for (const resolvedPath of resolvedPaths) {
      result.set(resolvedPath, {
        name:
          asString(record.name) || fileNameFromPath(resolvedPath) || "asset",
        declaredExt: asOptionalString(record.ext),
        mediaKind: toMediaKind(record.type)
      });
    }
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
    for (const resolvedPath of resolveZipAssetPathsFromUri(asString(item[1]))) {
      if (result.has(resolvedPath)) {
        continue;
      }
      result.set(resolvedPath, {
        name: asString(item[0]) || fileNameFromPath(resolvedPath) || "asset",
        declaredExt: asOptionalString(item[2]),
        mediaKind: "image"
      });
    }
  }

  const emotions = Array.isArray(risuExt.emotions)
    ? (risuExt.emotions as unknown[])
    : [];
  for (const item of emotions) {
    if (!Array.isArray(item) || item.length < 2) {
      continue;
    }
    for (const resolvedPath of resolveZipAssetPathsFromUri(asString(item[1]))) {
      if (result.has(resolvedPath)) {
        continue;
      }
      result.set(resolvedPath, {
        name: asString(item[0]) || fileNameFromPath(resolvedPath) || "asset",
        declaredExt: "png",
        mediaKind: "image"
      });
    }
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

export function resolveZipAssetPathsFromUri(uri: string): string[] {
  if (!uri || uri.startsWith("ccdefault:") || uri.startsWith("__asset:")) {
    return [];
  }

  if (uri.startsWith("embeded://")) {
    return [normalizeAssetSourcePath(uri.replace("embeded://", ""))];
  }

  if (uri.startsWith("~risuasset:")) {
    const key = uri.replace("~risuasset:", "");
    if (key.includes("/")) {
      const normalizedPath = normalizeAssetSourcePath(key);
      const withoutAssets = normalizedPath.replace(/^assets\//, "");
      return uniquePaths([normalizedPath, withoutAssets]);
    }

    const [hash, ext] = key.split(":");
    if (!hash) {
      return [];
    }

    const normalizedExt =
      typeof ext === "string" && ext
        ? ext.replace(/^\./, "").toLowerCase()
        : "";
    const candidates = [
      normalizeAssetSourcePath(hash),
      hash,
      normalizedExt ? normalizeAssetSourcePath(`${hash}.${normalizedExt}`) : "",
      normalizedExt ? `${hash}.${normalizedExt}` : ""
    ].filter(Boolean);
    return uniquePaths(candidates);
  }

  return uniquePaths([
    normalizeAssetSourcePath(uri),
    normalizeAssetSourcePath(fileNameFromPath(uri))
  ]);
}

function normalizeAssetSourcePath(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
  return normalized.startsWith("assets/") ? normalized : `assets/${normalized}`;
}

function uniquePaths(value: string[]): string[] {
  return Array.from(new Set(value.map((item) => item.replace(/\\/g, "/"))));
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
