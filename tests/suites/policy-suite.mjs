import {
  closeSync,
  existsSync,
  openSync,
  mkdirSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync
} from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import AdmZip from "adm-zip";

import {
  assertEqual,
  assertEqualJson,
  assertExists,
  createStoredZip,
  createSyntheticBotArchive,
  createSyntheticJpegZipBotArchive,
  readJson,
  ROOT,
  runCli,
  WORK_ROOT,
  writeSyntheticRisum
} from "../support/common.mjs";

export async function runPolicySuite() {
  assertInspectWorksOutsideRoot();
  assertCharxJpegContainerAccepted();
  assertCharxPngContainerRejected();
  assertJpegExtensionMismatchRejected();
  assertInvalidRisumHeaderRejected();
  await assertInvalidRisupresetHeaderRejected();
  assertLargeInputRequiresExplicitApproval();
  assertWorkspaceModeRejectsMultipleInputs();
  assertWorkspaceExtractFlow();
  assertWorkspaceExtractPreservesCustomSkill();
  assertZipSlipRejected();
  assertBotBuildPathTraversalRejected();
  assertBotPreservedModulePathTraversalRejected();
  assertBotPreservedPrefixPathTraversalRejected();
  await assertRisumBuildPathTraversalRejected();
  await assertLorebookTraversalSafe();
  await assertLorebookExtractionUsesMarkdown();
  await assertTriggerModePolicies();
  await assertAssetSignatureWinsDeclaredExt();
  await assertLegacyRisuassetUriSupport();
  assertZipPreservedEntriesRoundtrip();
  await assertSyntheticRisupresetRoundtrip();
  await assertSyntheticRisupresetDuplicateRegexRoundtrip();
  await assertSyntheticRisumCodecRoundtrip();
}

function assertInspectWorksOutsideRoot() {
  const caseRoot = join(WORK_ROOT, "inspect-outside-root");
  const inputPath = join(caseRoot, "sample.charx");
  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(inputPath, createSyntheticBotArchive());

  const otherCwd = join(ROOT, "workspace", "scratch", "outside-cwd");
  mkdirSync(otherCwd, { recursive: true });
  runCli(["inspect", inputPath], otherCwd);
}

function assertCharxJpegContainerAccepted() {
  const caseRoot = join(WORK_ROOT, "charx-jpeg-container");
  const inputPath = join(caseRoot, "sample.charx");
  const outputDir = join(caseRoot, "extracted");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(inputPath, createSyntheticJpegZipBotArchive());

  runCli(["extract", inputPath, outputDir]);
  assertExists(
    join(outputDir, "project.meta.json"),
    "charx jpeg container: extract succeeds"
  );
}

function assertJpegExtensionMismatchRejected() {
  const caseRoot = join(WORK_ROOT, "jpeg-extension-mismatch");
  const inputPath = join(caseRoot, "sample.jpg");
  const outputDir = join(caseRoot, "extracted");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(inputPath, createSyntheticBotArchive());

  const result = spawnSync(
    process.execPath,
    [resolve(ROOT, "dist", "cli", "main.js"), "extract", inputPath, outputDir],
    { cwd: ROOT, encoding: "utf-8" }
  );
  if (result.status === 0) {
    throw new Error("JPEG 확장자 mismatch 입력이 거부되지 않았습니다.");
  }
}

function assertCharxPngContainerRejected() {
  const caseRoot = join(WORK_ROOT, "charx-png-container-rejected");
  const inputPath = join(caseRoot, "sample.charx");
  const outputDir = join(caseRoot, "extracted");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(
    inputPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0ioAAAAASUVORK5CYII=",
      "base64"
    )
  );

  const result = spawnSync(
    process.execPath,
    [resolve(ROOT, "dist", "cli", "main.js"), "extract", inputPath, outputDir],
    { cwd: ROOT, encoding: "utf-8" }
  );
  if (result.status === 0) {
    throw new Error("charx 확장자의 PNG 청크 입력이 거부되지 않았습니다.");
  }
}

