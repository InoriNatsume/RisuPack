import { readFileSync } from "node:fs";

export const APP_VERSION = readPackageVersion();

function readPackageVersion(): string {
  try {
    const raw = readFileSync(
      new URL("../../package.json", import.meta.url),
      "utf-8"
    );
    const packageJson = JSON.parse(raw) as { version?: string };
    return packageJson.version ?? "0.0.0";
  } catch {
    return "0.1.0";
  }
}
