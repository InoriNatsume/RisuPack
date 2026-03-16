import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import AdmZip from "adm-zip";

const ROOT = resolve(".");
const CLI = resolve(ROOT, "dist", "cli", "main.js");
const SAMPLE_ROOT = resolve(ROOT, "workspace", "samples", "test_file");
const WORK_ROOT = resolve(ROOT, "test-artifacts", "automated-roundtrip");

const CASES = [
  {
    name: "risum-belpira",
    input: resolve(SAMPLE_ROOT, "벨피라.risum"),
    outputName: "result.risum",
    kind: "risum"
  },
  {
    name: "risum-lightboard",
    input: resolve(SAMPLE_ROOT, "🔦라이트보드 🌠 삽화 3.4.1.risum"),
    outputName: "result.risum",
    kind: "risum"
  },
  {
    name: "risup-psyche",
    input: resolve(SAMPLE_ROOT, "🦋 PSYCHE v1.8.risup"),
    outputName: "result.risup",
    kind: "risup"
  },
  {
    name: "charx-serena",
    input: resolve(SAMPLE_ROOT, "Serena.charx"),
    outputName: "result.charx",
    kind: "zip-charx"
  },
  {
    name: "jpeg-59da",
    input: resolve(
      SAMPLE_ROOT,
      "59da5384fe4cbf10f3bcb2b082cd1ecab61b2b27d5966ef4dda742e85ce4c9b8.jpg"
    ),
    outputName: "result.jpg",
    kind: "jpeg-zip"
  },
  {
    name: "jpeg-gaia",
    input: resolve(SAMPLE_ROOT, "가이아.jpeg"),
    outputName: "result.jpeg",
    kind: "jpeg-zip"
  },
  {
    name: "png-ellen",
    input: resolve(SAMPLE_ROOT, "Ellen Baker.png"),
    outputName: "result.png",
    kind: "png-chunks"
  },
  {
    name: "png-twins",
    input: resolve(SAMPLE_ROOT, "Twins' Love.png"),
    outputName: "result.png",
    kind: "png-chunks"
  }
];

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

async function main() {
  ensureBuilt();
  rmSync(WORK_ROOT, { recursive: true, force: true });
  mkdirSync(WORK_ROOT, { recursive: true });

  assertRisumInspectWorksOutsideRoot();
  assertZipSlipRejected();
  assertBotBuildPathTraversalRejected();
  await assertRisumBuildPathTraversalRejected();
  await assertLorebookTraversalSafe();
  await assertLorebookExtractionUsesMarkdown();
  await assertTriggerModePolicies();
  await assertAssetSignatureWinsDeclaredExt();
  await assertLegacyRisuassetUriSupport();
  assertZipPreservedEntriesRoundtrip();
  await assertSyntheticRisupresetRoundtrip();
  await assertSyntheticRisupresetDuplicateRegexRoundtrip();
  await assertPresetBuildMissingFileRejected();
  assertBotBuildMissingFileRejected();

  const results = [];
  for (const testCase of CASES) {
    results.push(runCase(testCase));
  }

  for (const result of results) {
    console.log(
      `[PASS] ${result.name}: editable, assets, preserved data roundtrip ok`
    );
  }
}

