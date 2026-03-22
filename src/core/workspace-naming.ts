export function safeWorkspaceName(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .trim()
    .replace(/[. ]+$/g, "");

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return "_";
  }

  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(sanitized)) {
    return `_${sanitized}`;
  }

  return sanitized;
}

export function assertSafeWorkspaceRelativePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`안전하지 않은 작업장 상대경로입니다: ${path}`);
  }

  const segments = normalized.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`안전하지 않은 작업장 상대경로입니다: ${path}`);
  }

  return normalized;
}

export function uniqueWorkspaceRelativePath(
  path: string,
  usedPaths: Set<string>
): string {
  const normalized = assertSafeWorkspaceRelativePath(path);
  if (!usedPaths.has(normalized)) {
    usedPaths.add(normalized);
    return normalized;
  }

  const lastSlash = normalized.lastIndexOf("/");
  const directory = lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
  const filename =
    lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
  const dotIndex = filename.lastIndexOf(".");
  const baseName = dotIndex >= 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex >= 0 ? filename.slice(dotIndex) : "";

  let suffix = 2;
  while (true) {
    const candidate = directory
      ? `${directory}/${baseName}_${suffix}${extension}`
      : `${baseName}_${suffix}${extension}`;
    const normalizedCandidate = assertSafeWorkspaceRelativePath(candidate);
    if (!usedPaths.has(normalizedCandidate)) {
      usedPaths.add(normalizedCandidate);
      return normalizedCandidate;
    }
    suffix += 1;
  }
}

export function compareWorkspaceName(left: string, right: string): number {
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
