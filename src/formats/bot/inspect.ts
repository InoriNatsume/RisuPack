import { readFileSync } from "node:fs";
import { basename } from "node:path";

import AdmZip from "adm-zip";

import { detectInputFormat } from "../../core/detect.js";
import type { SupportedInputFormat } from "../../types/project.js";
import { detectBotContainer } from "./container.js";
import { decodeBase64TextChunk, listTextChunks } from "./png-chunks.js";

export async function inspectBot(
  inputPath: string
): Promise<Record<string, unknown>> {
  const format = detectInputFormat(inputPath);
  if (format === "risum") {
    throw new Error(`봇 inspect에서 지원하지 않는 포맷입니다: ${format}`);
  }
  const container = detectBotContainer(inputPath);

  if (container.kind === "png-chunks") {
    return inspectPngBot(inputPath, format);
  }

  return inspectZipBot(inputPath, format, {
    kind: container.kind,
    zipOffset: container.zipOffset
  });
}

interface ZipBotContainerInfo {
  kind: "zip-charx" | "jpeg-zip";
  zipOffset?: number;
}

function inspectPngBot(
  inputPath: string,
  format: Exclude<SupportedInputFormat, "risum">
): Record<string, unknown> {
  const chunks = listTextChunks(readFileSync(inputPath));
  let cardBuffer: Buffer | null = null;
  const chunkKeys: string[] = [];
  let assetCount = 0;

  for (const chunk of chunks) {
    if (chunk.key === "chara") {
      chunkKeys.push("chara");
      if (!cardBuffer) {
        cardBuffer = decodeBase64TextChunk(chunk.value);
      }
      continue;
    }

    if (chunk.key === "ccv3") {
      chunkKeys.push("ccv3");
      cardBuffer = decodeBase64TextChunk(chunk.value);
      continue;
    }

    if (chunk.key.startsWith("chara-ext-asset_")) {
      assetCount += 1;
    }
  }

  const card = cardBuffer ? JSON.parse(cardBuffer.toString("utf-8")) : {};
  const data = card.data ?? {};

  return {
    kind: "bot",
    format,
    container: "png-chunks",
    file: basename(inputPath),
    name: data.name ?? "",
    spec: card.spec ?? "",
    specVersion: card.spec_version ?? "",
    assetCount,
    chunkKeys: Array.from(new Set(chunkKeys)),
    hasCharacterBook: !!data.character_book
  };
}

function inspectZipBot(
  inputPath: string,
  format: Exclude<SupportedInputFormat, "risum">,
  container: ZipBotContainerInfo
): Record<string, unknown> {
  const inputBytes = readFileSync(inputPath);
  const zipBytes =
    container.kind === "jpeg-zip" && container.zipOffset != null
      ? inputBytes.subarray(container.zipOffset)
      : inputBytes;

  const zip = new AdmZip(zipBytes);
  const cardEntry = zip.getEntry("card.json");
  if (!cardEntry) {
    throw new Error("card.json을 찾을 수 없는 봇 파일입니다.");
  }

  const card = JSON.parse(cardEntry.getData().toString("utf-8"));
  const data = card.data ?? {};

  return {
    kind: "bot",
    format,
    container: container.kind,
    file: basename(inputPath),
    name: data.name ?? "",
    spec: card.spec ?? "",
    specVersion: card.spec_version ?? "",
    assetCount: zip
      .getEntries()
      .filter(
        (entry) => !entry.isDirectory && entry.entryName.startsWith("assets/")
      ).length,
    xMetaCount: zip
      .getEntries()
      .filter(
        (entry) => !entry.isDirectory && entry.entryName.startsWith("x_meta/")
      ).length,
    hasEmbeddedModule: !!zip.getEntry("module.risum"),
    hasCharacterBook: !!data.character_book
  };
}
