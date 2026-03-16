import { detectInputFormat } from "./detect.js";
import { readProjectMeta } from "./project-meta.js";
import { extractBot, buildBot } from "../formats/bot/index.js";
import { extractRisum, buildRisum } from "../formats/risum/index.js";
import { buildRisup, extractRisup } from "../formats/risup/index.js";

export async function routeExtract(
  inputPath: string,
  projectDir: string
): Promise<void> {
  const format = detectInputFormat(inputPath);

  switch (format) {
    case "risum":
      return extractRisum(inputPath, projectDir);
    case "risup":
    case "risupreset":
      return extractRisup(inputPath, projectDir, format);
    case "charx":
    case "png":
    case "jpg":
    case "jpeg":
      return extractBot(inputPath, projectDir, format);
    default:
      return assertNever(format);
  }
}

export async function routeBuild(
  projectDir: string,
  outputPath?: string
): Promise<void> {
  const meta = readProjectMeta(projectDir);

  switch (meta.kind) {
    case "module":
      return buildRisum(projectDir, outputPath);
    case "bot":
      return buildBot(projectDir, outputPath);
    case "preset":
      return buildRisup(projectDir, outputPath);
    default:
      return assertNever(meta.kind);
  }
}

function assertNever(value: never): never {
  throw new Error(`처리할 수 없는 값입니다: ${String(value)}`);
}
