import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import AdmZip from "adm-zip";

import {
  assertEqual,
  assertEqualJson,
  createStoredZip,
  createSyntheticBotArchive,
  readJson,
  ROOT,
  runCli,
  WORK_ROOT
} from "../support/common.mjs";

export async function runSourcePrioritySuite() {
  await assertBotCardBuildIgnoresRawSnapshot();
  await assertZipAssetBuildUsesCurrentWorkspaceFiles();
  await assertPngAssetBuildUsesCurrentWorkspaceFiles();
  await assertModuleAssetBuildUsesCurrentWorkspaceFiles();
  await assertPresetSourceScanOverridesPackMeta();
  await assertModuleSourceScanOverridesPackMeta();
  await assertModuleFolderEntriesPreserveEmptyContent();
  await assertPresetBuildMissingFileRejected();
  assertBotBuildMissingFileRejected();
  await assertMcpAccessPolicyHelpers();
}

async function assertBotCardBuildIgnoresRawSnapshot() {
  const caseRoot = join(WORK_ROOT, "bot-card-source-priority");
  const inputPath = join(caseRoot, "sample.charx");
  const extracted = join(caseRoot, "extracted");
  const rebuilt = join(caseRoot, "rebuilt.charx");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });

  const card = {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: "Original",
      description: "desc",
      first_mes: "hello",
      alternate_greetings: ["alt"],
      post_history_instructions: "note",
      creator_notes: "keep-from-meta",
      extensions: {
        risuai: {
          backgroundHTML: ".bg {}",
          defaultVariables: "lang=en"
        }
      }
    }
  };
  writeFileSync(
    inputPath,
    createStoredZip([
      {
        name: "card.json",
        data: Buffer.from(JSON.stringify(card, null, 2), "utf-8")
      }
    ])
  );

  runCli(["extract", inputPath, extracted]);
  assertEqual(
    existsSync(join(extracted, "pack", "card", "card.raw.json")),
    false,
    "bot card source priority: raw snapshot removed"
  );

  writeFileSync(
    join(extracted, "pack", "card", "card.raw.json"),
    JSON.stringify(
      {
        ...card,
        data: {
          ...card.data,
          creator_notes: "should-not-win"
        }
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );
  writeFileSync(join(extracted, "src", "card", "name.txt"), "Edited", "utf-8");

  runCli(["build", extracted, rebuilt]);

  const rebuiltZip = new AdmZip(rebuilt);
  const rebuiltCard = JSON.parse(
    rebuiltZip.getEntry("card.json").getData().toString("utf-8")
  );
  assertEqual(
    rebuiltCard.data.name,
    "Edited",
    "bot card source priority: editable name wins"
  );
  assertEqual(
    rebuiltCard.data.creator_notes,
    "keep-from-meta",
    "bot card source priority: preserved card comes from meta"
  );
}

async function assertZipAssetBuildUsesCurrentWorkspaceFiles() {
  const caseRoot = join(WORK_ROOT, "zip-asset-source-priority");
  const inputPath = join(caseRoot, "sample.charx");
  const extracted = join(caseRoot, "extracted");
  const rebuilt = join(caseRoot, "rebuilt.charx");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });

  const originalAsset = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
  const renamedAsset = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x02]);
  const card = {
    data: {
      name: "Zip Asset",
      assets: [
        {
          name: "cover",
          uri: "embeded://assets/original.png",
          ext: "png",
          type: "icon"
        }
      ]
    }
  };
  writeFileSync(
    inputPath,
    createStoredZip([
      {
        name: "card.json",
        data: Buffer.from(JSON.stringify(card, null, 2), "utf-8")
      },
      { name: "assets/original.png", data: originalAsset }
    ])
  );

  runCli(["extract", inputPath, extracted]);
  const botMeta = readJson(join(extracted, "pack", "bot.meta.json"));
  const oldAssetPath = join(extracted, botMeta.botAssets[0].path);
  const renamedAssetPath = join(extracted, "assets", "renamed-cover.png");
  writeFileSync(renamedAssetPath, renamedAsset);
  rmSync(oldAssetPath, { force: true });

  runCli(["build", extracted, rebuilt]);

  const rebuiltZip = new AdmZip(rebuilt);
  const rebuiltEntry = rebuiltZip.getEntry("assets/original.png");
  assertEqual(
    Boolean(rebuiltEntry),
    true,
    "zip asset source priority: original archive path preserved"
  );
  assertEqual(
    rebuiltZip.getEntry("assets/renamed-cover.png") == null,
    true,
    "zip asset source priority: workspace filename is not used as archive path"
  );
  assertEqual(
    rebuiltEntry.getData().equals(renamedAsset),
    true,
    "zip asset source priority: rebuilt zip uses current workspace file bytes"
  );
}

