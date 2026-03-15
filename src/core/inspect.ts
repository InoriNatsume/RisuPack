import { detectInputFormat } from "./detect.js";
import { inspectBot } from "../formats/bot/inspect.js";
import { inspectRisum } from "../formats/risum/inspect.js";

export async function inspectInput(
  inputPath: string
): Promise<Record<string, unknown>> {
  const format = detectInputFormat(inputPath);

  switch (format) {
    case "risum":
      return inspectRisum(inputPath);
    case "charx":
    case "jpg":
    case "jpeg":
    case "png":
      return inspectBot(inputPath);
    default:
      throw new Error(`지원하지 않는 inspect 포맷입니다: ${format}`);
  }
}
