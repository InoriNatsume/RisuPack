# Extract-Assets + Standalone Exe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `extract-assets` command to RisuPack and bundle the full CLI as a standalone `risupack.exe` via Bun compile.

**Architecture:** New `extract-assets` command reuses existing format parsers (`AdmZip` for charx/jpg, `listTextChunks` for PNG, `unpackModule` for risum) and the `planAssetFile` pipeline (magic-bytes extension detection, filename sanitization, deduplication). A manifest JSON preserves original metadata for archival. Bun compile wraps the entire CLI into a single exe.

**Tech Stack:** TypeScript, Node.js APIs (`node:fs`, `node:path`), AdmZip, msgpackr (via rpack), commander, Bun (build-time only)

**Spec:** `docs/superpowers/specs/2026-04-19-extract-assets-and-exe-design.md`

**Key docs to check:**
- `docs/format/charx.md` — charx/jpg/png container structure, asset locations, `module.risum` is lorebook/regex/trigger only
- `docs/format/risum.md` — risum binary structure, asset block mapping by array index
- `docs/format/gotchas.md` — `ext` unreliable (§5), `x_meta/` not assets (§6), asset type is role not format (§8), multiple URI forms (§9)

---

## File Structure

### New files

| File | Responsibility |
|------|----------------|
| `src/app/extract-assets.ts` | Core logic: format routing, asset collection from each container type, manifest generation, file output |

### Modified files

| File | Change |
|------|--------|
| `src/app/commands.ts` | Add `runExtractAssetsCommand` function and `ExtractAssetsCommandResult` type |
| `src/app/presenters.ts` | Add `formatExtractAssetsResult` formatter |
| `src/cli/main.ts` | Register `extract-assets` command with commander |
| `src/cli/support.ts` | Add `printExtractAssetsResult` helper |
| `package.json` | Add `build:exe` script |

---

## Task 1: Core extraction logic

**Files:**
- Create: `src/app/extract-assets.ts`

- [ ] **Step 1: Create `src/app/extract-assets.ts` with types and main routing function**

```typescript
import AdmZip from "adm-zip";
import { extname, basename, dirname, join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { detectInputFormat } from "../core/detect.js";
import { planAssetFile, writeAssetFile } from "../core/assets.js";
import { detectBotContainer } from "../formats/bot/container.js";
import {
  decodeBase64TextChunk,
  extractAssetChunkIndex,
  listTextChunks
} from "../formats/bot/png-chunks.js";
import {
  readCardAssetDisplayMap,
  type CardLike
} from "../formats/bot/shared.js";
import { loadRisumCodec } from "../formats/risum/container-risum.js";
import { detectAssetMediaKind } from "../core/assets.js";
import type { AssetMediaKind } from "../core/assets.js";
import type { SupportedInputFormat } from "../types/project.js";

export interface AssetEntry {
  file: string;
  originalName: string;
  declaredExt?: string;
  detectedExt: string;
  mediaKind: AssetMediaKind;
  sourceRef: string;
}

export interface AssetsManifest {
  source: string;
  format: SupportedInputFormat;
  assets: AssetEntry[];
}

export interface ExtractAssetsResult {
  inputPath: string;
  outputDir: string;
  format: SupportedInputFormat;
  assetCount: number;
  manifestPath: string;
}

export async function extractAssets(
  inputPath: string,
  outputDir: string
): Promise<ExtractAssetsResult> {
  const format = detectInputFormat(inputPath);
  const assetsDir = join(outputDir, "assets");
  mkdirSync(assetsDir, { recursive: true });

  let entries: AssetEntry[];

  switch (format) {
    case "charx":
    case "jpg":
    case "jpeg":
      entries = extractAssetsFromZipBot(inputPath, assetsDir);
      break;
    case "png":
      entries = extractAssetsFromPngBot(inputPath, assetsDir);
      break;
    case "risum":
      entries = await extractAssetsFromRisum(inputPath, assetsDir);
      break;
    case "risup":
    case "risupreset":
      throw new Error(
        "프리셋 파일(.risup, .risupreset)에는 에셋이 없습니다."
      );
    default:
      throw new Error(`에셋 추출을 지원하지 않는 포맷입니다: ${format}`);
  }

  const manifest: AssetsManifest = {
    source: basename(inputPath),
    format,
    assets: entries
  };
  const manifestPath = join(outputDir, "assets-manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");

  return {
    inputPath,
    outputDir,
    format,
    assetCount: entries.length,
    manifestPath
  };
}
```

