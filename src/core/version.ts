import { readFileSync } from "node:fs";

export const APP_VERSION = readPackageVersion();

function readPackageVersion(): string {
  const raw = readFileSync(
    new URL("../../package.json", import.meta.url),
    "utf-8"
  );
  const packageJson = JSON.parse(raw) as { version?: string };
  return packageJson.version ?? "0.0.0";
}