async function assertPngAssetBuildUsesCurrentWorkspaceFiles() {
  const caseRoot = join(WORK_ROOT, "png-asset-source-priority");
  const inputPath = join(caseRoot, "sample.png");
  const extracted = join(caseRoot, "extracted");
  const rebuilt = join(caseRoot, "rebuilt.png");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });

  const {
    decodeBase64TextChunk,
    encodeBase64TextChunk,
    listTextChunks,
    rewritePngTextChunks
  } = await import(
    pathToFileURL(resolve(ROOT, "dist", "formats", "bot", "png-chunks.js")).href
  );
  const originalAsset = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x03]);
  const renamedAsset = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x04]);
  const card = {
    data: {
      name: "PNG Asset",
      assets: [
        {
          name: "cover",
          uri: "__asset:0",
          ext: "png",
          type: "icon"
        }
      ]
    }
  };
  const basePng = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=",
    "base64"
  );
  const pngWithChunks = rewritePngTextChunks(
    basePng,
    [
      {
        key: "ccv3",
        value: encodeBase64TextChunk(Buffer.from(JSON.stringify(card), "utf-8"))
      },
      {
        key: "chara-ext-asset_0",
        value: encodeBase64TextChunk(originalAsset)
      }
    ],
    new Set(["ccv3", "chara", "chara-ext-asset_0"])
  );
  writeFileSync(inputPath, pngWithChunks);

  runCli(["extract", inputPath, extracted]);
  const botMeta = readJson(join(extracted, "pack", "bot.meta.json"));
  const oldAssetPath = join(extracted, botMeta.pngAssets[0].path);
  const renamedAssetPath = join(extracted, "assets", "renamed-cover.png");
  writeFileSync(renamedAssetPath, renamedAsset);
  rmSync(oldAssetPath, { force: true });

  runCli(["build", extracted, rebuilt]);

  const rebuiltChunks = listTextChunks(readFileSync(rebuilt));
  const rebuiltAssetChunk = rebuiltChunks.find(
    (chunk) => chunk.key === "chara-ext-asset_0"
  );
  assertEqual(
    Boolean(rebuiltAssetChunk),
    true,
    "png asset source priority: original chunk key preserved"
  );
  assertEqual(
    decodeBase64TextChunk(rebuiltAssetChunk.value).equals(renamedAsset),
    true,
    "png asset source priority: rebuilt png uses current workspace file bytes"
  );
}

async function assertModuleAssetBuildUsesCurrentWorkspaceFiles() {
  const caseRoot = join(WORK_ROOT, "module-asset-source-priority");
  const inputPath = join(caseRoot, "sample.risum");
  const extracted = join(caseRoot, "extracted");
  const rebuilt = join(caseRoot, "rebuilt.risum");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });

  const { loadRisumCodec } = await import(
    pathToFileURL(
      resolve(ROOT, "dist", "formats", "risum", "container-risum.js")
    ).href
  );
  const { packModule, unpackModule } = await loadRisumCodec();
  const originalAsset = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x05]);
  const renamedAsset = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x06]);
  const module = {
    name: "Asset Source Priority",
    trigger: [],
    lorebook: [],
    regex: [],
    assets: [["demo.png", "assets/demo.png", "png"]]
  };
  writeFileSync(inputPath, await packModule(module, [originalAsset]));

  runCli(["extract", inputPath, extracted]);
  writeFileSync(join(extracted, "assets", "renamed-demo.png"), renamedAsset);
  rmSync(join(extracted, "assets", "demo.png"), { force: true });

  runCli(["build", extracted, rebuilt]);

  const unpacked = await unpackModule(readFileSync(rebuilt));
  assertEqual(
    unpacked.assets[0].equals(renamedAsset),
    true,
    "module asset source priority: rebuilt module uses current workspace file bytes"
  );
  assertEqual(
    unpacked.module.assets[0][0],
    "demo.png",
    "module asset source priority: module metadata preserves original asset identifier"
  );
}

