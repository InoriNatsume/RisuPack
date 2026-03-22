import { existsSync } from "node:fs";

import { readJson, writeJson } from "../formats/bot/shared.js";
import { resolveProjectPath } from "./project-paths.js";

export function readPreferredMetaJson<T>(
  projectDir: string,
  sourceMetaPath: string,
  packMetaPath: string
): T | undefined {
  const sourcePath = resolveProjectPath(projectDir, sourceMetaPath);
  if (existsSync(sourcePath)) {
    return readJson<T>(sourcePath);
  }

  const packPath = resolveProjectPath(projectDir, packMetaPath);
  if (existsSync(packPath)) {
    return readJson<T>(packPath);
  }

  return undefined;
}

export function writeMirroredMetaJson(
  projectDir: string,
  sourceMetaPath: string,
  packMetaPath: string,
  value: unknown
): void {
  writeJson(resolveProjectPath(projectDir, sourceMetaPath), value);
  writeJson(resolveProjectPath(projectDir, packMetaPath), value);
}
