import { join } from "node:path";

import { resolveProjectPath } from "../../core/project-paths.js";
import { readJson, writeJson } from "../bot/shared.js";
import { MODULE_SRC_DIR } from "./paths.js";
import { asArray, readSource, writeText } from "./source-module-fs.js";
import type {
  TriggerMode,
  TriggerPackMetaItem
} from "./source-module-types.js";

export function detectTriggerMode(
  triggers: Record<string, unknown>[]
): TriggerMode {
  const firstTrigger = triggers[0];
  const firstEffect = asArray<Record<string, unknown>>(firstTrigger?.effect)[0];
  const firstType =
    typeof firstEffect?.type === "string" ? firstEffect.type : "";

  if (!firstType) {
    return triggers.length > 0 ? "unsupported-v1" : "none";
  }
  if (firstType === "triggerlua") {
    return "lua";
  }
  if (firstType === "v2Header") {
    return "v2";
  }
  return "unsupported-v1";
}

export function extractTriggerSources(
  projectDir: string,
  triggers: Record<string, unknown>[],
  mode: TriggerMode
): TriggerPackMetaItem {
  switch (mode) {
    case "none":
      return {
        version: 1,
        mode,
        data: []
      };
    case "lua": {
      const triggerIndex = 0;
      const effectIndex = 0;
      const sourceFile = `${MODULE_SRC_DIR}/trigger.lua`;
      const firstTrigger = structuredClone(triggers[triggerIndex] ?? {});
      const firstEffect = asArray<Record<string, unknown>>(firstTrigger.effect)[
        effectIndex
      ];
      const code =
        typeof firstEffect?.code === "string" ? firstEffect.code : "";
      writeText(join(projectDir, sourceFile), code, false);
      return {
        version: 1,
        mode,
        sourceFile,
        triggerIndex,
        effectIndex,
        data: triggers
      };
    }
    case "v2": {
      const sourceFile = `${MODULE_SRC_DIR}/trigger.json`;
      writeJson(join(projectDir, sourceFile), triggers);
      return {
        version: 1,
        mode,
        sourceFile
      };
    }
    case "unsupported-v1": {
      const noteFile = `${MODULE_SRC_DIR}/trigger.unsupported.txt`;
      writeText(
        join(projectDir, noteFile),
        [
          "이 모듈의 trigger는 RisuAI V1 형식이라 현재 source 편집을 지원하지 않습니다.",
          "build 시에는 원본 trigger 데이터가 그대로 보존됩니다."
        ].join("\n"),
        true
      );
      return {
        version: 1,
        mode,
        noteFile,
        data: triggers
      };
    }
  }
}

export function buildTriggersFromMeta(
  projectDir: string,
  meta: TriggerPackMetaItem
): unknown[] {
  switch (meta.mode) {
    case "none":
      return [];
    case "lua": {
      const triggers = structuredClone(
        asArray<Record<string, unknown>>(meta.data)
      );
      const triggerIndex = meta.triggerIndex ?? 0;
      const effectIndex = meta.effectIndex ?? 0;
      const trigger = triggers[triggerIndex];
      const effect = asArray<Record<string, unknown>>(trigger?.effect)[
        effectIndex
      ];
      if (!meta.sourceFile) {
        throw new Error("Lua trigger 재조립에 필요한 source 파일이 없습니다.");
      }
      if (effect && typeof effect === "object") {
        effect.code = readSource(projectDir, meta.sourceFile);
      }
      return triggers;
    }
    case "v2":
      if (!meta.sourceFile) {
        throw new Error("V2 trigger 재조립에 필요한 source 파일이 없습니다.");
      }
      return readJson<unknown[]>(
        resolveProjectPath(projectDir, meta.sourceFile)
      );
    case "unsupported-v1":
      return asArray<Record<string, unknown>>(meta.data);
  }
}
