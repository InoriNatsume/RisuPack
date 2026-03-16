import { detectInputFormat } from "./detect.js";
import { inspectBot } from "../formats/bot/inspect.js";
import { inspectRisum } from "../formats/risum/inspect.js";
import { inspectRisup } from "../formats/risup/inspect.js";

export async function inspectInput(
  inputPath: string
): Promise<Record<string, unknown>> {
  const format = detectInputFormat(inputPath);

  switch (format) {
    case "risum":
      return inspectRisum(inputPath);
    case "risup":
    case "risupreset":
      return inspectRisup(inputPath, format);
    case "charx":
    case "jpg":
    case "jpeg":
    case "png":
      return inspectBot(inputPath);
    default:
      throw new Error(`지원하지 않는 inspect 포맷입니다: ${format}`);
  }
}
