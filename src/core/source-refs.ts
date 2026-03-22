const SOURCE_REF_PREFIX = "__SOURCE__:";
const BUILD_FROM_REF_PREFIX = "__BUILD_FROM__:";

function normalizeRefPath(path: string): string {
  return path.replace(/\\/g, "/");
}

export function makeSourceRef(path: string): string {
  return `${SOURCE_REF_PREFIX}${normalizeRefPath(path)}`;
}

export function makeBuildFromRef(path: string): string {
  return `${BUILD_FROM_REF_PREFIX}${normalizeRefPath(path)}`;
}

export function parseSourceRef(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith(SOURCE_REF_PREFIX)) {
    return undefined;
  }
  return normalizeRefPath(value.slice(SOURCE_REF_PREFIX.length));
}

export function parseBuildFromRef(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith(BUILD_FROM_REF_PREFIX)) {
    return undefined;
  }
  return normalizeRefPath(value.slice(BUILD_FROM_REF_PREFIX.length));
}