function assertInvalidRisumHeaderRejected() {
  const caseRoot = join(WORK_ROOT, "invalid-risum-header");
  const inputPath = join(caseRoot, "sample.risum");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(inputPath, Buffer.from("not-risum", "utf-8"));

  const result = spawnSync(
    process.execPath,
    [resolve(ROOT, "dist", "cli", "main.js"), "inspect", inputPath],
    { cwd: ROOT, encoding: "utf-8" }
  );
  if (result.status === 0) {
    throw new Error("잘못된 risum 헤더가 거부되지 않았습니다.");
  }
}

async function assertInvalidRisupresetHeaderRejected() {
  const caseRoot = join(WORK_ROOT, "invalid-risupreset-header");
  const inputPath = join(caseRoot, "sample.risupreset");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(inputPath, Buffer.from("not-risupreset", "utf-8"));

  const result = spawnSync(
    process.execPath,
    [resolve(ROOT, "dist", "cli", "main.js"), "inspect", inputPath],
    { cwd: ROOT, encoding: "utf-8" }
  );
  if (result.status === 0) {
    throw new Error("잘못된 risupreset 헤더가 거부되지 않았습니다.");
  }
}

function assertLargeInputRequiresExplicitApproval() {
  const caseRoot = join(WORK_ROOT, "large-input-confirmation");
  const inputPath = join(caseRoot, "huge.risum");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  const fd = openSync(inputPath, "w");
  closeSync(fd);
  truncateSync(inputPath, 500 * 1024 * 1024 + 1);

  const result = spawnSync(
    process.execPath,
    [resolve(ROOT, "dist", "cli", "main.js"), "inspect", inputPath],
    { cwd: ROOT, encoding: "utf-8" }
  );
  if (result.status === 0) {
    throw new Error("대용량 입력 확인 없이 inspect가 실행되었습니다.");
  }
  if (!result.stderr.includes("--yes-large-input")) {
    throw new Error("대용량 입력 확인 안내가 출력되지 않았습니다.");
  }
}

function assertWorkspaceModeRejectsMultipleInputs() {
  const caseRoot = join(WORK_ROOT, "workspace-mode-multiple-inputs");
  const projectDir = join(caseRoot, "workspace");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(join(projectDir, "imports"), { recursive: true });
  writeFileSync(
    join(projectDir, "imports", "a.charx"),
    createSyntheticBotArchive()
  );
  writeFileSync(
    join(projectDir, "imports", "b.charx"),
    createSyntheticBotArchive()
  );

  const result = spawnSync(
    process.execPath,
    [
      resolve(ROOT, "dist", "cli", "main.js"),
      "workspace",
      "extract",
      projectDir
    ],
    { cwd: ROOT, encoding: "utf-8" }
  );

  if (result.status === 0) {
    throw new Error(
      "여러 staged 입력이 있는 workspace extract가 거부되지 않았습니다."
    );
  }
}

function assertWorkspaceExtractFlow() {
  const caseRoot = join(WORK_ROOT, "workspace-extract-flow");
  const inputPath = join(caseRoot, "sample.charx");
  const projectDir = join(caseRoot, "workspace");
  const customAgentsPath = join(projectDir, "AGENTS.md");
  const generatedSkillPath = join(
    projectDir,
    ".agents",
    "skills",
    "risu-bot-workspace",
    "SKILL.md"
  );

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  mkdirSync(projectDir, { recursive: true });
  writeFileSync(inputPath, createSyntheticBotArchive());

  writeFileSync(customAgentsPath, "# custom agents\n", "utf-8");
  runCli(["workspace", "stage-input", inputPath, projectDir]);
  runCli(["workspace", "extract", projectDir]);
  runCli(["workspace", "build", projectDir]);

  assertExists(
    join(projectDir, "project.meta.json"),
    "workspace extract: project meta exists"
  );
  assertExists(
    join(projectDir, "imports", "sample.charx"),
    "workspace extract: staged input remains in imports"
  );
  assertExists(
    join(projectDir, "dist", "sample.charx"),
    "workspace build: output is written to dist"
  );
  assertEqual(
    readFileSync(customAgentsPath, "utf-8"),
    "# custom agents\n",
    "workspace extract: custom AGENTS.md is preserved"
  );
  assertExists(
    generatedSkillPath,
    "workspace extract: skill template is generated"
  );
  assertEqual(
    readFileSync(generatedSkillPath, "utf-8").includes("src/card/"),
    true,
    "workspace extract: skill template keeps bot-specific editable areas"
  );
  assertEqual(
    readFileSync(generatedSkillPath, "utf-8")
      .toLowerCase()
      .includes("embedded `module.risum`"),
    true,
    "workspace extract: skill template keeps bot-specific embedded module note"
  );
  assertEqual(
    readFileSync(customAgentsPath, "utf-8").includes(
      ".agents\\skills\\risu-bot-workspace\\SKILL.md"
    ) ||
      readFileSync(customAgentsPath, "utf-8").includes(
        ".agents/skills/risu-bot-workspace/SKILL.md"
      ),
    false,
    "workspace extract: custom AGENTS.md remains untouched"
  );
}

