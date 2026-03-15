import { resolve } from "node:path";

function normalizeProjectPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function toProjectRelativePath(
  projectDir: string,
  absolutePath: string
): string {
  const normalizedProjectDir = normalizeProjectPath(resolve(projectDir));
  const normalizedAbsolutePath = normalizeProjectPath(resolve(absolutePath));
  if (normalizedAbsolutePath.startsWith(`${normalizedProjectDir}/`)) {
    return normalizedAbsolutePath.slice(normalizedProjectDir.length + 1);
  }
  return normalizedAbsolutePath;
}

export function resolveProjectPath(
  projectDir: string,
  relativePath: string
): string {
  const projectRoot = normalizeProjectPath(resolve(projectDir));
  const resolvedPath = normalizeProjectPath(resolve(projectRoot, relativePath));

  if (
    resolvedPath !== projectRoot &&
    !resolvedPath.startsWith(`${projectRoot}/`)
  ) {
    throw new Error(`작업 폴더 밖으로 벗어나는 경로입니다: ${relativePath}`);
  }

  return resolvedPath;
}
