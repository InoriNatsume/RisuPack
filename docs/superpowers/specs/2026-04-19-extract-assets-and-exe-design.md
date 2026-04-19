# Extract-Assets Command + Standalone Exe Build

## Summary

Add an `extract-assets` command to RisuPack that pulls assets (with metadata) out of bot containers (.charx, .png, .jpg, .jpeg) and module files (.risum). Bundle the entire CLI as a standalone `risupack.exe` via `bun build --compile` so non-developers can use it without installing Node.js or Bun.

## Motivation

End users want to extract assets from RisuAI files without a dev environment. The existing codebase already contains all necessary parsers and the magic-bytes extension detection logic (`detectAssetExtension` in `src/core/assets.ts`). Compiling to a single exe with the new command added is the most practical path.

## Scope

### In scope

- New `extract-assets` CLI command
- `bun build --compile` integration for standalone exe
- Metadata manifest output alongside extracted assets

### Out of scope

- Preset files (`.risup`, `.risupreset`) — they contain no assets
- GUI or interactive asset browser
- Cross-platform exe builds (Windows only for now; other targets can be added later)

## Design

### 1. `extract-assets` Command

```
risupack extract-assets <input> <outputDir>
```

**Supported formats**: `.charx`, `.png`, `.jpg`, `.jpeg`, `.risum`

**Behavior**:

1. `detectInputFormat` identifies the format by extension.
2. Format-specific container opener collects raw asset bytes and source metadata.
3. Each asset goes through `planAssetFile` — magic-bytes extension detection, filename sanitization, deduplication.
4. Assets are written to `<outputDir>/assets/`.
5. A manifest is written to `<outputDir>/assets-manifest.json`.

**Critical gotchas from `docs/format/gotchas.md` that apply**:

- `asset.ext` may not be the real extension; magic bytes decide (gotchas §5).
- `x_meta/` is not an asset folder; exclude it from extraction (gotchas §6).
- Asset type is a role, not a media format; detect actual format from bytes (gotchas §8).
- Asset URIs come in multiple forms (`embeded://`, `__asset:N`, `data:`, `ccdefault:`); handle all (gotchas §9).
- In bot containers (charx/jpg/png), `module.risum` holds lorebook, regex, and trigger — not assets. The assets live in the ZIP `assets/` folder or PNG chunks. Only standalone `.risum` files have their own asset binary blocks (gotchas §10, charx.md §3.2).

### 2. Output Structure

```
<outputDir>/
├── assets-manifest.json
└── assets/
    ├── icon.png
    ├── emotion_happy.webp
    └── bgm.mp3
```

### 3. assets-manifest.json

```typescript
interface AssetsManifest {
  source: string;           // input filename
  format: SupportedInputFormat;
  assets: AssetEntry[];
}

interface AssetEntry {
  file: string;            // relative path from outputDir
  originalName: string;    // name from metadata
  declaredExt?: string;    // ext from metadata (may be unreliable)
  detectedExt: string;     // ext from magic bytes
  mediaKind: "image" | "audio" | "video" | "binary";
  sourceRef: string;       // original reference (ZIP path, chunk key, or array index)
}
```

### 4. Format-Specific Extraction Logic

#### charx / jpg / jpeg (ZIP-based)

- Open ZIP via `AdmZip` (for jpg/jpeg, slice from `PK\x03\x04` offset).
- Iterate ZIP entries under `assets/`; skip `card.json`, `module.risum`, `x_meta/`.
- Read `card.json` → `data.assets[]` for display metadata mapping (name, declared ext, type).
- Use `readCardAssetDisplayMap` from `shared.ts` for consistent metadata resolution.
- Skip `module.risum` — it contains lorebook/regex/trigger, not assets.

#### png

- `listTextChunks` to read all tEXt chunks.
- `extractAssetChunkIndex` to identify asset chunks (`chara-ext-asset_:N`).
- Decode each chunk via `decodeBase64TextChunk`.
- Read card JSON from `ccv3` chunk (priority) or `chara` chunk (fallback) for asset metadata.
- Map `__asset:N` URIs from `data.assets[]` to chunk indices.
- Also check V2 locations: `extensions.risuai.emotions[]`, `additionalAssets[]`.

#### risum

- `unpackModule` to get `{ module, assets: Buffer[] }`.
- `module.assets` array provides `[name, path, ext]` tuples mapped by index to asset buffers.
- Apply `planAssetFile` to each buffer.

### 5. Code Changes

#### New files

| File | Responsibility |
|------|----------------|
| `src/app/extract-assets.ts` | Core extraction logic: format routing, asset collection, manifest generation |

#### Modified files

| File | Change |
|------|--------|
| `src/cli/main.ts` | Register `extract-assets` command |
| `src/cli/support.ts` | Add `printExtractAssetsResult` presenter |
| `src/app/commands.ts` | Add `runExtractAssetsCommand` + result type |
| `package.json` | Add `build:exe` script |

### 6. Bun Exe Build

**Who needs Bun**: Only the developer (build-time). End users receive `risupack.exe` and run it standalone — no Node.js, no Bun.

**Build command** (added to `package.json`):

```json
{
  "scripts": {
    "build:exe": "bun build src/cli/main.ts --compile --outfile dist/risupack.exe --target bun-windows-x64"
  }
}
```

**Compatibility**:

- `adm-zip`, `msgpackr`, `commander`, `zod` — all Bun-compatible.
- `node:fs`, `node:path`, `node:crypto` — Bun built-in support.
- `.js` import extensions — Bun resolves `.ts` automatically; no source changes needed.

**Exe name**: `risupack.exe`

**Target**: Windows x64 only (matches current project environment). Other targets can be added later via `--target` flag variants.

### 7. Security Level

Low — local personal tool, single-user, no network, no auth. Check: input path validation (already handled by `sanitizeArchiveEntryPath`), output path traversal prevention.

## Testing

- Round-trip: extract assets from a charx → verify manifest → verify files match original bytes.
- PNG card with both `ccv3` and `chara` chunks → verify `ccv3` is used for metadata.
- risum with assets → verify array-index mapping is correct.
- Asset with misleading `ext` → verify magic bytes override.
- charx with embedded `module.risum` → verify module.risum is skipped (no asset extraction from it).
- Bun-compiled exe → verify all commands still work.
