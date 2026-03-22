#!/usr/bin/env node
import { Command } from "commander";

import {
  runBuildWorkspaceCommand,
  runBuildCommand,
  runExtractWorkspaceCommand,
  runExtractCommand,
  runInspectCommand,
  runStageWorkspaceInputCommand
} from "../app/commands.js";
import { formatCommandJson } from "../app/presenters.js";
import { APP_VERSION } from "../core/version.js";
import { runInteractiveCli } from "./interactive.js";
import {
  confirmLargeInputIfNeeded,
  handleCliError,
  printBuildResult,
  printExtractResult,
  printInspectResult
} from "./support.js";

const program = new Command();

program
  .name("risu-workspace-tools")
  .description("RisuAI 포맷을 Git 친화적인 작업 폴더로 다루기 위한 CLI")
  .version(APP_VERSION)
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
예시:
  risu-workspace-tools extract path\\to\\bot.charx path\\to\\workspaces\\bot
  risu-workspace-tools extract path\\to\\preset.risup path\\to\\workspaces\\preset
  risu-workspace-tools build path\\to\\workspaces\\bot
  risu-workspace-tools workspace stage-input path\\to\\bot.charx path\\to\\workspaces\\bot
  risu-workspace-tools workspace extract path\\to\\workspaces\\bot
  risu-workspace-tools workspace build path\\to\\workspaces\\bot
  risu-workspace-tools inspect path\\to\\module.risum
  risu-workspace-tools interactive
`
  );

program
  .command("extract")
  .description("입력 파일을 작업 폴더로 분해합니다.")
  .argument("<input>", "입력 파일 경로")
  .argument("<projectDir>", "출력할 작업 폴더 경로")
  .option("--json", "완료 결과를 JSON으로 출력합니다.")
  .option(
    "--yes-large-input",
    "500MB 이상 입력 파일 경고를 확인한 것으로 간주합니다."
  )
  .action(
    async (
      input: string,
      projectDir: string,
      options: { json?: boolean; yesLargeInput?: boolean }
    ) => {
      await confirmLargeInputIfNeeded(input, {
        autoApprove: options.yesLargeInput
      });
      const result = await runExtractCommand(input, projectDir);
      printExtractResult(result, options.json);
    }
  );

program
  .command("interactive")
  .description("대화형 입력으로 extract/build/inspect를 실행합니다.")
  .action(async () => {
    await runInteractiveCli();
  });

const workspaceProgram = program
  .command("workspace")
  .description("작업장 imports/ 준비와 extract/build를 돕는 명령입니다.");

workspaceProgram
  .command("stage-input")
  .description(
    "입력 파일을 작업장 imports/에 준비합니다. 기존 staged 입력은 교체됩니다."
  )
  .argument("<input>", "준비할 입력 파일 경로")
  .argument("<projectDir>", "작업장 폴더 경로")
  .option("--json", "결과를 JSON으로 출력합니다.")
  .option(
    "--yes-large-input",
    "500MB 이상 입력 파일 경고를 확인한 것으로 간주합니다."
  )
  .action(
    async (
      input: string,
      projectDir: string,
      options: { json?: boolean; yesLargeInput?: boolean }
    ) => {
      await confirmLargeInputIfNeeded(input, {
        autoApprove: options.yesLargeInput
      });
      const result = await runStageWorkspaceInputCommand(input, projectDir);
      if (options.json) {
        console.log(formatCommandJson(result));
        return;
      }

      console.log(
        [
          "입력 파일 준비 완료",
          `포맷: ${result.format}`,
          `원본 입력: ${result.inputPath}`,
          `staged 입력: ${result.stagedPath}`,
          `작업장: ${result.projectDir}`
        ].join("\n")
      );
    }
  );

workspaceProgram
  .command("extract")
  .description("작업장의 imports/에 staged 된 입력 파일을 추출합니다.")
  .argument("<projectDir>", "작업장 폴더 경로")
  .option("--json", "완료 결과를 JSON으로 출력합니다.")
  .action(async (projectDir: string, options: { json?: boolean }) => {
    const result = await runExtractWorkspaceCommand(projectDir);
    printExtractResult(result, options.json);
  });

workspaceProgram
  .command("build")
  .description("작업장을 dist/ 아래 결과 파일로 빌드합니다.")
  .argument("<projectDir>", "작업장 폴더 경로")
  .option("--json", "완료 결과를 JSON으로 출력합니다.")
  .action(async (projectDir: string, options: { json?: boolean }) => {
    const result = await runBuildWorkspaceCommand(projectDir);
    printBuildResult(result, options.json);
  });

program
  .command("build")
  .description("작업 폴더를 다시 결과 파일로 조립합니다.")
  .argument("<projectDir>", "입력 작업 폴더 경로")
  .argument("[output]", "출력 파일 경로")
  .option("--json", "완료 결과를 JSON으로 출력합니다.")
  .action(
    async (
      projectDir: string,
      output: string | undefined,
      options: { json?: boolean }
    ) => {
      const result = await runBuildCommand(projectDir, output);
      printBuildResult(result, options.json);
    }
  );

program
  .command("inspect")
  .description("입력 파일의 핵심 메타데이터를 출력합니다.")
  .argument("<input>", "입력 파일 경로")
  .option(
    "--yes-large-input",
    "500MB 이상 입력 파일 경고를 확인한 것으로 간주합니다."
  )
  .action(async (input: string, options: { yesLargeInput?: boolean }) => {
    await confirmLargeInputIfNeeded(input, {
      autoApprove: options.yesLargeInput
    });
    const result = await runInspectCommand(input);
    printInspectResult(result);
  });

program.parseAsync(process.argv).catch(handleCliError);
