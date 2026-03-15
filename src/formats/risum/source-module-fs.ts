import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { resolveProjectPath } from "../../core/project-paths.js";

export function safeFilename(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return "_";
  }

  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(sanitized)) {
    return `_${sanitized}`;
  }

  return sanitized;
}

export function assertSafeSourceRelativePath(sourcePath: string): string {
  const normalized = sourcePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`안전하지 않은 source 경로입니다: ${sourcePath}`);
  }

  const segments = normalized.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`안전하지 않은 source 경로입니다: ${sourcePath}`);
  }

  return normalized;
}

export function uniqueSourceFile(
  sourceFile: string,
  usedSourceFiles: Set<string>
): string {
  const normalized = assertSafeSourceRelativePath(
    sourceFile.replace(/\\/g, "/")
  );
  if (!usedSourceFiles.has(normalized)) {
    usedSourceFiles.add(normalized);
    return normalized;
  }

  const lastSlash = normalized.lastIndexOf("/");
  const directory = lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
  const filename =
    lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dotIndex = filename.lastIndexOf(".");
  const baseName = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex >= 0 ? filename.slice(dotIndex) : "";

  let suffix = 2;
  while (true) {
    const candidate = directory
      ? `${directory}/${baseName}_${suffix}${extension}`
      : `${baseName}_${suffix}${extension}`;
    const normalizedCandidate = assertSafeSourceRelativePath(candidate);
    if (!usedSourceFiles.has(normalizedCandidate)) {
      usedSourceFiles.add(normalizedCandidate);
      return normalizedCandidate;
    }
    suffix += 1;
  }
}

export function readSource(projectDir: string, sourceRef: string): string {
  const filepath = resolveProjectPath(projectDir, sourceRef);
  if (!existsSync(filepath)) {
    throw new Error(`module-vcs source 파일을 찾을 수 없습니다: ${filepath}`);
  }
  return readFileSync(filepath, "utf-8");
}

export function writeText(
  path: string,
  content: string,
  appendNewline = true
): void {
  const normalized = content.replace(/\r\n/g, "\n");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, appendNewline ? `${normalized}\n` : normalized, "utf-8");
}

export function wrapStyle(cssContent: string): string {
  return `<style>\n${cssContent.trim()}\n</style>`;
}

export function stripStyleTags(content: string): string {
  let next = content.trim();
  if (next.startsWith("<style>")) {
    next = next.slice("<style>".length);
  }
  if (next.endsWith("</style>")) {
    next = next.slice(0, -"</style>".length);
  }
  return next.replace(/^\n+|\n+$/g, "");
}

export function omitKeys(
  value: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key))
  );
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
