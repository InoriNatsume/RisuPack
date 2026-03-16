#!/usr/bin/env node
import { Command } from "commander";

import { routeBuild, routeExtract } from "../core/routing.js";
import { inspectInput } from "../core/inspect.js";

const program = new Command();

program
  .name("risu-workspace-tools")
  .description("RisuAI 포맷을 Git 친화적인 작업 폴더로 다루기 위한 CLI")
  .version("0.1.0")
  .showHelpAfterError()
  .addHelpText(
    "after",
    `
예시:
  risu-workspace-tools extract workspace\\samples\\test_file\\Serena.charx workspace\\runs\\serena
  risu-workspace-tools extract workspace\\samples\\test_file\\🦋 PSYCHE v1.8.risup workspace\\runs\\psyche
  risu-workspace-tools build workspace\\runs\\serena
  risu-workspace-tools inspect workspace\\samples\\test_file\\벨피라.risum
`
  );

program
  .command("extract")
  .description("입력 파일을 작업 폴더로 분해합니다.")
  .argument("<input>", "입력 파일 경로")
  .argument("<projectDir>", "출력할 작업 폴더 경로")
  .action(async (input: string, projectDir: string) => {
    await routeExtract(input, projectDir);
  });

program
  .command("build")
  .description("작업 폴더를 다시 결과 파일로 조립합니다.")
  .argument("<projectDir>", "입력 작업 폴더 경로")
  .argument("[output]", "출력 파일 경로")
  .action(async (projectDir: string, output?: string) => {
    await routeBuild(projectDir, output);
  });

program
  .command("inspect")
  .description("입력 파일의 핵심 메타데이터를 출력합니다.")
  .argument("<input>", "입력 파일 경로")
  .action(async (input: string) => {
    const result = await inspectInput(input);
    console.log(JSON.stringify(result, null, 2));
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`오류: ${message}`);
  process.exitCode = 1;
});