- [ ] **Step 2: Add `extractAssetsFromZipBot` function (charx / jpg / jpeg)**

Append to `src/app/extract-assets.ts`:

```typescript
function extractAssetsFromZipBot(
  inputPath: string,
  assetsDir: string
): AssetEntry[] {
  const inputBytes = readFileSync(inputPath);
  const container = detectBotContainer(inputPath);

  let zipBytes: Buffer;
  switch (container.kind) {
    case "zip-charx":
      zipBytes = inputBytes;
      break;
    case "jpeg-zip":
      if (container.zipOffset == null || container.zipOffset < 0) {
        throw new Error(
          "JPEG+ZIP 컨테이너에서 ZIP 시작점을 찾지 못했습니다."
        );
      }
      zipBytes = inputBytes.subarray(container.zipOffset);
      break;
    default:
      throw new Error(
        `ZIP 기반 에셋 추출에서 예상하지 못한 컨테이너: ${container.kind}`
      );
  }

  const zip = new AdmZip(zipBytes);
  const cardEntry = zip.getEntry("card.json");
  const card: CardLike = cardEntry
    ? JSON.parse(cardEntry.getData().toString("utf-8"))
    : {};
  const displayMap = readCardAssetDisplayMap(card);
  const usedPaths = new Set<string>();
  const entries: AssetEntry[] = [];

  for (const zipEntry of zip.getEntries()) {
    if (zipEntry.isDirectory) {
      continue;
    }

    const entryPath = zipEntry.entryName.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!entryPath.startsWith("assets/")) {
      continue;
    }

    const bytes = zipEntry.getData();
    const displayMeta = displayMap.get(entryPath);
    const normalized = planAssetFile(
      {
        bytes,
        outputDir: join(assetsDir, dirname(entryPath.replace(/^assets\/?/, "")) || "."),
        baseName: displayMeta?.name ?? basename(entryPath),
        declaredExt:
          displayMeta?.declaredExt ??
          (extname(entryPath).replace(/^\./, "") || undefined),
        mediaKind: displayMeta?.mediaKind
      },
      usedPaths
    );
    writeAssetFile(normalized.path, bytes);

    entries.push({
      file: normalized.path
        .replace(/\\/g, "/")
        .replace(assetsDir.replace(/\\/g, "/") + "/", "assets/")
        .replace(/^/, (s) =>
          s.startsWith("assets/") ? "" : "assets/"
        ),
      originalName: displayMeta?.name ?? basename(entryPath),
      declaredExt: normalized.declaredExt,
      detectedExt: normalized.detectedExt,
      mediaKind: normalized.mediaKind,
      sourceRef: entryPath
    });
  }

  return entries;
}
```

- [ ] **Step 3: Add `extractAssetsFromPngBot` function**

Append to `src/app/extract-assets.ts`:

```typescript
function extractAssetsFromPngBot(
  inputPath: string,
  assetsDir: string
): AssetEntry[] {
  const inputBytes = readFileSync(inputPath);
  const textChunks = listTextChunks(inputBytes);

  let cardBytes: Buffer | null = null;
  for (const chunk of textChunks) {
    if (chunk.key === "ccv3") {
      cardBytes = decodeBase64TextChunk(chunk.value);
    }
  }
  if (!cardBytes) {
    for (const chunk of textChunks) {
      if (chunk.key === "chara") {
        cardBytes = decodeBase64TextChunk(chunk.value);
        break;
      }
    }
  }

  const card: CardLike = cardBytes
    ? JSON.parse(cardBytes.toString("utf-8"))
    : {};
  const cardAssets = readPngCardAssets(card);

  const usedPaths = new Set<string>();
  const entries: AssetEntry[] = [];

  for (const chunk of textChunks) {
    const assetIndex = extractAssetChunkIndex(chunk.key);
    if (assetIndex == null) {
      continue;
    }

    const assetBytes = decodeBase64TextChunk(chunk.value);
    const assetMeta = cardAssets.get(assetIndex);
    const normalized = planAssetFile(
      {
        bytes: assetBytes,
        outputDir: assetsDir,
        baseName: assetMeta?.name ?? `asset_${assetIndex}`,
        declaredExt: assetMeta?.declaredExt,
        mediaKind: assetMeta?.mediaKind
      },
      usedPaths
    );
    writeAssetFile(normalized.path, assetBytes);

    entries.push({
      file: `assets/${normalized.fileName}`,
      originalName: assetMeta?.name ?? `asset_${assetIndex}`,
      declaredExt: normalized.declaredExt,
      detectedExt: normalized.detectedExt,
      mediaKind: normalized.mediaKind,
      sourceRef: chunk.key
    });
  }

  return entries;
}

function readPngCardAssets(card: CardLike): Map<
  string,
  { name: string; declaredExt?: string; mediaKind?: AssetMediaKind }
> {
  const result = new Map<
    string,
    { name: string; declaredExt?: string; mediaKind?: AssetMediaKind }
  >();
  const data = (card.data ?? {}) as Record<string, unknown>;

  const assets = Array.isArray(data.assets) ? data.assets : [];
  for (const asset of assets) {
    if (!asset || typeof asset !== "object") continue;
    const record = asset as Record<string, unknown>;
    const uri = typeof record.uri === "string" ? record.uri : "";
    if (!uri.startsWith("__asset:")) continue;
    const index = uri.replace("__asset:", "");
    result.set(index, {
      name: (typeof record.name === "string" && record.name) || `asset_${index}`,
      declaredExt: typeof record.ext === "string" ? record.ext : undefined,
      mediaKind: toMediaKindFromType(record.type)
    });
  }

  const risuExt = ((data.extensions as Record<string, unknown> | undefined)
    ?.risuai ?? {}) as Record<string, unknown>;
  const additionalAssets = Array.isArray(risuExt.additionalAssets)
    ? (risuExt.additionalAssets as unknown[])
    : [];
  for (const item of additionalAssets) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const uri = typeof item[1] === "string" ? item[1] : "";
    if (!uri.startsWith("__asset:")) continue;
    const index = uri.replace("__asset:", "");
    if (result.has(index)) continue;
    result.set(index, {
      name: (typeof item[0] === "string" && item[0]) || `asset_${index}`,
      declaredExt: typeof item[2] === "string" ? item[2] : undefined,
      mediaKind: "image"
    });
  }

  const emotions = Array.isArray(risuExt.emotions)
    ? (risuExt.emotions as unknown[])
    : [];
  for (const item of emotions) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const uri = typeof item[1] === "string" ? item[1] : "";
    if (!uri.startsWith("__asset:")) continue;
    const index = uri.replace("__asset:", "");
    if (result.has(index)) continue;
    result.set(index, {
      name: (typeof item[0] === "string" && item[0]) || `emotion_${index}`,
      declaredExt: "png",
      mediaKind: "image"
    });
  }

  return result;
}

function toMediaKindFromType(typeValue: unknown): AssetMediaKind | undefined {
  const type = typeof typeValue === "string" ? typeValue.toLowerCase() : "";
  if (!type) return undefined;
  if (
    ["icon", "emotion", "background", "portrait", "x-risu-asset"].includes(type)
  )
    return "image";
  if (type === "audio") return "audio";
  if (type === "video") return "video";
  return "binary";
}
```