function assertWorkspaceExtractPreservesCustomSkill() {
  const caseRoot = join(WORK_ROOT, "workspace-custom-skill");
  const inputPath = join(caseRoot, "sample.charx");
  const projectDir = join(caseRoot, "workspace");
  const customSkillPath = join(
    projectDir,
    ".agents",
    "skills",
    "risu-bot-workspace",
    "SKILL.md"
  );

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(inputPath, createSyntheticBotArchive());

  mkdirSync(join(projectDir, ".agents", "skills", "risu-bot-workspace"), {
    recursive: true
  });
  writeFileSync(customSkillPath, "# custom bot skill\n", "utf-8");
  runCli(["workspace", "stage-input", inputPath, projectDir]);
  runCli(["workspace", "extract", projectDir]);

  assertEqual(
    readFileSync(customSkillPath, "utf-8"),
    "# custom bot skill\n",
    "workspace extract: custom bot skill is preserved"
  );
}

function assertZipSlipRejected() {
  const caseRoot = join(WORK_ROOT, "security-zip-slip");
  const inputPath = join(caseRoot, "malicious.charx");
  const outputDir = join(caseRoot, "extracted");
  const escapedPath = join(caseRoot, "escaped.txt");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });

  writeFileSync(
    inputPath,
    createStoredZip([
      {
        name: "card.json",
        data: Buffer.from(
          JSON.stringify({ data: { name: "malicious" } }, null, 2),
          "utf-8"
        )
      },
      {
        name: "assets/../../escaped.txt",
        data: Buffer.from("owned", "utf-8")
      }
    ])
  );

  const result = spawnSync(
    process.execPath,
    [resolve(ROOT, "dist", "cli", "main.js"), "extract", inputPath, outputDir],
    { cwd: ROOT, encoding: "utf-8" }
  );
  if (result.status === 0) {
    throw new Error("zip slip 입력이 거부되지 않았습니다.");
  }
  if (existsSync(escapedPath)) {
    throw new Error("zip slip으로 작업 폴더 밖 파일이 생성되었습니다.");
  }
}

function assertBotBuildPathTraversalRejected() {
  const caseRoot = join(WORK_ROOT, "security-bot-build-path");
  const inputPath = join(caseRoot, "sample.charx");
  const projectDir = join(caseRoot, "project");
  const outsidePath = join(caseRoot, "secret.txt");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(outsidePath, "secret", "utf-8");
  writeFileSync(inputPath, createSyntheticBotArchive());

  runCli(["extract", inputPath, projectDir]);

  const botMetaPath = join(projectDir, "pack", "bot.meta.json");
  const botMeta = readJson(botMetaPath);
  if (Array.isArray(botMeta.botAssets) && botMeta.botAssets.length > 0) {
    botMeta.botAssets[0].sourcePath = "../secret.txt";
  }
  writeFileSync(botMetaPath, JSON.stringify(botMeta, null, 2) + "\n", "utf-8");

  const result = spawnSync(
    process.execPath,
    [
      resolve(ROOT, "dist", "cli", "main.js"),
      "build",
      projectDir,
      join(caseRoot, "result.charx")
    ],
    { cwd: ROOT, encoding: "utf-8" }
  );
  if (result.status === 0) {
    throw new Error("봇 build 경로 탈출 입력이 거부되지 않았습니다.");
  }
}