function runCase(testCase) {
  const caseRoot = join(WORK_ROOT, testCase.name);
  const extracted = join(caseRoot, "extracted");
  const rebuilt = join(caseRoot, testCase.outputName);
  const roundtrip = join(caseRoot, "roundtrip");

  mkdirSync(caseRoot, { recursive: true });

  runCli(["extract", testCase.input, extracted]);
  runCli(["build", extracted, rebuilt]);
  runCli(["extract", rebuilt, roundtrip]);

  if (testCase.kind === "risum") {
    return assertModuleRoundtrip(testCase, extracted, roundtrip);
  }
  if (testCase.kind === "risup") {
    return assertPresetRoundtrip(testCase, extracted, roundtrip);
  }

  assertCardRoundtrip(testCase, extracted, roundtrip);

  const baseMeta = readJson(join(extracted, "pack", "bot.meta.json"));
  const nextMeta = readJson(join(roundtrip, "pack", "bot.meta.json"));

  assertEqual(
    baseMeta.container,
    nextMeta.container,
    `${testCase.name}: container`
  );
  assertEqual(
    baseMeta.assets.length,
    nextMeta.assets.length,
    `${testCase.name}: asset count`
  );
  assertEqual(
    baseMeta.xMetaFiles.length,
    nextMeta.xMetaFiles.length,
    `${testCase.name}: x_meta count`
  );

  if (testCase.kind === "jpeg-zip") {
    assertBufferEqual(
      join(extracted, baseMeta.preservedContainerPrefixFile),
      join(roundtrip, nextMeta.preservedContainerPrefixFile),
      `${testCase.name}: preserved jpeg prefix`
    );
  }

  if (
    baseMeta.preservedModuleFile &&
    nextMeta.preservedModuleFile &&
    !baseMeta.embeddedModuleProjectDir &&
    !nextMeta.embeddedModuleProjectDir
  ) {
    assertBufferEqual(
      join(extracted, baseMeta.preservedModuleFile),
      join(roundtrip, nextMeta.preservedModuleFile),
      `${testCase.name}: preserved module.risum`
    );
  }

  if (testCase.kind === "png-chunks") {
    assertEqualJson(
      baseMeta.pngCardChunkKeys,
      nextMeta.pngCardChunkKeys,
      `${testCase.name}: png card chunk keys`
    );
    assertEqual(
      baseMeta.pngAssets.length,
      nextMeta.pngAssets.length,
      `${testCase.name}: png asset mapping count`
    );
  }

  if (baseMeta.botAssets && nextMeta.botAssets) {
    assertEqual(
      baseMeta.botAssets.length,
      nextMeta.botAssets.length,
      `${testCase.name}: bot asset records`
    );
  }

  if (
    baseMeta.embeddedModuleProjectDir &&
    nextMeta.embeddedModuleProjectDir &&
    existsSync(
      join(extracted, baseMeta.embeddedModuleProjectDir, "project.meta.json")
    ) &&
    existsSync(
      join(roundtrip, nextMeta.embeddedModuleProjectDir, "project.meta.json")
    )
  ) {
    assertModuleProjectRoundtrip(
      `${testCase.name}: embedded module`,
      join(extracted, baseMeta.embeddedModuleProjectDir),
      join(roundtrip, nextMeta.embeddedModuleProjectDir)
    );
  }

  return { name: testCase.name };
}

function assertModuleRoundtrip(testCase, extracted, roundtrip) {
  assertModuleProjectRoundtrip(testCase.name, extracted, roundtrip);

  return { name: testCase.name };
}

function assertPresetRoundtrip(testCase, extracted, roundtrip) {
  const builtPreset = readJson(join(extracted, "pack", "dist", "preset.json"));
  const nextPreset = readJson(join(roundtrip, "pack", "preset.raw.json"));
  assertEqualJson(builtPreset, nextPreset, `${testCase.name}: built preset`);

  const files = [
    ["src", "name.txt"],
    ["src", "main-prompt.md"],
    ["src", "jailbreak.md"],
    ["src", "global-note.md"],
    ["src", "custom-prompt-template-toggle.txt"],
    ["src", "template-default-variables.txt"]
  ];
  for (const parts of files) {
    const left = readFileSync(join(extracted, ...parts), "utf-8");
    const right = readFileSync(join(roundtrip, ...parts), "utf-8");
    assertEqual(left, right, `${testCase.name}: ${parts.join("/")}`);
  }

  assertDirectoryJsonRoundtrip(
    join(extracted, "src", "prompt-template"),
    join(roundtrip, "src", "prompt-template"),
    `${testCase.name}: src/prompt-template`
  );
  assertDirectoryJsonRoundtrip(
    join(extracted, "src", "regex"),
    join(roundtrip, "src", "regex"),
    `${testCase.name}: src/regex`
  );

  return { name: testCase.name };
}

function assertCardRoundtrip(testCase, extracted, roundtrip) {
  const files = [
    ["pack", "card", "card.meta.json"],
    ["src", "card", "name.txt"],
    ["src", "card", "description.md"],
    ["src", "card", "first-message.md"],
    ["src", "card", "global-note.md"],
    ["src", "card", "default-variables.txt"],
    ["src", "card", "styles", "background.css"]
  ];

  for (const parts of files) {
    const left = readFileSync(join(extracted, ...parts), "utf-8");
    const right = readFileSync(join(roundtrip, ...parts), "utf-8");
    assertEqual(left, right, `${testCase.name}: ${parts.join("/")}`);
  }

  assertDirectoryTextRoundtrip(
    join(extracted, "src", "card", "alternate-greetings"),
    join(roundtrip, "src", "card", "alternate-greetings"),
    `${testCase.name}: src/card/alternate-greetings`
  );
}