async function assertPresetSourceScanOverridesPackMeta() {
  const projectDir = join(WORK_ROOT, "preset-source-scan");
  rmSync(projectDir, { recursive: true, force: true });

  const preset = {
    name: "Source Scan",
    promptTemplate: [
      {
        type: "plain",
        type2: "main",
        role: "system",
        text: "old prompt"
      }
    ],
    regex: [{ comment: "old", type: "editoutput", in: "a", out: "b" }]
  };

  const { buildPresetSources, extractPresetSources } = await import(
    pathToFileURL(resolve(ROOT, "dist", "formats", "risup", "source-risup.js"))
      .href
  );
  extractPresetSources(projectDir, preset);

  rmSync(
    join(projectDir, "src", "prompt-template", "001-plain-main-system.json"),
    { force: true }
  );
  rmSync(
    join(projectDir, "src", "prompt-template", "001-plain-main-system.md"),
    { force: true }
  );
  writeFileSync(
    join(projectDir, "src", "prompt-template", "010-plain-main-user.json"),
    JSON.stringify({ type: "plain", type2: "main", role: "user" }, null, 2) +
      "\n",
    "utf-8"
  );
  writeFileSync(
    join(projectDir, "src", "prompt-template", "020-custom-text.md"),
    "new prompt",
    "utf-8"
  );

  rmSync(join(projectDir, "src", "regex", "old.json"), { force: true });
  const regexEntry = {
    comment: "fresh",
    type: "editoutput",
    in: "x",
    out: "y"
  };
  writeFileSync(
    join(projectDir, "src", "regex", "fresh.json"),
    JSON.stringify(regexEntry, null, 2) + "\n",
    "utf-8"
  );
  writeFileSync(
    join(projectDir, "src", "prompt-template.meta.json"),
    JSON.stringify(
      {
        version: 1,
        items: [
          {
            jsonFile: "src/prompt-template/010-plain-main-user.json",
            textFile: "src/prompt-template/020-custom-text.md"
          }
        ]
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );
  writeFileSync(
    join(projectDir, "src", "regex.meta.json"),
    JSON.stringify(
      { version: 1, items: [{ sourceFile: "src/regex/fresh.json" }] },
      null,
      2
    ) + "\n",
    "utf-8"
  );
  writeFileSync(
    join(projectDir, "pack", "prompt-template.meta.json"),
    JSON.stringify({ version: 1, items: [] }, null, 2) + "\n",
    "utf-8"
  );
  writeFileSync(
    join(projectDir, "pack", "regex.meta.json"),
    JSON.stringify({ version: 1, items: [] }, null, 2) + "\n",
    "utf-8"
  );

  buildPresetSources(projectDir);

  const builtPreset = readJson(join(projectDir, "pack", "dist", "preset.json"));
  assertEqualJson(
    builtPreset.promptTemplate,
    [{ type: "plain", type2: "main", role: "user", text: "new prompt" }],
    "preset source scan: prompt-template is rebuilt from source meta + src"
  );
  assertEqualJson(
    builtPreset.regex,
    [regexEntry],
    "preset source scan: regex is rebuilt from source meta + src"
  );
}

async function assertModuleSourceScanOverridesPackMeta() {
  const projectDir = join(WORK_ROOT, "module-source-scan");
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, "pack"), { recursive: true });

  const moduleJson = {
    name: "Source Scan Module",
    trigger: [],
    lorebook: [{ key: "old-entry", comment: "old-entry", content: "old lore" }],
    regex: [{ comment: "old-regex", type: "editoutput", in: "a", out: "b" }]
  };
  writeFileSync(
    join(projectDir, "pack", "module.json"),
    JSON.stringify(moduleJson, null, 2) + "\n",
    "utf-8"
  );

  const { buildModuleSources, extractModuleSources } = await import(
    pathToFileURL(resolve(ROOT, "dist", "formats", "risum", "source-module.js"))
      .href
  );
  extractModuleSources(projectDir);

  rmSync(join(projectDir, "src", "lorebook", "_root", "old-entry.md"), {
    force: true
  });
  writeFileSync(
    join(projectDir, "src", "lorebook", "_root", "fresh-entry.md"),
    "fresh lore",
    "utf-8"
  );

  rmSync(join(projectDir, "src", "regex", "old-regex.json"), { force: true });
  const regexEntry = {
    comment: "fresh-regex",
    type: "editoutput",
    in: "x",
    out: "y"
  };
  writeFileSync(
    join(projectDir, "src", "regex", "fresh-regex.json"),
    JSON.stringify(regexEntry, null, 2) + "\n",
    "utf-8"
  );

  writeFileSync(
    join(projectDir, "src", "lorebook.meta.json"),
    JSON.stringify(
      {
        version: 1,
        items: [
          {
            kind: "entry",
            data: { key: "fresh-entry,alias", comment: "fresh-entry" },
            sourceFile: "src/lorebook/_root/fresh-entry.md"
          }
        ]
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );
  writeFileSync(
    join(projectDir, "src", "regex.meta.json"),
    JSON.stringify(
      { version: 1, items: [{ sourceFile: "src/regex/fresh-regex.json" }] },
      null,
      2
    ) + "\n",
    "utf-8"
  );
  writeFileSync(
    join(projectDir, "pack", "lorebook.meta.json"),
    JSON.stringify({ version: 1, items: [] }, null, 2) + "\n",
    "utf-8"
  );
  writeFileSync(
    join(projectDir, "pack", "regex.meta.json"),
    JSON.stringify({ version: 1, items: [] }, null, 2) + "\n",
    "utf-8"
  );

  buildModuleSources(projectDir);

  const builtModule = readJson(join(projectDir, "pack", "dist", "module.json"));
  assertEqualJson(
    builtModule.lorebook,
    [
      {
        key: "fresh-entry,alias",
        comment: "fresh-entry",
        content: "fresh lore"
      }
    ],
    "module source meta + src: lorebook is rebuilt from src"
  );
  assertEqualJson(
    builtModule.regex,
    [regexEntry],
    "module source meta + src: regex is rebuilt from src"
  );
}

async function assertModuleFolderEntriesPreserveEmptyContent() {
  const projectDir = join(WORK_ROOT, "module-folder-content");
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, "pack"), { recursive: true });

  const moduleJson = {
    name: "Folder Content Module",
    trigger: [],
    lorebook: [
      { mode: "folder", key: "division-1", comment: "1계", content: "" },
      {
        key: "kogami",
        comment: "코가미 신야",
        content: "detective",
        folder: "division-1"
      }
    ],
    regex: []
  };
  writeFileSync(
    join(projectDir, "pack", "module.json"),
    JSON.stringify(moduleJson, null, 2) + "\n",
    "utf-8"
  );

  const { buildModuleSources, extractModuleSources } = await import(
    pathToFileURL(resolve(ROOT, "dist", "formats", "risum", "source-module.js"))
      .href
  );
  extractModuleSources(projectDir);
  buildModuleSources(projectDir);

  const builtModule = readJson(join(projectDir, "pack", "dist", "module.json"));
  assertEqualJson(
    builtModule.lorebook[0],
    {
      mode: "folder",
      key: "division-1",
      comment: "1계",
      content: ""
    },
    "module folder content: folder entry keeps empty content string"
  );
}

