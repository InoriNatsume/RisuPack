import { resolve } from "node:path";

import { detectInputFormat } from "../core/detect.js";
import { assertInputMatchesDetectedFormat } from "../core/input-validation.js";
import { inspectInput } from "../core/inspect.js";
import { readProjectMeta } from "../core/project-meta.js";
import { routeBuild, routeExtract } from "../core/routing.js";
import { ensureWorkspaceGuidance } from "../core/workspace-guidance.js";
import {
  resolveWorkspaceInputPath,
  stageWorkspaceInput
} from "../core/workspace-files.js";
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

export interface StageWorkspaceInputCommandResult {
  command: "stage-input";
  inputPath: string;
  stagedPath: string;
  projectDir: string;
  format: SupportedInputFormat;
}

export async function runExtractCommand(
  inputPath: string,
  projectDir: string
): Promise<ExtractCommandResult> {
  const resolvedInputPath = resolve(inputPath);
  const resolvedProjectDir = resolve(projectDir);
  const format = detectInputFormat(resolvedInputPath);
  await assertInputMatchesDetectedFormat(resolvedInputPath, format);

  await routeExtract(resolvedInputPath, resolvedProjectDir);
  const projectMeta = readProjectMeta(resolvedProjectDir);
  ensureWorkspaceGuidance(resolvedProjectDir, projectMeta);

  return {
    command: "extract",
    inputPath: resolvedInputPath,
    projectDir: resolvedProjectDir,
    format,
    kind: projectMeta.kind
  };
}

export async function runExtractWorkspaceCommand(
  projectDir: string
): Promise<ExtractCommandResult> {
  const resolvedProjectDir = resolve(projectDir);
  const inputPath = resolveWorkspaceInputPath(resolvedProjectDir);
  return runExtractCommand(inputPath, resolvedProjectDir);
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

export async function runBuildWorkspaceCommand(
  projectDir: string
): Promise<BuildCommandResult> {
  return runBuildCommand(resolve(projectDir));
}

export async function runInspectCommand(
  inputPath: string
): Promise<InspectCommandResult> {
  const resolvedInputPath = resolve(inputPath);
  const format = detectInputFormat(resolvedInputPath);
  await assertInputMatchesDetectedFormat(resolvedInputPath, format);
  const details = await inspectInput(resolvedInputPath);

  return {
    command: "inspect",
    inputPath: resolvedInputPath,
    format,
    details
  };
}

export async function runStageWorkspaceInputCommand(
  inputPath: string,
  projectDir: string
): Promise<StageWorkspaceInputCommandResult> {
  const staged = await stageWorkspaceInput(inputPath, projectDir);

  return {
    command: "stage-input",
    inputPath: staged.inputPath,
    stagedPath: staged.stagedPath,
    projectDir: staged.projectDir,
    format: staged.format
  };
}
