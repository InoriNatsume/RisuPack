import {
  formatBuildResult,
  formatCommandJson,
  formatExtractResult,
  formatInspectResult
} from "../app/presenters.js";
import type {
  BuildCommandResult,
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

export function handleCliError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`오류: ${message}`);
  process.exit(1);
}