async function assertPresetBuildMissingFileRejected() {
  const caseRoot = join(WORK_ROOT, "preset-missing-source");
  const inputPath = join(caseRoot, "sample.risupreset");
  const extracted = join(caseRoot, "extracted");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });

  const { encodeRisupContainer } = await import(
    pathToFileURL(
      resolve(ROOT, "dist", "formats", "risup", "container-risup.js")
    ).href
  );
  writeFileSync(
    inputPath,
    await encodeRisupContainer(
      { name: "Missing Source", mainPrompt: "prompt" },
      "risupreset"
    )
  );

  runCli(["extract", inputPath, extracted]);
  rmSync(join(extracted, "src", "name.txt"), { force: true });

  const result = spawnSync(
    process.execPath,
    [
      resolve(ROOT, "dist", "cli", "main.js"),
      "build",
      extracted,
      join(caseRoot, "rebuilt.risupreset")
    ],
    { cwd: ROOT, encoding: "utf-8" }
  );
  if (result.status === 0) {
    throw new Error("프리셋 build가 누락된 source 파일을 거부하지 않았습니다.");
  }
}

function assertBotBuildMissingFileRejected() {
  const caseRoot = join(WORK_ROOT, "bot-missing-source");
  const inputPath = join(caseRoot, "sample.charx");
  const extracted = join(caseRoot, "extracted");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(inputPath, createSyntheticBotArchive());

  runCli(["extract", inputPath, extracted]);
  rmSync(join(extracted, "src", "card", "name.txt"), { force: true });

  const result = spawnSync(
    process.execPath,
    [
      resolve(ROOT, "dist", "cli", "main.js"),
      "build",
      extracted,
      join(caseRoot, "rebuilt.charx")
    ],
    { cwd: ROOT, encoding: "utf-8" }
  );
  if (result.status === 0) {
    throw new Error("봇 build가 누락된 source 파일을 거부하지 않았습니다.");
  }
}

