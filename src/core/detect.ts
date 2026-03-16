import { extname } from "node:path";

import type { SupportedInputFormat } from "../types/project.js";

const FORMAT_BY_EXTENSION: Record<string, SupportedInputFormat> = {
  ".risum": "risum",
  ".risup": "risup",
  ".risupreset": "risupreset",
  ".charx": "charx",
  ".png": "png",
  ".jpg": "jpg",
  ".jpeg": "jpeg"
};

export function detectInputFormat(inputPath: string): SupportedInputFormat {
  const extension = extname(inputPath).toLowerCase();
  const format = FORMAT_BY_EXTENSION[extension];

  if (!format) {
    throw new Error(
      `지원하지 않는 입력 포맷입니다: "${extension || "(확장자 없음)"}"`
    );
  }

  return format;
}
