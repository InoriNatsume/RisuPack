import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import { assignWorkspaceAssets } from "../../core/asset-reconcile.js";
import {
  detectAssetExtension,
  detectAssetMediaKind,
  listRelativeAssetFiles,
  planAssetFile,
  writeAssetFile
} from "../../core/assets.js";
import { readProjectMeta, writeProjectMeta } from "../../core/project-meta.js";
import {
  resolveProjectPath,
  toProjectRelativePath
} from "../../core/project-paths.js";
import {
  readJson,
  writeAssetsGitignore,
  writeJson
} from "../../core/json-files.js";
import { replaceExtension } from "../../core/path-utils.js";
import type {
  ModuleAssetRecord,
  ModuleProjectMeta
} from "../../types/module.js";
import type { ProjectMeta } from "../../types/project.js";
import { loadRisumCodec } from "./container-risum.js";
import { buildModuleSources, extractModuleSources } from "./source-module.js";
import {
  MODULE_ASSET_META_PATH,
  MODULE_DIST_JSON_PATH,
  MODULE_JSON_PATH,
  MODULE_PACK_DIR
} from "./paths.js";

const ASSETS_DIR = "assets";

export async function extractRisum(
  inputPath: string,
  projectDir: string
): Promise<void> {
  const inputBytes = readFileSync(inputPath);
  await extractRisumBytes(inputBytes, basename(inputPath), projectDir);
}

export async function extractRisumBytes(
  inputBytes: Buffer,
  sourceName: string,
  projectDir: string
): Promise<void> {
  const { unpackModule } = await loadRisumCodec();
  const { module, assets } = await unpackModule(inputBytes);

  mkdirSync(projectDir, { recursive: true });
  mkdirSync(join(projectDir, ASSETS_DIR), { recursive: true });
  mkdirSync(join(projectDir, MODULE_PACK_DIR), { recursive: true });

  const projectMeta: ProjectMeta = {
    kind: "module",
    sourceFormat: "risum",
    sourceName,
    createdBy: "risu-workspace-tools",
    version: 1
  };
  writeProjectMeta(projectDir, projectMeta);
  writeJson(join(projectDir, MODULE_JSON_PATH), module);

  const usedPaths = new Set<string>();
  const moduleAssets = Array.isArray(module.assets) ? module.assets : [];
  const assetRecords = assets.map((assetBytes, index) => {
    const moduleAsset = Array.isArray(moduleAssets[index])
      ? moduleAssets[index]
      : [];
    const originalName =
      typeof moduleAsset[0] === "string" && moduleAsset[0]
        ? moduleAsset[0]
        : `asset_${index}`;
    const declaredExt =
      extname(originalName).replace(/^\./, "") ||
      asString(moduleAsset[2]) ||
      undefined;
    const normalized = planAssetFile(
      {
        bytes: assetBytes,
        outputDir: join(projectDir, ASSETS_DIR),
        baseName: originalName,
        declaredExt,
        mediaKind: detectAssetMediaKind(assetBytes)
      },
      usedPaths
    );
    writeAssetFile(normalized.path, assetBytes);

    return {
      sourceIndex: index,
      path: toProjectRelativePath(projectDir, normalized.path),
      originalName,
      declaredExt: normalized.declaredExt,
      detectedExt: normalized.detectedExt,
      mediaKind: normalized.mediaKind
    };
  });

  const moduleMeta: ModuleProjectMeta = {
    assetRoot: ASSETS_DIR,
    assets: assetRecords
  };
  writeJson(join(projectDir, MODULE_ASSET_META_PATH), moduleMeta);
  writeAssetsGitignore(projectDir, ASSETS_DIR);
  extractModuleSources(projectDir, MODULE_JSON_PATH);
}

export async function buildRisum(
  projectDir: string,
  outputPath?: string
): Promise<string> {
  const projectMeta = readProjectMeta(projectDir);
  const packed = await buildRisumBytes(projectDir);
  const finalOutput =
    outputPath ??
    join(
      projectDir,
      "dist",
      replaceExtension(projectMeta.sourceName, ".risum")
    );
  mkdirSync(dirname(finalOutput), { recursive: true });
  writeFileSync(finalOutput, packed);
  return finalOutput;
}

export async function buildRisumBytes(projectDir: string): Promise<Buffer> {
  const { packModule } = await loadRisumCodec();
  buildModuleSources(projectDir);

  const module = readJson<Record<string, unknown>>(
    join(projectDir, MODULE_DIST_JSON_PATH)
  );
  const moduleMeta = readJson<ModuleProjectMeta>(
    join(projectDir, MODULE_ASSET_META_PATH)
  );
  const assetBuildRecords = mapModuleAssetsForBuild(projectDir, moduleMeta);
  const assetBuffers = assetBuildRecords.map((asset) =>
    readFileSync(resolveProjectPath(projectDir, asset.path))
  );
  module.assets = assetBuildRecords.map((asset) => [
    asset.originalName,
    asset.path.replace(/\\/g, "/"),
    asset.declaredExt ?? asset.detectedExt
  ]);

  return packModule(module, assetBuffers);
}
function asString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function mapModuleAssetsForBuild(
  projectDir: string,
  moduleMeta: ModuleProjectMeta
): ModuleAssetRecord[] {
  const currentAssetPaths = listRelativeAssetFiles(
    resolveProjectPath(projectDir, moduleMeta.assetRoot),
    moduleMeta.assetRoot
  );
  const previousRecords = [...moduleMeta.assets].sort(
    (left, right) => left.sourceIndex - right.sourceIndex
  );
  const assigned = assignWorkspaceAssets(currentAssetPaths, previousRecords);
  let nextSourceIndex = previousRecords.reduce(
    (max, item) => Math.max(max, item.sourceIndex),
    -1
  );

  return assigned.map(({ path, record }) => {
    const bytes = readFileSync(resolveProjectPath(projectDir, path));
    const originalName =
      record?.originalName ?? basename(path).replace(/\.[^.]+$/, "");
    const detectedExt = detectAssetExtension(bytes, record?.declaredExt);
    return {
      sourceIndex: record?.sourceIndex ?? ++nextSourceIndex,
      path,
      originalName,
      declaredExt: record?.declaredExt,
      detectedExt,
      mediaKind: detectAssetMediaKind(bytes, record?.mediaKind)
    };
  });
}
