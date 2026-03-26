import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import {
  assertBufferEqual,
  assertEqual,
  assertEqualJson,
  assertExists,
  CASES,
  readDirSafe,
  readJson,
  runCli,
  SAMPLE_MANIFEST_PATH,
  WORK_ROOT
} from "../support/common.mjs";

export function runManifestRoundtripSuite(options = {}) {
  const requireManifest = options.requireManifest === true;
  if (CASES.length === 0) {
    if (requireManifest) {
      throw new Error(
        `sample roundtrip manifest가 필요합니다: ${SAMPLE_MANIFEST_PATH}`
      );
    }
    console.log(
      `[INFO] sample roundtrip cases skipped: manifest not found (${SAMPLE_MANIFEST_PATH})`
    );
    return;
  }

  const results = CASES.map((testCase) => runCase(testCase));
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
    ["src", "template-default-variables.txt"],
    ["src", "prompt-template.meta.json"],
    ["src", "regex.meta.json"]
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
  const baseMeta = readJson(join(extracted, "pack", "module.assets.json"));
  const nextMeta = readJson(join(roundtrip, "pack", "module.assets.json"));

  assertExists(
    join(extracted, "pack", "module.meta.json"),
    `${label}: pack/module.meta.json`
  );
  assertExists(
    join(extracted, "src", "lorebook.meta.json"),
    `${label}: src/lorebook.meta.json`
  );
  assertExists(
    join(extracted, "src", "regex.meta.json"),
    `${label}: src/regex.meta.json`
  );
  assertExists(
    join(extracted, "src", "trigger.meta.json"),
    `${label}: src/trigger.meta.json`
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
  assertFileTextRoundtrip(
    join(extracted, "src", "lorebook.meta.json"),
    join(roundtrip, "src", "lorebook.meta.json"),
    `${label}: src/lorebook.meta.json`
  );
  assertFileTextRoundtrip(
    join(extracted, "src", "regex.meta.json"),
    join(roundtrip, "src", "regex.meta.json"),
    `${label}: src/regex.meta.json`
  );
  assertFileTextRoundtrip(
    join(extracted, "src", "trigger.meta.json"),
    join(roundtrip, "src", "trigger.meta.json"),
    `${label}: src/trigger.meta.json`
  );
  assertDirectoryTextRoundtripRecursive(
    join(extracted, "src", "lorebook"),
    join(roundtrip, "src", "lorebook"),
    `${label}: src/lorebook`
  );
  assertDirectoryTextRoundtripRecursive(
    join(extracted, "src", "regex"),
    join(roundtrip, "src", "regex"),
    `${label}: src/regex`
  );
  assertOptionalFileTextRoundtrip(
    join(extracted, "src", "styles", "embedding.css"),
    join(roundtrip, "src", "styles", "embedding.css"),
    `${label}: src/styles/embedding.css`
  );
  assertEqualJson(
    normalizeModuleAssetRecords(baseMeta.assets),
    normalizeModuleAssetRecords(nextMeta.assets),
    `${label}: module assets metadata`
  );
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

function assertFileTextRoundtrip(leftPath, rightPath, label) {
  const left = readFileSync(leftPath, "utf-8");
  const right = readFileSync(rightPath, "utf-8");
  assertEqual(left, right, label);
}

function assertOptionalFileTextRoundtrip(leftPath, rightPath, label) {
  const leftExists = existsSync(leftPath);
  const rightExists = existsSync(rightPath);
  assertEqual(leftExists, rightExists, `${label}: exists`);
  if (!leftExists) {
    return;
  }

  assertFileTextRoundtrip(leftPath, rightPath, label);
}

function assertDirectoryTextRoundtripRecursive(leftDir, rightDir, label) {
  const leftEntries = listFilesRecursive(leftDir).sort();
  const rightEntries = listFilesRecursive(rightDir).sort();
  assertEqualJson(leftEntries, rightEntries, `${label}: file list`);

  for (const entryName of leftEntries) {
    assertFileTextRoundtrip(
      join(leftDir, entryName),
      join(rightDir, entryName),
      `${label}/${entryName}`
    );
  }
}

function listFilesRecursive(rootDir, baseDir = rootDir) {
  if (!existsSync(rootDir)) {
    return [];
  }

  const results = [];
  for (const entryName of readdirSync(rootDir)) {
    const absolutePath = join(rootDir, entryName);
    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      results.push(...listFilesRecursive(absolutePath, baseDir));
      continue;
    }

    results.push(relative(baseDir, absolutePath).replace(/\\/g, "/"));
  }

  return results;
}

function normalizeModuleAssetRecords(records) {
  return [...records]
    .map((record) => ({
      path: record.path,
      originalName: record.originalName,
      declaredExt: record.declaredExt ?? null,
      detectedExt: record.detectedExt ?? null,
      mediaKind: record.mediaKind ?? null
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}