function assertBotPreservedModulePathTraversalRejected() {
  const caseRoot = join(WORK_ROOT, "security-bot-preserved-module-path");
  const inputPath = join(caseRoot, "sample.charx");
  const projectDir = join(caseRoot, "project");
  const outsidePath = join(caseRoot, "secret.txt");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(outsidePath, "secret", "utf-8");
  writeFileSync(inputPath, createSyntheticBotArchive());

  runCli(["extract", inputPath, projectDir]);

  const botMetaPath = join(projectDir, "pack", "bot.meta.json");
  const botMeta = readJson(botMetaPath);
  botMeta.preservedModuleFile = "../secret.txt";
  writeFileSync(botMetaPath, JSON.stringify(botMeta, null, 2) + "\n", "utf-8");

  const result = spawnSync(
    process.execPath,
    [
      resolve(ROOT, "dist", "cli", "main.js"),
      "build",
      projectDir,
      join(caseRoot, "result.charx")
    ],
    { cwd: ROOT, encoding: "utf-8" }
  );
  if (result.status === 0) {
    throw new Error("보존 module 파일 경로 탈출 입력이 거부되지 않았습니다.");
  }
}

function assertBotPreservedPrefixPathTraversalRejected() {
  const caseRoot = join(WORK_ROOT, "security-bot-preserved-prefix-path");
  const inputPath = join(caseRoot, "sample.jpg");
  const projectDir = join(caseRoot, "project");
  const outsidePath = join(caseRoot, "secret-prefix.bin");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(outsidePath, "secret-prefix", "utf-8");
  writeFileSync(
    inputPath,
    Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      createSyntheticBotArchive()
    ])
  );

  runCli(["extract", inputPath, projectDir]);

  const botMetaPath = join(projectDir, "pack", "bot.meta.json");
  const botMeta = readJson(botMetaPath);
  botMeta.preservedContainerPrefixFile = "../secret-prefix.bin";
  writeFileSync(botMetaPath, JSON.stringify(botMeta, null, 2) + "\n", "utf-8");

  const result = spawnSync(
    process.execPath,
    [
      resolve(ROOT, "dist", "cli", "main.js"),
      "build",
      projectDir,
      join(caseRoot, "result.jpg")
    ],
    { cwd: ROOT, encoding: "utf-8" }
  );
  if (result.status === 0) {
    throw new Error("보존 JPEG prefix 경로 탈출 입력이 거부되지 않았습니다.");
  }
}

async function assertRisumBuildPathTraversalRejected() {
  const caseRoot = join(WORK_ROOT, "security-risum-build-path");
  const inputPath = join(caseRoot, "sample.risum");
  const projectDir = join(caseRoot, "project");
  const outsidePath = join(caseRoot, "secret.bin");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(outsidePath, "secret", "utf-8");
  await writeSyntheticRisum(inputPath);

  runCli(["extract", inputPath, projectDir]);

  const assetMetaPath = join(projectDir, "pack", "module.assets.json");
  const assetMeta = readJson(assetMetaPath);
  assetMeta.assetRoot = "../secret-bin";
  writeFileSync(
    assetMetaPath,
    JSON.stringify(assetMeta, null, 2) + "\n",
    "utf-8"
  );

  const result = spawnSync(
    process.execPath,
    [
      resolve(ROOT, "dist", "cli", "main.js"),
      "build",
      projectDir,
      join(caseRoot, "result.risum")
    ],
    { cwd: ROOT, encoding: "utf-8" }
  );
  if (result.status === 0) {
    throw new Error("모듈 build 경로 탈출 입력이 거부되지 않았습니다.");
  }
}

