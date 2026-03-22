export function replaceExtension(
  fileName: string,
  nextExtension: string
): string {
  return fileName.replace(/\.[^.]+$/, "") + nextExtension;
}

export function normalizeRelativePath(
  value: string | undefined
): string | undefined {
  return value ? value.replace(/\\/g, "/") : undefined;
}
