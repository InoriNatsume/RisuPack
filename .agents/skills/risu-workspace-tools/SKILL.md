---
name: risu-workspace-tools
description: Work with the RisuCMP TypeScript CLI that extracts, edits, inspects, and rebuilds RisuAI bot, module, and preset formats. Use when modifying or validating this repository's workflows for .risum, .risup, .risupreset, .charx, .png, .jpg, or .jpeg files, especially for workspace layout, container/source split, embedded module handling, trigger mode handling, preset prompt-template handling, asset naming/repack behavior, and Windows-first CLI usage.
---

# Risu Workspace Tools

Use this skill when working inside the RisuCMP repository.

## Follow these rules

- Assume Windows PowerShell first.
- Prefer repository commands and paths exactly as this project uses them.
- Keep user-facing behavior aligned with existing tools rather than inventing new editing concepts.

## Repository workflow

- Use `node dist\cli\main.js extract ...` or the linked `risu-workspace-tools` bin for manual runs.
- Use `npm run build` after TypeScript changes.
- Use `npm test` for roundtrip validation.
- Use `npm run format` before finishing changes.

## Format model

- Bots, modules, and presets all use a `container` stage and a `source` stage.
- Bot containers support `.charx`, `.png`, `.jpg`, `.jpeg`.
- Module containers support `.risum`.
- Preset containers support `.risup`, `.risupreset`.
- Embedded `module.risum` inside bots is extracted into `src/module/`.

## Current source layout

- Bot card editable files live under `src/card/`.
- Module editable files live under `src/module/src/` for embedded modules or `src/` for standalone modules.
- Preset editable files live under `src/`, with `src/prompt-template/` and `src/regex/` for split items.
- Pack/rebuild metadata lives under `pack/`.
- Runtime user workspaces live under `workspace/runs/`.
- Test and validation artifacts live under `test-artifacts/`.

## Trigger policy

- Treat triggers by RisuAI UI mode, not by arbitrary effect splitting.
- Lua mode: use `src/trigger.lua`.
- V2 mode: use `src/trigger.json`.
- V1 mode: do not expose editable source; emit `src/trigger.unsupported.txt` and preserve original trigger data on build.

## Lorebook and regex policy

- Keep lorebook entries as `.md` by default.
- Do not auto-convert lorebook content into `.lua` or `.css` based on content heuristics.
- Split regex into `src/regex/*.json`.
- Keep `backgroundEmbedding` in `src/styles/embedding.css`.

## Asset policy

- Use readable filenames in the workspace.
- Repack using original identifiers such as `sourcePath`, `chunkKey`, or `sourceIndex`.
- Prefer byte-signature extension detection over metadata extension strings.

## Read these files when needed

- Read [README.md](/Users/kazuk/Downloads/RisuCMP/README.md) for current CLI usage and workspace conventions.
- Read [docs/project-structure.md](/Users/kazuk/Downloads/RisuCMP/docs/project-structure.md) for the current architecture and folder layout.
- Read [docs/design-direction.md](/Users/kazuk/Downloads/RisuCMP/docs/design-direction.md) for project scope and boundaries.
