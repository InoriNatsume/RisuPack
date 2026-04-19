import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { resolve } from "node:path";

import {
  formatBuildResult,
  formatCommandJson,
  formatExtractAssetsResult,
  formatExtractResult,
  formatInspectResult
} from "../app/presenters.js";
import {
  getInputFileSize,
  LARGE_INPUT_WARNING_THRESHOLD_BYTES
} from "../core/input-validation.js";
import type {
  BuildCommandResult,
  ExtractAssetsCommandResult,
  ExtractCommandResult,
  InspectCommandResult
} from "../app/commands.js";

export function printExtractResult(
  result: ExtractCommandResult,
  asJson = false
): void {
  console.log(asJson ? formatCommandJson(result) : formatExtractResult(result));
}

export function printBuildResult(
  result: BuildCommandResult,
  asJson = false
): void {
  console.log(asJson ? formatCommandJson(result) : formatBuildResult(result));
}

export function printInspectResult(result: InspectCommandResult): void {
  console.log(formatInspectResult(result));
}

export function printExtractAssetsResult(
  result: ExtractAssetsCommandResult,
  asJson = false
): void {
  console.log(
    asJson ? formatCommandJson(result) : formatExtractAssetsResult(result)
  );
}

export function handleCliError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`오류: ${message}`);
  process.exit(1);
}

export async function confirmLargeInputIfNeeded(
  inputPath: string,
  options?: {
    autoApprove?: boolean;
    ask?: (message: string) => Promise<boolean>;
  }
): Promise<void> {
  const resolvedInputPath = resolve(inputPath);
  const size = getInputFileSize(resolvedInputPath);
  if (size < LARGE_INPUT_WARNING_THRESHOLD_BYTES || options?.autoApprove) {
    return;
  }

  const message = [
    `입력 파일이 ${formatFileSize(size)}로 큽니다.`,
    `기준 경고 용량은 ${formatFileSize(LARGE_INPUT_WARNING_THRESHOLD_BYTES)}입니다.`,
    "계속 진행하시겠습니까?"
  ].join("\n");

  if (options?.ask) {
    if (await options.ask(message)) {
      return;
    }
    throw new Error("사용자가 대용량 입력 실행을 취소했습니다.");
  }

  if (!input.isTTY || !output.isTTY) {
    throw new Error(
      "500MB 이상 입력 파일은 확인이 필요합니다. 계속하려면 `--yes-large-input` 옵션을 사용하세요."
    );
  }

  const rl = createInterface({ input, output });
  try {
    while (true) {
      const answer = (await rl.question(`${message}\n[y/N] > `))
        .trim()
        .toLowerCase();
      if (!answer || answer === "n" || answer === "no") {
        throw new Error("사용자가 대용량 입력 실행을 취소했습니다.");
      }
      if (answer === "y" || answer === "yes") {
        return;
      }
      console.log("`y` 또는 `n`으로 답해주세요.");
    }
  } finally {
    rl.close();
  }
}

function formatFileSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