- [ ] **Step 4: Add `extractAssetsFromRisum` function**

Append to `src/app/extract-assets.ts`:

```typescript
async function extractAssetsFromRisum(
  inputPath: string,
  assetsDir: string
): Promise<AssetEntry[]> {
  const inputBytes = readFileSync(inputPath);
  const { unpackModule } = await loadRisumCodec();
  const { module, assets } = await unpackModule(inputBytes);

  const moduleAssets = Array.isArray((module as any)?.assets)
    ? (module as any).assets
    : [];
  const usedPaths = new Set<string>();
  const entries: AssetEntry[] = [];

  for (let index = 0; index < assets.length; index++) {
    const assetBytes = assets[index];
    const moduleAsset = Array.isArray(moduleAssets[index])
      ? moduleAssets[index]
      : [];
    const originalName =
      typeof moduleAsset[0] === "string" && moduleAsset[0]
        ? moduleAsset[0]
        : `asset_${index}`;
    const declaredExt =
      extname(originalName).replace(/^\./, "") ||
      (typeof moduleAsset[2] === "string" && moduleAsset[2]
        ? moduleAsset[2]
        : undefined);
    const normalized = planAssetFile(
      {
        bytes: assetBytes,
        outputDir: assetsDir,
        baseName: originalName,
        declaredExt,
        mediaKind: detectAssetMediaKind(assetBytes)
      },
      usedPaths
    );
    writeAssetFile(normalized.path, assetBytes);

    entries.push({
      file: `assets/${normalized.fileName}`,
      originalName,
      declaredExt: normalized.declaredExt,
      detectedExt: normalized.detectedExt,
      mediaKind: normalized.mediaKind,
      sourceRef: `asset-block[${index}]`
    });
  }

  return entries;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/extract-assets.ts
git commit -m "feat: add extract-assets core logic"
```

---

## Task 2: Wire into CLI

**Files:**
- Modify: `src/app/commands.ts`
- Modify: `src/app/presenters.ts`
- Modify: `src/cli/support.ts`
- Modify: `src/cli/main.ts`

- [ ] **Step 1: Add command runner to `src/app/commands.ts`**

Add import at top:

```typescript
import {
  extractAssets,
  type ExtractAssetsResult
} from "./extract-assets.js";
```

Add type and function at bottom:

```typescript
export interface ExtractAssetsCommandResult {
  command: "extract-assets";
  inputPath: string;
  outputDir: string;
  format: SupportedInputFormat;
  assetCount: number;
  manifestPath: string;
}

export async function runExtractAssetsCommand(
  inputPath: string,
  outputDir: string
): Promise<ExtractAssetsCommandResult> {
  const resolvedInputPath = resolve(inputPath);
  const resolvedOutputDir = resolve(outputDir);
  const result = await extractAssets(resolvedInputPath, resolvedOutputDir);

  return {
    command: "extract-assets",
    inputPath: result.inputPath,
    outputDir: result.outputDir,
    format: result.format,
    assetCount: result.assetCount,
    manifestPath: result.manifestPath
  };
}
```

- [ ] **Step 2: Add presenter to `src/app/presenters.ts`**

Add import at top:

```typescript
import type { ExtractAssetsCommandResult } from "./commands.js";
```

Add function:

```typescript
export function formatExtractAssetsResult(
  result: ExtractAssetsCommandResult
): string {
  return [
    "에셋 추출 완료",
    `포맷: ${result.format}`,
    `입력 파일: ${result.inputPath}`,
    `출력 폴더: ${result.outputDir}`,
    `추출된 에셋: ${result.assetCount}개`,
    `매니페스트: ${result.manifestPath}`
  ].join("\n");
}
```

- [ ] **Step 3: Add print helper to `src/cli/support.ts`**

Add import:

```typescript
import type { ExtractAssetsCommandResult } from "../app/commands.js";
import {
  formatBuildResult,
  formatCommandJson,
  formatExtractResult,
  formatExtractAssetsResult,
  formatInspectResult
} from "../app/presenters.js";
```

Add function:

```typescript
export function printExtractAssetsResult(
  result: ExtractAssetsCommandResult,
  asJson = false
): void {
  console.log(
    asJson ? formatCommandJson(result) : formatExtractAssetsResult(result)
  );
}
```

- [ ] **Step 4: Register command in `src/cli/main.ts`**

Add import:

```typescript
import { runExtractAssetsCommand } from "../app/commands.js";
import { printExtractAssetsResult } from "./support.js";
```

Add command before `program.parseAsync(...)`:

```typescript
program
  .command("extract-assets")
  .description("입력 파일에서 에셋만 추출합니다.")
  .argument("<input>", "입력 파일 경로 (.charx, .png, .jpg, .jpeg, .risum)")
  .argument("<outputDir>", "에셋을 저장할 출력 폴더 경로")
  .option("--json", "결과를 JSON으로 출력합니다.")
  .option(
    "--yes-large-input",
    "500MB 이상 입력 파일 경고를 확인한 것으로 간주합니다."
  )
  .action(
    async (
      input: string,
      outputDir: string,
      options: { json?: boolean; yesLargeInput?: boolean }
    ) => {
      await confirmLargeInputIfNeeded(input, {
        autoApprove: options.yesLargeInput
      });
      const result = await runExtractAssetsCommand(input, outputDir);
      printExtractAssetsResult(result, options.json);
    }
  );
```

- [ ] **Step 5: Build and verify TypeScript compiles**

Run: `cd RisuPack && npm run build`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/app/commands.ts src/app/presenters.ts src/cli/support.ts src/cli/main.ts
git commit -m "feat: wire extract-assets command into CLI"
```

---

## Task 3: Bun exe build script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Bun (if not already installed)**

Run: `powershell -Command "irm bun.sh/install.ps1 | iex"`

Verify: `bun --version`

- [ ] **Step 2: Add `build:exe` script to `package.json`**

Add to `scripts`:

```json
"build:exe": "bun build src/cli/main.ts --compile --outfile dist/risupack.exe --target bun-windows-x64"
```

- [ ] **Step 3: Build exe and verify**

Run: `cd RisuPack && bun run build:exe`
Expected: `dist/risupack.exe` created

Verify: `./dist/risupack.exe --version`
Expected: prints version

Verify: `./dist/risupack.exe --help`
Expected: shows all commands including `extract-assets`

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: add bun compile script for standalone exe"
```

---

## Task 4: Manual smoke test

- [ ] **Step 1: Test extract-assets with a charx file (if available)**

Run: `./dist/risupack.exe extract-assets path/to/test.charx ./test-output-charx`

Verify:
- `test-output-charx/assets-manifest.json` exists and is valid JSON
- `test-output-charx/assets/` contains extracted files
- File extensions match magic bytes (e.g. a PNG file has `.png` extension)

- [ ] **Step 2: Test extract-assets with a risum file (if available)**

Run: `./dist/risupack.exe extract-assets path/to/test.risum ./test-output-risum`

Verify same as above.

- [ ] **Step 3: Test extract-assets with a png card (if available)**

Run: `./dist/risupack.exe extract-assets path/to/test.png ./test-output-png`

Verify same as above.

- [ ] **Step 4: Test existing commands still work**

Run: `./dist/risupack.exe inspect path/to/test.charx`
Expected: prints metadata as before

- [ ] **Step 5: Test error case — preset file**

Run: `./dist/risupack.exe extract-assets path/to/test.risup ./test-output`
Expected: error message "프리셋 파일(.risup, .risupreset)에는 에셋이 없습니다."

- [ ] **Step 6: Clean up test outputs and commit**

```bash
rm -rf test-output-charx test-output-risum test-output-png test-output
git add -A
git commit -m "feat: extract-assets command and standalone exe build"
```
