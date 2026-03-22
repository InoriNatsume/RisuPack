import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", "utf-8");
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf-8")) as T;
}

export function writeAssetsGitignore(
  projectDir: string,
  assetRoot: string
): void {
  writeFileSync(
    join(projectDir, assetRoot, ".gitignore"),
    "*\n!.gitignore\n",
    "utf-8"
  );
}
