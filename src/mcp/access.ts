import { basename, delimiter, relative, resolve } from "node:path";

export interface McpAccessPolicy {
  allowedRoots: string[];
}

export function parseMcpAccessPolicy(
  argv: string[],
  env = process.env
): McpAccessPolicy {
  const allowedRoots: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--allow-root") {
      continue;
    }
    const nextValue = argv[index + 1];
    if (!nextValue) {
      throw new Error("--allow-root 다음에 경로가 필요합니다.");
    }
    allowedRoots.push(nextValue);
    index += 1;
  }

  const envRoots = env.RISU_MCP_ALLOWED_ROOTS?.split(delimiter)
    .map((value) => value.trim())
    .filter(Boolean);
  if (envRoots) {
    allowedRoots.push(...envRoots);
  }

  const normalizedRoots =
    allowedRoots.length > 0 ? allowedRoots.map(normalizeAbsolutePath) : [];

  return {
    allowedRoots: Array.from(new Set(normalizedRoots))
  };
}

export function assertMcpAccessPolicyConfigured(policy: McpAccessPolicy): void {
  if (policy.allowedRoots.length > 0) {
    return;
  }

  throw new Error(
    "MCP 서버를 시작하려면 최소 한 개의 허용 루트를 지정해야 합니다. " +
      "`--allow-root <path>` 또는 `RISU_MCP_ALLOWED_ROOTS`를 사용하세요."
  );
}

export function assertMcpPathAllowed(
  policy: McpAccessPolicy,
  targetPath: string,
  label: string
): void {
  const normalizedTarget = normalizeAbsolutePath(targetPath);
  if (
    policy.allowedRoots.some((root) =>
      isWithinAllowedRoot(normalizedTarget, root)
    )
  ) {
    return;
  }

  throw new Error(
    `MCP에서 허용되지 않은 ${label} 경로입니다: ${targetPath}. ` +
      "`--allow-root` 또는 `RISU_MCP_ALLOWED_ROOTS`로 허용 루트를 지정하세요."
  );
}

export function redactMcpPath(
  policy: McpAccessPolicy,
  targetPath: string
): string {
  const normalizedTarget = normalizeAbsolutePath(targetPath);
  const match = policy.allowedRoots.find((root) =>
    isWithinAllowedRoot(normalizedTarget, root)
  );
  if (!match) {
    return basename(targetPath);
  }

  const relativePath = relative(match, normalizedTarget).replace(/\\/g, "/");
  const label =
    policy.allowedRoots.length === 1
      ? "<allowed-root>"
      : `<allowed-root:${policy.allowedRoots.indexOf(match) + 1}>`;
  return relativePath ? `${label}/${relativePath}` : label;
}

export function redactMcpMessage(
  policy: McpAccessPolicy,
  message: string
): string {
  const redacted = policy.allowedRoots.reduce((result, root, index) => {
    const label =
      policy.allowedRoots.length === 1
        ? "<allowed-root>"
        : `<allowed-root:${index + 1}>`;
    const candidates = Array.from(
      new Set([root, root.replace(/\//g, "\\"), root.replace(/\//g, "\\\\")])
    );
    return candidates.reduce((nextResult, candidate) => {
      const escaped = escapeRegExp(candidate);
      return nextResult.replace(new RegExp(escaped, "gi"), label);
    }, result);
  }, message);

  return redacted.replace(/\\/g, "/");
}

function normalizeAbsolutePath(value: string): string {
  const resolvedValue = resolve(value).replace(/\\/g, "/").replace(/\/+$/, "");
  if (process.platform === "win32" && /^[A-Z]:/.test(resolvedValue)) {
    return `${resolvedValue[0].toLowerCase()}${resolvedValue.slice(1)}`;
  }
  return resolvedValue;
}

function isWithinAllowedRoot(targetPath: string, allowedRoot: string): boolean {
  return targetPath === allowedRoot || targetPath.startsWith(`${allowedRoot}/`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