async function assertLorebookTraversalSafe() {
  const projectDir = join(WORK_ROOT, "security-lorebook");
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, "pack"), { recursive: true });

  const moduleJson = {
    name: "security",
    trigger: [{ effect: [{ type: "triggerlua", code: "return 'trigger'" }] }],
    lorebook: [
      { mode: "folder", key: "folder-1", comment: ".." },
      {
        key: "entry-1",
        comment: "entry",
        content: "hello",
        folder: "folder-1"
      }
    ],
    regex: []
  };
  writeFileSync(
    join(projectDir, "pack", "module.json"),
    JSON.stringify(moduleJson, null, 2) + "\n",
    "utf-8"
  );

  const { extractModuleSources } = await import(
    pathToFileURL(resolve(ROOT, "dist", "formats", "risum", "source-module.js"))
      .href
  );
  extractModuleSources(projectDir);

  assertExists(
    join(projectDir, "src", "lorebook.meta.json"),
    "lorebook traversal: source lorebook meta exists"
  );
  assertEqual(
    readFileSync(join(projectDir, "src", "trigger.lua"), "utf-8"),
    "return 'trigger'",
    "lorebook traversal: trigger preserved"
  );
  assertExists(
    join(projectDir, "src", "lorebook", "_", "entry.md"),
    "lorebook traversal: sanitized lorebook file"
  );
}

async function assertLorebookExtractionUsesMarkdown() {
  const projectDir = join(WORK_ROOT, "lorebook-markdown-policy");
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, "pack"), { recursive: true });

  const moduleJson = {
    name: "markdown-policy",
    trigger: [],
    lorebook: [
      {
        key: "entry-lua-like",
        comment: "lua-like",
        content: "return 'this should stay text'"
      },
      {
        key: "entry-css-like",
        comment: "css-like.CSS",
        content: "<style>\n.chattext { color: red; }\n</style>"
      }
    ],
    regex: []
  };
  writeFileSync(
    join(projectDir, "pack", "module.json"),
    JSON.stringify(moduleJson, null, 2) + "\n",
    "utf-8"
  );

  const { extractModuleSources, buildModuleSources } = await import(
    pathToFileURL(resolve(ROOT, "dist", "formats", "risum", "source-module.js"))
      .href
  );
  extractModuleSources(projectDir);

  assertExists(
    join(projectDir, "src", "lorebook", "_root", "lua-like.md"),
    "lorebook policy: lua-like entry uses markdown"
  );
  assertExists(
    join(projectDir, "src", "lorebook", "_root", "css-like.CSS.md"),
    "lorebook policy: css-like entry uses markdown"
  );

  buildModuleSources(projectDir);
  const builtModule = readJson(join(projectDir, "pack", "dist", "module.json"));
  assertEqual(
    builtModule.lorebook[0].content,
    "return 'this should stay text'",
    "lorebook policy: lua-like content preserved"
  );
  assertEqual(
    builtModule.lorebook[1].content,
    "<style>\n.chattext { color: red; }\n</style>",
    "lorebook policy: css-like content preserved"
  );
}

