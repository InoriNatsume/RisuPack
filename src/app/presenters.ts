import type {
  BuildCommandResult,
  ExtractAssetsCommandResult,
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

export function formatExtractAssetsResult(
  result: ExtractAssetsCommandResult
): string {
  return [
    "에셋 추출 완료",
    `포맷: ${result.format}`,
    `입력 파일: ${result.inputPath}`,
    `출력 폴더: ${result.outputDir}`,
    `추출된 에셋: ${result.assetCount}개`,
    `매니페스트: ${result.manifestPath}`
  ].join("\n");
}
