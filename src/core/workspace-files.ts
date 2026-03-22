import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync
} from "node:fs";
import { basename, extname, join, resolve } from "node:path";

import { detectInputFormat } from "./detect.js";
import { assertInputMatchesDetectedFormat } from "./input-validation.js";

const SUPPORTED_INPUT_EXTENSIONS = new Set([
  ".risum",
  ".charx",
  ".png",
  ".jpg",
  ".jpeg",
  ".risup",
  ".risupreset"
]);

export function ensureWorkspaceRoot(projectDir: string): string {
  const resolvedProjectDir = resolve(projectDir);
  if (existsSync(resolvedProjectDir)) {
    if (!statSync(resolvedProjectDir).isDirectory()) {
      throw new Error(`작업장 경로가 폴더가 아닙니다: ${resolvedProjectDir}`);
    }
    return resolvedProjectDir;
  }

  mkdirSync(resolvedProjectDir, { recursive: true });
  return resolvedProjectDir;
}

export function ensureWorkspaceScaffold(projectDir: string): string {
  const resolvedProjectDir = ensureWorkspaceRoot(projectDir);
  mkdirSync(join(resolvedProjectDir, "imports"), { recursive: true });
  mkdirSync(join(resolvedProjectDir, "dist"), { recursive: true });
  return resolvedProjectDir;
}

export async function stageWorkspaceInput(
  inputPath: string,
  projectDir: string
): Promise<{
  inputPath: string;
  stagedPath: string;
  projectDir: string;
  format: ReturnType<typeof detectInputFormat>;
}> {
  const resolvedProjectDir = ensureWorkspaceScaffold(projectDir);
  const resolvedInputPath = resolve(inputPath);
  const format = detectInputFormat(resolvedInputPath);
  await assertInputMatchesDetectedFormat(resolvedInputPath, format);

  const importsDir = join(resolvedProjectDir, "imports");
  const stagedPath = join(importsDir, basename(resolvedInputPath));
  clearSupportedInputFiles(importsDir, stagedPath);
  if (resolvedInputPath !== stagedPath) {
    copyFileSync(resolvedInputPath, stagedPath);
  }

  return {
    inputPath: resolvedInputPath,
    stagedPath,
    projectDir: resolvedProjectDir,
    format
  };
}

export function resolveWorkspaceInputPath(projectDir: string): string {
  const resolvedProjectDir = resolve(projectDir);
  const importsDir = join(resolvedProjectDir, "imports");

  if (!existsSync(importsDir)) {
    throw new Error(
      "`imports/` 폴더가 없습니다. `risu-workspace-tools workspace stage-input`으로 입력 파일을 준비하세요."
    );
  }

  const candidates = readdirSync(importsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(importsDir, entry.name))
    .filter((candidate) =>
      SUPPORTED_INPUT_EXTENSIONS.has(extname(candidate).toLowerCase())
    );

  if (candidates.length === 0) {
    throw new Error(
      "`imports/` 폴더에 입력 파일이 없습니다. `risu-workspace-tools workspace stage-input`으로 먼저 준비하세요."
    );
  }

  if (candidates.length > 1) {
    throw new Error(
      "`imports/` 폴더에 입력 파일이 여러 개 있습니다. 하나만 남겨주세요: " +
        candidates.map((candidate) => basename(candidate)).join(", ")
    );
  }

  return candidates[0];
}

function clearSupportedInputFiles(
  importsDir: string,
  preservedPath?: string
): void {
  const resolvedPreservedPath = preservedPath ? resolve(preservedPath) : null;

  for (const entry of readdirSync(importsDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    if (!SUPPORTED_INPUT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      continue;
    }

    const candidatePath = join(importsDir, entry.name);
    if (
      resolvedPreservedPath &&
      resolve(candidatePath) === resolvedPreservedPath
    ) {
      continue;
    }

    unlinkSync(candidatePath);
  }
}
