import type {
  BuildCommandResult,
  ExtractCommandResult,
  InspectCommandResult
} from "./commands.js";

export function formatExtractResult(result: ExtractCommandResult): string {
  return [
    "extract 완료",
    `포맷: ${result.format}`,
    `종류: ${result.kind}`,
    `입력 파일: ${result.inputPath}`,
    `작업장: ${result.projectDir}`
  ].join("\n");
}

export function formatBuildResult(result: BuildCommandResult): string {
  return [
    "build 완료",
    `종류: ${result.kind}`,
    `원본 포맷: ${result.sourceFormat}`,
    `작업장: ${result.projectDir}`,
    `출력 파일: ${result.outputPath}`
  ].join("\n");
}

export function formatInspectResult(result: InspectCommandResult): string {
  return JSON.stringify(result.details, null, 2);
}

export function formatCommandJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
