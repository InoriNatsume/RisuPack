import { readFileSync } from "node:fs";

import { decodeRisupContainer } from "./container-risup.js";

export async function inspectRisup(
  inputPath: string,
  format: "risup" | "risupreset"
): Promise<Record<string, unknown>> {
  const decoded = await decodeRisupContainer(readFileSync(inputPath), format);
  const preset = decoded.preset;
  const promptTemplate = Array.isArray(preset.promptTemplate)
    ? preset.promptTemplate
    : [];
  const regex = Array.isArray(preset.regex) ? preset.regex : [];

  return {
    kind: "preset",
    format,
    outerType: decoded.outerType,
    presetVersion: decoded.presetVersion,
    name: typeof preset.name === "string" ? preset.name : "",
    promptTemplateCount: promptTemplate.length,
    regexCount: regex.length,
    hasMainPrompt:
      typeof preset.mainPrompt === "string" && preset.mainPrompt.length > 0,
    hasCustomPromptTemplateToggle:
      typeof preset.customPromptTemplateToggle === "string" &&
      preset.customPromptTemplateToggle.length > 0,
    hasTemplateDefaultVariables:
      typeof preset.templateDefaultVariables === "string" &&
      preset.templateDefaultVariables.length > 0
  };
}