function assertModuleProjectRoundtrip(label, extracted, roundtrip) {
  const builtModule = readJson(join(extracted, "pack", "dist", "module.json"));
  const nextModule = readJson(join(roundtrip, "pack", "module.json"));
  const baseMeta = readJson(join(extracted, "pack", "module.assets.json"));
  const nextMeta = readJson(join(roundtrip, "pack", "module.assets.json"));
  const lorebookMeta = readJson(join(extracted, "pack", "lorebook.meta.json"));

  assertExists(
    join(extracted, "pack", "module.meta.json"),
    `${label}: pack/module.meta.json`
  );
  assertExists(
    join(extracted, "pack", "lorebook.meta.json"),
    `${label}: pack/lorebook.meta.json`
  );
  assertExists(
    join(extracted, "pack", "regex.meta.json"),
    `${label}: pack/regex.meta.json`
  );
  assertExists(
    join(extracted, "pack", "trigger.meta.json"),
    `${label}: pack/trigger.meta.json`
  );
  assertEqualJson(builtModule, nextModule, `${label}: built module.json`);
  assertEqual(
    baseMeta.assets.length,
    nextMeta.assets.length,
    `${label}: module asset count`
  );
  if (baseMeta.assets.length > 0) {
    assertEqual(
      baseMeta.assets[0].detectedExt,
      nextMeta.assets[0].detectedExt,
      `${label}: first module asset detected ext`
    );
  }
  if (
    Array.isArray(lorebookMeta.items) &&
    lorebookMeta.items.some((item) => item.kind === "folder")
  ) {
    const lorebookEntries = readDirSafe(join(extracted, "src", "lorebook"));
    assertEqual(
      lorebookEntries.length > 1,
      true,
      `${label}: lorebook folder source extraction`
    );
  }
}

function assertDirectoryTextRoundtrip(leftDir, rightDir, label) {
  const leftEntries = readDirSafe(leftDir).sort();
  const rightEntries = readDirSafe(rightDir).sort();
  assertEqualJson(leftEntries, rightEntries, `${label}: file list`);

  for (const entryName of leftEntries) {
    const leftPath = join(leftDir, entryName);
    const rightPath = join(rightDir, entryName);
    const left = readFileSync(leftPath, "utf-8");
    const right = readFileSync(rightPath, "utf-8");
    assertEqual(left, right, `${label}/${entryName}`);
  }
}

function assertDirectoryJsonRoundtrip(leftDir, rightDir, label) {
  const leftEntries = readDirSafe(leftDir).sort();
  const rightEntries = readDirSafe(rightDir).sort();
  assertEqualJson(leftEntries, rightEntries, `${label}: file list`);

  for (const entryName of leftEntries) {
    const leftPath = join(leftDir, entryName);
    const rightPath = join(rightDir, entryName);
    const left = readFileSync(leftPath, "utf-8");
    const right = readFileSync(rightPath, "utf-8");
    assertEqual(left, right, `${label}/${entryName}`);
  }
}

function ensureBuilt() {
  if (!existsSync(CLI)) {
    throw new Error(`빌드 산출물이 없습니다: ${CLI}`);
  }
}

function assertRisumInspectWorksOutsideRoot() {
  const otherCwd = join(ROOT, "workspace", "scratch", "outside-cwd");
  mkdirSync(otherCwd, { recursive: true });
  runCli(["inspect", resolve(SAMPLE_ROOT, "벨피라.risum")], otherCwd);
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
    [CLI, "extract", inputPath, outputDir],
    {
      cwd: ROOT,
      encoding: "utf-8"
    }
  );
  if (result.status === 0) {
    throw new Error("zip slip 입력이 거부되지 않았습니다.");
  }
  if (existsSync(escapedPath)) {
    throw new Error("zip slip으로 작업 폴더 밖 파일이 생성되었습니다.");
  }
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
      {
        name: "x_meta/demo.json",
        data: Buffer.from('{"meta":true}', "utf-8")
      },
      {
        name: "docs/readme.txt",
        data: Buffer.from("keep me", "utf-8")
      }
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

function assertBotBuildPathTraversalRejected() {
  const caseRoot = join(WORK_ROOT, "security-bot-build-path");
  const projectDir = join(caseRoot, "project");
  const outsidePath = join(caseRoot, "secret.txt");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(outsidePath, "secret", "utf-8");

  runCli(["extract", resolve(SAMPLE_ROOT, "Serena.charx"), projectDir]);

  const botMetaPath = join(projectDir, "pack", "bot.meta.json");
  const botMeta = readJson(botMetaPath);
  botMeta.assets = ["../secret.txt"];
  if (Array.isArray(botMeta.botAssets) && botMeta.botAssets.length > 0) {
    botMeta.botAssets[0].path = "../secret.txt";
  }
  writeFileSync(botMetaPath, JSON.stringify(botMeta, null, 2) + "\n", "utf-8");

  const result = spawnSync(
    process.execPath,
    [CLI, "build", projectDir, join(caseRoot, "result.charx")],
    {
      cwd: ROOT,
      encoding: "utf-8"
    }
  );
  if (result.status === 0) {
    throw new Error("봇 build 경로 탈출 입력이 거부되지 않았습니다.");
  }
}

