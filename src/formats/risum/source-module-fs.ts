import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { resolveProjectPath } from "../../core/project-paths.js";
import {
  assertSafeWorkspaceRelativePath,
  safeWorkspaceName,
  uniqueWorkspaceRelativePath
} from "../../core/workspace-naming.js";

export const safeFilename = safeWorkspaceName;
export const assertSafeSourceRelativePath = assertSafeWorkspaceRelativePath;
export const uniqueSourceFile = uniqueWorkspaceRelativePath;

export function readSource(projectDir: string, sourceRef: string): string {
  const filepath = resolveProjectPath(projectDir, sourceRef);
  if (!existsSync(filepath)) {
    throw new Error(`모듈 source 파일을 찾을 수 없습니다: ${filepath}`);
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

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
