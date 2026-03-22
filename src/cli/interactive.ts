#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import {
  runBuildCommand,
  runExtractCommand,
  runInspectCommand
} from "../app/commands.js";
import {
  confirmLargeInputIfNeeded,
  printBuildResult,
  printExtractResult,
  printInspectResult,
  handleCliError
} from "./support.js";

type InteractiveAction = "extract" | "build" | "inspect";

export async function runInteractiveCli(): Promise<void> {
  const rl = createInterface({ input, output });

  try {
    console.log("Risu Workspace Tools 대화형 CLI");
    console.log("실행할 작업을 고르세요.");
    console.log("1. extract");
    console.log("2. build");
    console.log("3. inspect");

    const action = await promptAction(rl);

    switch (action) {
      case "extract": {
        const inputPath = await promptRequired(
          rl,
          "입력 파일 경로를 적어주세요"
        );
        const projectDir = await promptRequired(
          rl,
          "작업장 폴더 경로를 적어주세요"
        );
        await confirmLargeInputIfNeeded(inputPath, {
          ask: (message) => promptYesNo(rl, message)
        });
        const result = await runExtractCommand(inputPath, projectDir);
        printExtractResult(result);
        return;
      }
      case "build": {
        const projectDir = await promptRequired(
          rl,
          "작업장 폴더 경로를 적어주세요"
        );
        const outputPath = await promptOptional(
          rl,
          "출력 파일 경로가 있으면 적어주세요 (없으면 Enter)"
        );
        const result = await runBuildCommand(
          projectDir,
          outputPath || undefined
        );
        printBuildResult(result);
        return;
      }
      case "inspect": {
        const inputPath = await promptRequired(
          rl,
          "확인할 입력 파일 경로를 적어주세요"
        );
        await confirmLargeInputIfNeeded(inputPath, {
          ask: (message) => promptYesNo(rl, message)
        });
        const result = await runInspectCommand(inputPath);
        printInspectResult(result);
        return;
      }
    }
  } finally {
    rl.close();
  }
}

async function promptAction(
  rl: ReturnType<typeof createInterface>
): Promise<InteractiveAction> {
  while (true) {
    const value = (await rl.question("> ")).trim().toLowerCase();
    switch (value) {
      case "1":
      case "extract":
        return "extract";
      case "2":
      case "build":
        return "build";
      case "3":
      case "inspect":
        return "inspect";
      default:
        console.log(
          "`1`, `2`, `3` 또는 `extract`, `build`, `inspect` 중 하나를 입력해주세요."
        );
    }
  }
}

async function promptRequired(
  rl: ReturnType<typeof createInterface>,
  label: string
): Promise<string> {
  while (true) {
    const value = (await rl.question(`${label}\n> `)).trim();
    if (value) {
      return value;
    }
    console.log("빈 값은 사용할 수 없습니다.");
  }
}

async function promptOptional(
  rl: ReturnType<typeof createInterface>,
  label: string
): Promise<string> {
  return (await rl.question(`${label}\n> `)).trim();
}

async function promptYesNo(
  rl: ReturnType<typeof createInterface>,
  label: string
): Promise<boolean> {
  while (true) {
    const value = (await rl.question(`${label}\n[y/N] > `))
      .trim()
      .toLowerCase();
    if (!value || value === "n" || value === "no") {
      return false;
    }
    if (value === "y" || value === "yes") {
      return true;
    }
    console.log("`y` 또는 `n`으로 답해주세요.");
  }
}

const isDirectRun =
  process.argv[1] != null &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  runInteractiveCli().catch(handleCliError);
}
