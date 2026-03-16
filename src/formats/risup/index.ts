import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

import { readProjectMeta, writeProjectMeta } from "../../core/project-meta.js";
import type { ProjectMeta } from "../../types/project.js";
import { readJson, writeJson } from "../bot/shared.js";
import {
  decodeRisupContainer,
  encodeRisupContainer
} from "./container-risup.js";
import {
  PRESET_DIST_JSON_PATH,
  PRESET_RAW_PATH,
  RISUP_CONTAINER_META_PATH
} from "./paths.js";
import { buildPresetSources, extractPresetSources } from "./source-risup.js";

export async function extractRisup(
  inputPath: string,
  projectDir: string,
  format: "risup" | "risupreset"
): Promise<void> {
  const decoded = await decodeRisupContainer(readFileSync(inputPath), format);
  const preset = decoded.preset;

  const projectMeta: ProjectMeta = {
    kind: "preset",
    sourceFormat: format,
    sourceName: basename(inputPath),
    createdBy: "risu-workspace-tools",
    version: 1
  };
  writeProjectMeta(projectDir, projectMeta);
  mkdirSync(join(projectDir, "pack"), { recursive: true });
  writeJson(join(projectDir, PRESET_RAW_PATH), preset);
  writeJson(join(projectDir, RISUP_CONTAINER_META_PATH), {
    outerType: decoded.outerType,
    presetVersion: decoded.presetVersion
  });
  extractPresetSources(projectDir, preset);
}

export async function buildRisup(
  projectDir: string,
  outputPath?: string
): Promise<void> {
  const projectMeta = readProjectMeta(projectDir);
  if (
    projectMeta.sourceFormat !== "risup" &&
    projectMeta.sourceFormat !== "risupreset"
  ) {
    throw new Error(
      `risup build 대상이 아닌 프로젝트입니다: ${projectMeta.sourceFormat}`
    );
  }

  buildPresetSources(projectDir);
  const preset = readJson<Record<string, unknown>>(
    join(projectDir, PRESET_DIST_JSON_PATH)
  );
  const containerMeta = readJson<{
    outerType?: string;
    presetVersion?: number;
  }>(join(projectDir, RISUP_CONTAINER_META_PATH));
  const bytes = await encodeRisupContainer(
    preset,
    projectMeta.sourceFormat,
    containerMeta
  );

  const finalOutput =
    outputPath ??
    join(
      projectDir,
      "dist",
      replaceExtension(
        projectMeta.sourceName,
        projectMeta.sourceFormat === "risup" ? ".risup" : ".risupreset"
      )
    );
  mkdirSync(join(finalOutput, ".."), { recursive: true });
  writeFileSync(finalOutput, bytes);
}

function replaceExtension(fileName: string, nextExtension: string): string {
  return fileName.replace(/\.[^.]+$/, "") + nextExtension;
}
