import { buildZipContainer, extractZipContainer } from "./container-zip.js";
import { buildPngContainer, extractPngContainer } from "./container-png.js";
import type { SupportedInputFormat } from "../../types/project.js";
import { detectBotContainer } from "./container.js";
import { readJson, type CardLike } from "./shared.js";
import { BOT_META_PATH } from "./paths.js";
import { buildBotSources, extractBotSources } from "./source-bot.js";

export async function extractBot(
  inputPath: string,
  projectDir: string,
  sourceFormat: Extract<SupportedInputFormat, "charx" | "png" | "jpg" | "jpeg">
): Promise<void> {
  const container = detectBotContainer(inputPath);
  let card: CardLike;

  switch (container.kind) {
    case "zip-charx":
    case "jpeg-zip":
      card = await extractZipContainer(
        inputPath,
        projectDir,
        sourceFormat,
        container
      );
      return extractBotSources(projectDir, card);
    case "png-chunks":
      card = await extractPngContainer(inputPath, projectDir, sourceFormat);
      return extractBotSources(projectDir, card);
    default:
      assertNever(container.kind);
  }
}

export async function buildBot(
  projectDir: string,
  outputPath?: string
): Promise<void> {
  await buildBotSources(projectDir);
  const container = readJson<{
    container: "zip-charx" | "jpeg-zip" | "png-chunks";
  }>(`${projectDir}/${BOT_META_PATH}`).container;

  switch (container) {
    case "zip-charx":
    case "jpeg-zip":
      return buildZipContainer(projectDir, outputPath);
    case "png-chunks":
      return buildPngContainer(projectDir, outputPath);
    default:
      return assertNever(container);
  }
}

function assertNever(value: never): never {
  throw new Error(`처리할 수 없는 값입니다: ${String(value)}`);
}
