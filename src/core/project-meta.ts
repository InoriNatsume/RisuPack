import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { ProjectMeta } from "../types/project.js";

export const PROJECT_META_FILENAME = "project.meta.json";

export function projectMetaPath(projectDir: string): string {
  return join(projectDir, PROJECT_META_FILENAME);
}

export function hasProjectMeta(projectDir: string): boolean {
  return existsSync(projectMetaPath(projectDir));
}

export function readProjectMeta(projectDir: string): ProjectMeta {
  const metaPath = projectMetaPath(projectDir);
  const raw = readFileSync(metaPath, "utf-8");
  return JSON.parse(raw) as ProjectMeta;
}

export function writeProjectMeta(projectDir: string, meta: ProjectMeta): void {
  mkdirSync(projectDir, { recursive: true });
  const metaPath = projectMetaPath(projectDir);
  writeFileSync(metaPath, JSON.stringify(meta, null, 2) + "\n", "utf-8");
}
