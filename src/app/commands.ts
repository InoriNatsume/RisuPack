import { resolve } from "node:path";

import { detectInputFormat } from "../core/detect.js";
import { inspectInput } from "../core/inspect.js";
import { readProjectMeta } from "../core/project-meta.js";
import { routeBuild, routeExtract } from "../core/routing.js";
import type { ProjectKind, SupportedInputFormat } from "../types/project.js";

export interface ExtractCommandResult {
  command: "extract";
  inputPath: string;
  projectDir: string;
  format: SupportedInputFormat;
  kind: ProjectKind;
}

export interface BuildCommandResult {
  command: "build";
  projectDir: string;
  outputPath: string;
  kind: ProjectKind;
  sourceFormat: SupportedInputFormat;
}

export interface InspectCommandResult {
  command: "inspect";
  inputPath: string;
  format: SupportedInputFormat;
  details: Record<string, unknown>;
}

export async function runExtractCommand(
  inputPath: string,
  projectDir: string
): Promise<ExtractCommandResult> {
  const resolvedInputPath = resolve(inputPath);
  const resolvedProjectDir = resolve(projectDir);
  const format = detectInputFormat(resolvedInputPath);

  await routeExtract(resolvedInputPath, resolvedProjectDir);
  const projectMeta = readProjectMeta(resolvedProjectDir);

  return {
    command: "extract",
    inputPath: resolvedInputPath,
    projectDir: resolvedProjectDir,
    format,
    kind: projectMeta.kind
  };
}

export async function runBuildCommand(
  projectDir: string,
  outputPath?: string
): Promise<BuildCommandResult> {
  const resolvedProjectDir = resolve(projectDir);
  const resolvedOutputPath = outputPath ? resolve(outputPath) : undefined;
  const projectMeta = readProjectMeta(resolvedProjectDir);
  const finalOutputPath = await routeBuild(
    resolvedProjectDir,
    resolvedOutputPath
  );

  return {
    command: "build",
    projectDir: resolvedProjectDir,
    outputPath: finalOutputPath,
    kind: projectMeta.kind,
    sourceFormat: projectMeta.sourceFormat
  };
}

export async function runInspectCommand(
  inputPath: string
): Promise<InspectCommandResult> {
  const resolvedInputPath = resolve(inputPath);
  const format = detectInputFormat(resolvedInputPath);
  const details = await inspectInput(resolvedInputPath);

  return {
    command: "inspect",
    inputPath: resolvedInputPath,
    format,
    details
  };
}
