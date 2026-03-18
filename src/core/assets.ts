import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type AssetMediaKind = "image" | "audio" | "video" | "binary";

export interface NormalizeAssetInput {
  bytes: Buffer;
  outputDir: string;
  baseName: string;
  declaredExt?: string;
  mediaKind?: AssetMediaKind;
}

export interface NormalizedAssetResult {
  path: string;
  fileName: string;
  declaredExt?: string;
  detectedExt: string;
  mediaKind: AssetMediaKind;
}

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);

const KNOWN_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "avif",
  "mp3",
  "wav",
  "ogg",
  "m4a",
  "mp4",
  "webm",
  "mov",
  "mkv"
]);

export function planAssetFile(
  input: NormalizeAssetInput,
  usedPaths: Set<string>
): NormalizedAssetResult {
  const declaredExt = normalizeExtension(input.declaredExt);
  const detectedExt = detectAssetExtension(input.bytes, declaredExt);
  const mediaKind = detectAssetMediaKind(input.bytes, input.mediaKind);
  const sanitizedBaseName =
    sanitizeFilename(stripExtension(input.baseName)) || "asset";
  const relativePath = createUniqueRelativePath(
    input.outputDir,
    sanitizedBaseName,
    detectedExt,
    usedPaths
  );

  return {
    path: toPosix(relativePath),
    fileName: relativePath.split(/[/\\]/).at(-1) ?? relativePath,
    declaredExt,
    detectedExt,
    mediaKind
  };
}

export function writeAssetFile(path: string, bytes: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes);
}

export function listRelativeAssetFiles(
  absoluteRoot: string,
  projectRelativeRoot: string
): string[] {
  return walkRelativeAssetFiles(
    absoluteRoot,
    projectRelativeRoot.replace(/\\/g, "/")
  );
}

export function detectAssetExtension(
  bytes: Buffer,
  declaredExt?: string
): string {
  const normalizedDeclared = normalizeExtension(declaredExt);

  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return "png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpg";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }
  if (bytes.length >= 6) {
    const head = bytes.subarray(0, 6).toString("ascii");
    if (head === "GIF87a" || head === "GIF89a") {
      return "gif";
    }
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(4, 12).toString("ascii") === "ftypavif"
  ) {
    return "avif";
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "bmp";
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(4, 8).toString("ascii") === "ftyp" &&
    ["isom", "mp41", "mp42", "M4A ", "M4V "].includes(
      bytes.subarray(8, 12).toString("ascii")
    )
  ) {
    const majorBrand = bytes.subarray(8, 12).toString("ascii");
    if (majorBrand === "M4A ") {
      return "m4a";
    }
    return "mp4";
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF") {
    if (bytes.subarray(8, 12).toString("ascii") === "WAVE") {
      return "wav";
    }
  }
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString("ascii") === "OggS") {
    return "ogg";
  }
  if (bytes.length >= 3 && bytes.subarray(0, 3).toString("ascii") === "ID3") {
    return "mp3";
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return "mp3";
  }
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  ) {
    return "webm";
  }

  if (normalizedDeclared && KNOWN_EXTENSIONS.has(normalizedDeclared)) {
    return normalizedDeclared;
  }

  return normalizedDeclared ?? "bin";
}

export function detectAssetMediaKind(
  bytes: Buffer,
  hintedKind?: AssetMediaKind
): AssetMediaKind {
  if (hintedKind) {
    return hintedKind;
  }

  const ext = detectAssetExtension(bytes);
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"].includes(ext)) {
    return "image";
  }
  if (["mp3", "wav", "ogg", "m4a"].includes(ext)) {
    return "audio";
  }
  if (["mp4", "webm", "mov", "mkv"].includes(ext)) {
    return "video";
  }
  return "binary";
}

export function sanitizeFilename(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
}

function stripExtension(value: string): string {
  return value.replace(/\.[^.]+$/, "");
}

function normalizeExtension(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.replace(/^\./, "").trim().toLowerCase();
  return normalized || undefined;
}

function createUniqueRelativePath(
  outputDir: string,
  baseName: string,
  extension: string,
  usedPaths: Set<string>
): string {
  let counter = 0;
  while (true) {
    const suffix = counter === 0 ? "" : `_${counter}`;
    const candidate = toPosix(
      join(outputDir, `${baseName}${suffix}.${extension}`)
    );
    if (!usedPaths.has(candidate)) {
      usedPaths.add(candidate);
      return candidate;
    }
    counter += 1;
  }
}

function toPosix(value: string): string {
  return value.replace(/\\/g, "/");
}

function walkRelativeAssetFiles(
  absoluteDir: string,
  relativeDir: string
): string[] {
  if (!existsSync(absoluteDir)) {
    return [];
  }

  const entries = readdirSync(absoluteDir, { withFileTypes: true }).sort(
    (left, right) => compareWorkspaceName(left.name, right.name)
  );
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = toPosix(join(relativeDir, entry.name));
    const absolutePath = join(absoluteDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkRelativeAssetFiles(absolutePath, relativePath));
      continue;
    }
    if (entry.isFile() && entry.name !== ".gitignore") {
      files.push(relativePath);
    }
  }

  return files;
}

function compareWorkspaceName(left: string, right: string): number {
  const leftKey = buildSortKey(left);
  const rightKey = buildSortKey(right);
  const baseDiff = leftKey.base.localeCompare(rightKey.base, "en", {
    sensitivity: "base"
  });
  if (baseDiff !== 0) {
    return baseDiff;
  }
  if (leftKey.suffix !== rightKey.suffix) {
    return leftKey.suffix - rightKey.suffix;
  }
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

function buildSortKey(value: string): { base: string; suffix: number } {
  const match = /^(.*?)(?:_(\d+))?(?:\.[^.]+)?$/i.exec(value);
  return {
    base: (match?.[1] ?? value).toLowerCase(),
    suffix: Number(match?.[2] ?? "1")
  };
}
