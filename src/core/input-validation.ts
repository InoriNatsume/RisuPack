import { readFileSync, statSync } from "node:fs";

import { assertRisumSignature } from "../formats/risum/container-risum.js";
import { assertRisupSignature } from "../formats/risup/container-risup.js";
import {
  detectBotContainer,
  type BotContainerKind
} from "../formats/bot/container.js";
import type { SupportedInputFormat } from "../types/project.js";

export const LARGE_INPUT_WARNING_THRESHOLD_BYTES = 500 * 1024 * 1024;

export async function assertInputMatchesDetectedFormat(
  inputPath: string,
  format: SupportedInputFormat
): Promise<void> {
  switch (format) {
    case "charx":
    case "png":
    case "jpg":
    case "jpeg": {
      const container = detectBotContainer(inputPath);
      assertBotContainerMatchesFormat(format, container.kind);
      return;
    }
    case "risum":
      assertRisumSignature(readFileSync(inputPath));
      return;
    case "risup":
    case "risupreset":
      await assertRisupSignature(readFileSync(inputPath), format);
      return;
    default:
      return assertNever(format);
  }
}

export function getInputFileSize(inputPath: string): number {
  return statSync(inputPath).size;
}

function assertBotContainerMatchesFormat(
  format: Extract<SupportedInputFormat, "charx" | "png" | "jpg" | "jpeg">,
  containerKind: BotContainerKind
): void {
  if (format === "charx") {
    if (containerKind === "zip-charx" || containerKind === "jpeg-zip") {
      return;
    }
    throw new Error(
      `입력 확장자(${format})와 실제 컨테이너(${describeBotContainer(containerKind)})가 맞지 않습니다.`
    );
  }

  if (format === "png" && containerKind === "png-chunks") {
    return;
  }

  if ((format === "jpg" || format === "jpeg") && containerKind === "jpeg-zip") {
    return;
  }

  throw new Error(
    `입력 확장자(${format})와 실제 컨테이너(${describeBotContainer(containerKind)})가 맞지 않습니다.`
  );
}

function describeBotContainer(containerKind: BotContainerKind): string {
  switch (containerKind) {
    case "zip-charx":
      return "ZIP형 CharX";
    case "jpeg-zip":
      return "JPEG+ZIP";
    case "png-chunks":
      return "PNG 청크";
    default:
      return assertNever(containerKind);
  }
}

function assertNever(value: never): never {
  throw new Error(`처리할 수 없는 값입니다: ${String(value)}`);
}
