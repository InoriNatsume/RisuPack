import { join } from "node:path";

import { resolveProjectPath } from "../../core/project-paths.js";
import { readJson, writeJson } from "../bot/shared.js";
import { MODULE_SRC_DIR } from "./paths.js";
import { asArray, safeFilename, uniqueSourceFile } from "./source-module-fs.js";
import type { RegexPackMeta } from "./source-module-types.js";

export function extractRegexSources(
  projectDir: string,
  regexValue: unknown
): RegexPackMeta {
  const regexEntries = asArray<Record<string, unknown>>(regexValue);
  const usedRegexFiles = new Set<string>();
  const items = regexEntries.map((entry, index) => {
    const label =
      typeof entry.comment === "string" && entry.comment
        ? entry.comment
        : `regex_${index + 1}`;
    const sourceFile = uniqueSourceFile(
      join(MODULE_SRC_DIR, "regex", `${safeFilename(label)}.json`),
      usedRegexFiles
    );
    writeJson(join(projectDir, sourceFile), entry);
    return { sourceFile };
  });

  return {
    version: 1,
    items
  };
}

export function buildRegexEntries(
  projectDir: string,
  regexMeta: RegexPackMeta
): Record<string, unknown>[] {
  return regexMeta.items.map((item) =>
    readJson<Record<string, unknown>>(
      resolveProjectPath(projectDir, item.sourceFile)
    )
  );
}
