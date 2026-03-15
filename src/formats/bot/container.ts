import { readFileSync } from "node:fs";

export type BotContainerKind = "zip-charx" | "jpeg-zip" | "png-chunks";

export interface BotContainerInfo {
  kind: BotContainerKind;
  zipOffset?: number;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);
const JPEG_SOI = Buffer.from([0xff, 0xd8, 0xff]);
const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export function detectBotContainer(inputPath: string): BotContainerInfo {
  const bytes = readFileSync(inputPath);

  if (startsWith(bytes, PNG_SIGNATURE)) {
    return { kind: "png-chunks" };
  }

  if (startsWith(bytes, ZIP_LOCAL_HEADER)) {
    return { kind: "zip-charx", zipOffset: 0 };
  }

  if (startsWith(bytes, JPEG_SOI)) {
    const zipOffset = bytes.indexOf(ZIP_LOCAL_HEADER);
    if (zipOffset >= 0) {
      return { kind: "jpeg-zip", zipOffset };
    }
  }

  throw new Error(
    "지원하지 않는 봇 컨테이너입니다. 현재는 ZIP형 CharX, JPEG+ZIP, PNG 청크만 판별합니다."
  );
}

function startsWith(source: Buffer, signature: Buffer): boolean {
  return source.subarray(0, signature.length).equals(signature);
}
