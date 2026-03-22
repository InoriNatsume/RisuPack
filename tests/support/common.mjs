import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const ROOT = resolve(".");
export const CLI = resolve(ROOT, "dist", "cli", "main.js");
export const WORK_ROOT = resolve(ROOT, "test-artifacts", "automated-roundtrip");
export const SAMPLE_MANIFEST_PATH = resolve(
  ROOT,
  "workspace",
  "samples",
  "roundtrip-manifest.json"
);

const SAMPLE_MANIFEST = loadSampleManifest();
export const CASES = SAMPLE_MANIFEST?.cases ?? [];

export function ensureBuilt() {
  if (!existsSync(CLI)) {
    throw new Error(`빌드 산출물이 없습니다: ${CLI}`);
  }
}

export function resetWorkRoot() {
  rmSync(WORK_ROOT, { recursive: true, force: true });
  mkdirSync(WORK_ROOT, { recursive: true });
}

export function runCli(args, cwd = ROOT) {
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

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: ${actual} !== ${expected}`);
  }
}

export function assertEqualJson(actual, expected, label) {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${label} mismatch`);
  }
}

export function assertBufferEqual(leftPath, rightPath, label) {
  if (!leftPath || !rightPath) {
    throw new Error(`${label} 비교 경로가 비어 있습니다.`);
  }
  const left = readFileSync(resolveMaybe(leftPath));
  const right = readFileSync(resolveMaybe(rightPath));
  if (!left.equals(right)) {
    throw new Error(`${label} mismatch`);
  }
}

export function assertExists(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} not found: ${path}`);
  }
}

export function readDirSafe(path) {
  return existsSync(path) ? readdirSync(path) : [];
}

export function createSyntheticBotArchive() {
  return createStoredZip([
    {
      name: "card.json",
      data: Buffer.from(
        JSON.stringify(
          {
            data: {
              name: "Synthetic Bot",
              description: "desc",
              first_mes: "hello",
              alternate_greetings: ["alt"],
              post_history_instructions: "note",
              extensions: {
                risuai: {
                  backgroundHTML: "<style>\nbody{}\n</style>",
                  defaultVariables: "{}"
                }
              }
            }
          },
          null,
          2
        ),
        "utf-8"
      )
    },
    {
      name: "assets/demo.png",
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01])
    }
  ]);
}

export async function writeSyntheticRisum(path) {
  const { loadRisumCodec } = await import(
    pathToFileURL(
      resolve(ROOT, "dist", "formats", "risum", "container-risum.js")
    ).href
  );
  const { packModule } = await loadRisumCodec();
  const module = {
    name: "Synthetic Module",
    trigger: [],
    lorebook: [],
    regex: [],
    assets: [["demo.png", "assets/demo.png", "png"]]
  };
  writeFileSync(path, await packModule(module, [Buffer.from([1, 2, 3, 4])]));
}

export function createStoredZip(entries) {
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

function resolveMaybe(path) {
  return existsSync(path) ? path : resolve(dirname(CLI), "..", "..", path);
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

function loadSampleManifest() {
  if (!existsSync(SAMPLE_MANIFEST_PATH)) {
    return null;
  }

  const manifest = JSON.parse(readFileSync(SAMPLE_MANIFEST_PATH, "utf-8"));
  return {
    cases: Array.isArray(manifest.cases)
      ? manifest.cases.map((item, index) => normalizeCase(item, index))
      : []
  };
}

function normalizeCase(item, index) {
  if (!item || typeof item !== "object") {
    throw new Error(`invalid manifest case at index ${index}`);
  }

  const name =
    typeof item.name === "string" && item.name
      ? item.name
      : `case-${index + 1}`;
  const input =
    typeof item.input === "string" ? resolve(ROOT, item.input) : null;
  const outputName =
    typeof item.outputName === "string" && item.outputName
      ? item.outputName
      : "result.bin";
  const kind = typeof item.kind === "string" ? item.kind : null;

  if (!input || !kind) {
    throw new Error(`invalid manifest case at index ${index}`);
  }

  return { name, input, outputName, kind };
}