async function assertTriggerModePolicies() {
  const projectDir = join(WORK_ROOT, "trigger-mode-policy");
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, "pack"), { recursive: true });

  const { extractModuleSources, buildModuleSources } = await import(
    pathToFileURL(resolve(ROOT, "dist", "formats", "risum", "source-module.js"))
      .href
  );

  const v2ModuleJson = {
    name: "trigger-v2",
    trigger: [
      {
        comment: "",
        type: "manual",
        conditions: [],
        effect: [{ type: "v2Header", code: "", indent: 0 }]
      },
      {
        comment: "relationship0",
        type: "manual",
        conditions: [],
        effect: [
          {
            type: "v2SetVar",
            operator: "=",
            var: "relationship",
            value: "0",
            valueType: "value",
            indent: 0
          }
        ]
      }
    ],
    lorebook: [],
    regex: []
  };
  writeFileSync(
    join(projectDir, "pack", "module.json"),
    JSON.stringify(v2ModuleJson, null, 2) + "\n",
    "utf-8"
  );

  extractModuleSources(projectDir);
  assertExists(
    join(projectDir, "src", "trigger.json"),
    "trigger policy: v2 source json"
  );
  buildModuleSources(projectDir);
  let builtModule = readJson(join(projectDir, "pack", "dist", "module.json"));
  assertEqualJson(
    builtModule.trigger,
    v2ModuleJson.trigger,
    "trigger policy: v2 trigger preserved"
  );

  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, "pack"), { recursive: true });

  const v1ModuleJson = {
    name: "trigger-v1",
    trigger: [
      {
        comment: "legacy",
        type: "manual",
        conditions: [],
        effect: [{ type: "setvar", operator: "=", var: "legacy", value: "1" }]
      }
    ],
    lorebook: [],
    regex: []
  };
  writeFileSync(
    join(projectDir, "pack", "module.json"),
    JSON.stringify(v1ModuleJson, null, 2) + "\n",
    "utf-8"
  );

  extractModuleSources(projectDir);
  assertExists(
    join(projectDir, "src", "trigger.unsupported.txt"),
    "trigger policy: v1 unsupported notice"
  );
  buildModuleSources(projectDir);
  builtModule = readJson(join(projectDir, "pack", "dist", "module.json"));
  assertEqualJson(
    builtModule.trigger,
    v1ModuleJson.trigger,
    "trigger policy: v1 trigger preserved"
  );
}

async function assertAssetSignatureWinsDeclaredExt() {
  const { detectAssetExtension } = await import(
    pathToFileURL(resolve(ROOT, "dist", "core", "assets.js")).href
  );
  const fakePng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00
  ]);
  assertEqual(
    detectAssetExtension(fakePng, "jpg"),
    "png",
    "asset extension detection prefers signature"
  );
}

async function assertLegacyRisuassetUriSupport() {
  const { readCardAssetDisplayMap } = await import(
    pathToFileURL(resolve(ROOT, "dist", "formats", "bot", "shared.js")).href
  );
  const card = {
    data: {
      assets: [
        {
          name: "legacy asset",
          uri: "~risuasset:abc123:png",
          ext: "png",
          type: "icon"
        }
      ]
    }
  };
  const displayMap = readCardAssetDisplayMap(card);
  assertEqual(
    displayMap.get("assets/abc123.png")?.name,
    "legacy asset",
    "legacy risuasset hash:ext maps to display metadata"
  );
}

function assertZipPreservedEntriesRoundtrip() {
  const caseRoot = join(WORK_ROOT, "zip-preserved-extra");
  const inputPath = join(caseRoot, "extra.charx");
  const extracted = join(caseRoot, "extracted");
  const rebuilt = join(caseRoot, "rebuilt.charx");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });

  writeFileSync(
    inputPath,
    createStoredZip([
      {
        name: "card.json",
        data: Buffer.from(
          JSON.stringify({ data: { name: "extra-test" } }, null, 2),
          "utf-8"
        )
      },
      { name: "x_meta/demo.json", data: Buffer.from('{"meta":true}', "utf-8") },
      { name: "docs/readme.txt", data: Buffer.from("keep me", "utf-8") }
    ])
  );

  runCli(["extract", inputPath, extracted]);
  runCli(["build", extracted, rebuilt]);

  const rebuiltZip = new AdmZip(readFileSync(rebuilt));
  const extraEntry = rebuiltZip.getEntry("docs/readme.txt");
  assertEqual(Boolean(extraEntry), true, "zip preserved entry survives build");
  assertEqual(
    extraEntry?.getData().toString("utf-8"),
    "keep me",
    "zip preserved entry content"
  );
}

