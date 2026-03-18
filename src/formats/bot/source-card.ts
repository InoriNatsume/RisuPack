import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import type { BotEditableData, CardPackMeta } from "../../types/bot.js";
import type { CardLike } from "./shared.js";
import {
  applyEditableData,
  readJson,
  stripEditableData,
  toEditableData,
  writeJson
} from "./shared.js";
import {
  CARD_META_PATH,
  CARD_PACK_DIR,
  CARD_RAW_PATH,
  CARD_SRC_DIR
} from "./paths.js";

const CARD_SOURCES = {
  name: "name.txt",
  description: "description.md",
  firstMessage: "first-message.md",
  additionalFirstMessagesDir: "alternate-greetings",
  globalNote: "global-note.md",
  defaultVariables: "default-variables.txt",
  css: "styles/background.css"
} as const;

export function extractCardSources(projectDir: string, card: CardLike): void {
  const cardSrcDir = join(projectDir, CARD_SRC_DIR);
  const cardPackDir = join(projectDir, CARD_PACK_DIR);
  mkdirSync(join(cardSrcDir, "styles"), { recursive: true });
  mkdirSync(cardPackDir, { recursive: true });

  const editable = toEditableData(card);
  writeJson(join(projectDir, CARD_META_PATH), {
    version: 2,
    editableFields: CARD_SOURCES,
    preservedCard: stripEditableData(card)
  } satisfies CardPackMeta);

  writeText(join(cardSrcDir, CARD_SOURCES.name), editable.name);
  writeText(join(cardSrcDir, CARD_SOURCES.description), editable.description);
  writeText(join(cardSrcDir, CARD_SOURCES.firstMessage), editable.firstMessage);
  writeAdditionalFirstMessages(
    join(cardSrcDir, CARD_SOURCES.additionalFirstMessagesDir),
    editable.additionalFirstMessages
  );
  writeText(join(cardSrcDir, CARD_SOURCES.globalNote), editable.globalNote);
  writeText(
    join(cardSrcDir, CARD_SOURCES.defaultVariables),
    editable.defaultVariables
  );
  writeText(join(cardSrcDir, CARD_SOURCES.css), editable.css);
}

export function buildCardFromSources<T extends CardLike>(
  projectDir: string
): T {
  const rawCard = readCardBase<T>(projectDir);
  const editable = readCardEditableSources(projectDir);
  return applyEditableData(rawCard, editable);
}

export function readCardEditableSources(projectDir: string): BotEditableData {
  const cardDir = join(projectDir, CARD_SRC_DIR);
  return {
    name: readRequiredText(join(cardDir, CARD_SOURCES.name), "name"),
    description: readRequiredText(
      join(cardDir, CARD_SOURCES.description),
      "description"
    ),
    firstMessage: readRequiredText(
      join(cardDir, CARD_SOURCES.firstMessage),
      "firstMessage"
    ),
    additionalFirstMessages: readAdditionalFirstMessages(
      join(cardDir, CARD_SOURCES.additionalFirstMessagesDir)
    ),
    globalNote: readRequiredText(
      join(cardDir, CARD_SOURCES.globalNote),
      "globalNote"
    ),
    defaultVariables: readRequiredText(
      join(cardDir, CARD_SOURCES.defaultVariables),
      "defaultVariables"
    ),
    css: readRequiredText(join(cardDir, CARD_SOURCES.css), "css")
  };
}

function readAdditionalFirstMessages(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort()
    .map((entryName) => readText(join(dir, entryName)));
}

function writeAdditionalFirstMessages(dir: string, messages: string[]): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  messages.forEach((message, index) => {
    const filename = `${String(index + 1).padStart(3, "0")}.md`;
    writeText(join(dir, filename), message);
  });
}

function readText(path: string): string {
  if (!existsSync(path)) {
    return "";
  }
  return readFileSync(path, "utf-8");
}

function readRequiredText(path: string, label: string): string {
  if (!existsSync(path)) {
    throw new Error(
      `봇 build에 필요한 source 파일이 없습니다 (${label}): ${path}`
    );
  }
  return readFileSync(path, "utf-8");
}

function writeText(path: string, content: string): void {
  const normalized = content.replace(/\r\n/g, "\n");
  writeFileSync(path, normalized, "utf-8");
}

function readCardBase<T extends CardLike>(projectDir: string): T {
  const metaPath = join(projectDir, CARD_META_PATH);
  if (existsSync(metaPath)) {
    const meta = readJson<Partial<CardPackMeta>>(metaPath);
    if (meta.preservedCard && typeof meta.preservedCard === "object") {
      return structuredClone(meta.preservedCard as T);
    }
  }

  return readJson<T>(join(projectDir, CARD_RAW_PATH));
}