async function assertMcpAccessPolicyHelpers() {
  const allowedRoot = join(WORK_ROOT, "mcp-allowed");
  const allowedTarget = join(allowedRoot, "project", "demo.charx");
  const deniedTarget = join(WORK_ROOT, "mcp-denied", "demo.charx");

  const {
    assertMcpAccessPolicyConfigured,
    assertMcpPathAllowed,
    parseMcpAccessPolicy,
    redactMcpMessage,
    redactMcpPath
  } = await import(
    pathToFileURL(resolve(ROOT, "dist", "mcp", "access.js")).href
  );

  const emptyPolicy = parseMcpAccessPolicy([], {});
  let missingRootsRejected = false;
  try {
    assertMcpAccessPolicyConfigured(emptyPolicy);
  } catch {
    missingRootsRejected = true;
  }
  assertEqual(
    emptyPolicy.allowedRoots.length,
    0,
    "mcp policy: empty root count"
  );
  assertEqual(
    missingRootsRejected,
    true,
    "mcp policy: missing allowed roots are rejected"
  );

  const policy = parseMcpAccessPolicy(["--allow-root", allowedRoot], {});
  assertEqual(policy.allowedRoots.length, 1, "mcp policy: allowed root count");
  assertMcpAccessPolicyConfigured(policy);
  assertMcpPathAllowed(policy, allowedTarget, "input");

  let denied = false;
  try {
    assertMcpPathAllowed(policy, deniedTarget, "input");
  } catch {
    denied = true;
  }
  assertEqual(denied, true, "mcp policy: outside root is rejected");
  assertEqual(
    redactMcpPath(policy, allowedTarget),
    "<allowed-root>/project/demo.charx",
    "mcp policy: path is redacted"
  );
  assertEqual(
    redactMcpMessage(policy, `오류: ${allowedTarget}`),
    "오류: <allowed-root>/project/demo.charx",
    "mcp policy: message is redacted"
  );
}