async function assertSyntheticRisupresetRoundtrip() {
  const caseRoot = join(WORK_ROOT, "risupreset-synthetic");
  const inputPath = join(caseRoot, "sample.risupreset");
  const extracted = join(caseRoot, "extracted");
  const rebuilt = join(caseRoot, "rebuilt.risupreset");
  const roundtrip = join(caseRoot, "roundtrip");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });

  const { encodeRisupContainer } = await import(
    pathToFileURL(
      resolve(ROOT, "dist", "formats", "risup", "container-risup.js")
    ).href
  );
  const preset = {
    name: "Synthetic",
    mainPrompt: "main",
    jailbreak: "jb",
    globalNote: "gn",
    customPromptTemplateToggle: "cot=COT",
    templateDefaultVariables: "lang=1",
    promptTemplate: [
      {
        type: "plain",
        type2: "main",
        role: "system",
        text: "hello"
      }
    ],
    regex: [
      {
        comment: "sample",
        type: "editoutput",
        in: "a",
        out: "b",
        flag: "g"
      }
    ]
  };
  writeFileSync(inputPath, await encodeRisupContainer(preset, "risupreset"));

  runCli(["extract", inputPath, extracted]);
  runCli(["build", extracted, rebuilt]);
  runCli(["extract", rebuilt, roundtrip]);

  const builtPreset = readJson(join(extracted, "pack", "dist", "preset.json"));
  const nextPreset = readJson(join(roundtrip, "pack", "preset.raw.json"));
  assertEqualJson(
    builtPreset,
    nextPreset,
    "synthetic risupreset built preset roundtrip"
  );
}

async function assertSyntheticRisupresetDuplicateRegexRoundtrip() {
  const caseRoot = join(WORK_ROOT, "risupreset-duplicate-regex");
  const inputPath = join(caseRoot, "sample.risupreset");
  const extracted = join(caseRoot, "extracted");
  const rebuilt = join(caseRoot, "rebuilt.risupreset");
  const roundtrip = join(caseRoot, "roundtrip");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });

  const { encodeRisupContainer } = await import(
    pathToFileURL(
      resolve(ROOT, "dist", "formats", "risup", "container-risup.js")
    ).href
  );
  const preset = {
    name: "Duplicate Regex",
    regex: [
      { comment: "same", type: "editoutput", in: "a", out: "1" },
      { comment: "same", type: "editoutput", in: "b", out: "2" }
    ]
  };
  writeFileSync(inputPath, await encodeRisupContainer(preset, "risupreset"));

  runCli(["extract", inputPath, extracted]);
  runCli(["build", extracted, rebuilt]);
  runCli(["extract", rebuilt, roundtrip]);

  const builtPreset = readJson(join(extracted, "pack", "dist", "preset.json"));
  const nextPreset = readJson(join(roundtrip, "pack", "preset.raw.json"));
  assertEqualJson(
    builtPreset.regex,
    preset.regex,
    "duplicate regex comments: built preset preserves entries"
  );
  assertEqualJson(
    nextPreset.regex,
    preset.regex,
    "duplicate regex comments: roundtrip preserves entries"
  );

  const regexMeta = readJson(join(extracted, "pack", "regex.meta.json"));
  assertEqual(
    regexMeta.items[0].sourceFile !== regexMeta.items[1].sourceFile,
    true,
    "duplicate regex comments: unique source files"
  );
}

async function assertSyntheticRisumCodecRoundtrip() {
  const { loadRisumCodec } = await import(
    pathToFileURL(
      resolve(ROOT, "dist", "formats", "risum", "container-risum.js")
    ).href
  );
  const { packModule, unpackModule } = await loadRisumCodec();

  const module = {
    name: "Synthetic Module",
    trigger: [],
    lorebook: [],
    regex: [],
    assets: [["demo.png", "assets/demo.png", "png"]]
  };
  const assetBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);

  const packed = await packModule(module, [assetBuffer]);
  const unpacked = await unpackModule(packed);

  assertEqualJson(
    unpacked.module,
    {
      ...module,
      assets: [["demo.png", "", "png"]]
    },
    "synthetic risum codec: module roundtrip"
  );
  assertEqual(unpacked.assets.length, 1, "synthetic risum codec: asset count");
  assertEqual(
    unpacked.assets[0].equals(assetBuffer),
    true,
    "synthetic risum codec: asset payload"
  );
}