async function assertRisumBuildPathTraversalRejected() {
  const caseRoot = join(WORK_ROOT, "security-risum-build-path");
  const projectDir = join(caseRoot, "project");
  const outsidePath = join(caseRoot, "secret.bin");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });
  writeFileSync(outsidePath, "secret", "utf-8");

  runCli([
    "extract",
    resolve(SAMPLE_ROOT, "🔦라이트보드 🌠 삽화 3.4.1.risum"),
    projectDir
  ]);

  const assetMetaPath = join(projectDir, "pack", "module.assets.json");
  const assetMeta = readJson(assetMetaPath);
  assetMeta.assets[0].path = "../secret.bin";
  writeFileSync(
    assetMetaPath,
    JSON.stringify(assetMeta, null, 2) + "\n",
    "utf-8"
  );

  const result = spawnSync(
    process.execPath,
    [CLI, "build", projectDir, join(caseRoot, "result.risum")],
    {
      cwd: ROOT,
      encoding: "utf-8"
    }
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
    trigger: [
      {
        effect: [{ type: "triggerlua", code: "return 'trigger'" }]
      }
    ],
    lorebook: [
      {
        mode: "folder",
        key: "folder-1",
        comment: ".."
      },
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

  const triggerPath = join(projectDir, "src", "trigger.lua");
  const lorebookPath = join(projectDir, "src", "lorebook", "_", "entry.md");
  assertEqual(
    readFileSync(triggerPath, "utf-8"),
    "return 'trigger'",
    "lorebook traversal: trigger preserved"
  );
  assertExists(lorebookPath, "lorebook traversal: sanitized lorebook file");
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
        effect: [
          {
            type: "setvar",
            operator: "=",
            var: "legacy",
            value: "1"
          }
        ]
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
      {
        comment: "same",
        type: "editoutput",
        in: "a",
        out: "1"
      },
      {
        comment: "same",
        type: "editoutput",
        in: "b",
        out: "2"
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
      {
        name: "Missing Source",
        mainPrompt: "prompt"
      },
      "risupreset"
    )
  );

  runCli(["extract", inputPath, extracted]);
  rmSync(join(extracted, "src", "name.txt"), { force: true });

  const result = spawnSync(
    process.execPath,
    [CLI, "build", extracted, join(caseRoot, "rebuilt.risupreset")],
    {
      cwd: ROOT,
      encoding: "utf-8"
    }
  );
  if (result.status === 0) {
    throw new Error("프리셋 build가 누락된 source 파일을 거부하지 않았습니다.");
  }
}

function assertBotBuildMissingFileRejected() {
  const caseRoot = join(WORK_ROOT, "bot-missing-source");
  const extracted = join(caseRoot, "extracted");

  rmSync(caseRoot, { recursive: true, force: true });
  mkdirSync(caseRoot, { recursive: true });

  runCli(["extract", resolve(SAMPLE_ROOT, "Serena.charx"), extracted]);
  rmSync(join(extracted, "src", "card", "name.txt"), { force: true });

  const result = spawnSync(
    process.execPath,
    [CLI, "build", extracted, join(caseRoot, "rebuilt.charx")],
    {
      cwd: ROOT,
      encoding: "utf-8"
    }
  );
  if (result.status === 0) {
    throw new Error("봇 build가 누락된 source 파일을 거부하지 않았습니다.");
  }
}

function runCli(args, cwd = ROOT) {
  const result = spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf-8"
  });

  if (result.status !== 0) {
    throw new Error(
      `CLI 실행 실패: ${[CLI, ...args].join(" ")}\n${result.stdout}\n${result.stderr}`
    );
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: ${actual} !== ${expected}`);
  }
}

function assertEqualJson(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${label} mismatch`);
  }
}

function assertBufferEqual(leftPath, rightPath, label) {
  if (!leftPath || !rightPath) {
    throw new Error(`${label} 비교 경로가 비어 있습니다.`);
  }
  const left = readFileSync(resolveMaybe(leftPath));
  const right = readFileSync(resolveMaybe(rightPath));
  if (!left.equals(right)) {
    throw new Error(`${label} mismatch`);
  }
}

function assertExists(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} not found: ${path}`);
  }
}

function readDirSafe(path) {
  return existsSync(path) ? readdirSync(path) : [];
}

function resolveMaybe(path) {
  return existsSync(path) ? path : resolve(dirname(CLI), "..", "..", path);
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, "utf-8");
    const dataBuffer = Buffer.from(entry.data);
    const crc = crc32(dataBuffer);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(dataBuffer.length, 18);
    localHeader.writeUInt32LE(dataBuffer.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const localRecord = Buffer.concat([localHeader, nameBuffer, dataBuffer]);
    localParts.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(dataBuffer.length, 20);
    centralHeader.writeUInt32LE(dataBuffer.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([centralHeader, nameBuffer]));

    offset += localRecord.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
