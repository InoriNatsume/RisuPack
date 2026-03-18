import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { join } from "node:path";

import { hasProjectMeta } from "../../core/project-meta.js";
import type { BotMeta } from "../../types/bot.js";
import { buildRisumBytes, extractRisumBytes } from "../risum/index.js";
import type { CardLike } from "./shared.js";
import { readJson } from "./shared.js";
import { buildCardFromSources, extractCardSources } from "./source-card.js";
import {
  BOT_DIST_DIR,
  BOT_META_PATH,
  BUILT_CARD_PATH,
  BUILT_MODULE_PATH,
  MODULE_PROJECT_DIR
} from "./paths.js";

export async function extractBotSources(
  projectDir: string,
  card: CardLike
): Promise<void> {
  extractCardSources(projectDir, card);

  const botMeta = readJson<BotMeta>(join(projectDir, BOT_META_PATH));
  const moduleProjectDir = join(projectDir, MODULE_PROJECT_DIR);
  if (botMeta.preservedModuleFile) {
    const moduleBytes = readFileSync(
      join(projectDir, botMeta.preservedModuleFile)
    );
    await extractRisumBytes(moduleBytes, "module.risum", moduleProjectDir);
    return;
  }

  rmSync(moduleProjectDir, { recursive: true, force: true });
}

export async function buildBotSources(projectDir: string): Promise<void> {
  mkdirSync(join(projectDir, BOT_DIST_DIR), { recursive: true });

  const card = buildCardFromSources<CardLike>(projectDir);
  writeFileSync(
    join(projectDir, BUILT_CARD_PATH),
    JSON.stringify(card, null, 2) + "\n",
    "utf-8"
  );

  const botMeta = readJson<BotMeta>(join(projectDir, BOT_META_PATH));
  const moduleProjectDir = join(projectDir, MODULE_PROJECT_DIR);
  if (hasProjectMeta(moduleProjectDir)) {
    const moduleBytes = await buildRisumBytes(moduleProjectDir);
    writeFileSync(join(projectDir, BUILT_MODULE_PATH), moduleBytes);
    return;
  }

  if (botMeta.preservedModuleFile) {
    const moduleBytes = readFileSync(
      join(projectDir, botMeta.preservedModuleFile)
    );
    writeFileSync(join(projectDir, BUILT_MODULE_PATH), moduleBytes);
    return;
  }

  rmSync(join(projectDir, BUILT_MODULE_PATH), { force: true });
}
