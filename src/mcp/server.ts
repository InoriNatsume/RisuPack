#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  runBuildCommand,
  runExtractCommand,
  runInspectCommand
} from "../app/commands.js";
import {
  formatBuildResult,
  formatExtractResult,
  formatInspectResult
} from "../app/presenters.js";
import { APP_VERSION } from "../core/version.js";
import {
  assertMcpAccessPolicyConfigured,
  assertMcpPathAllowed,
  parseMcpAccessPolicy,
  redactMcpMessage,
  redactMcpPath,
  type McpAccessPolicy
} from "./access.js";

const accessPolicy = parseMcpAccessPolicy(process.argv.slice(2));

const server = new McpServer(
  {
    name: "risu-workspace-tools",
    version: APP_VERSION
  },
  {
    capabilities: {
      logging: {}
    }
  }
);

server.registerTool(
  "extract_project",
  {
    title: "Extract Project",
    description:
      "RisuAI 입력 파일을 작업장 폴더로 추출합니다. 입력 파일과 작업장 경로를 직접 받습니다.",
    inputSchema: z.object({
      inputPath: z.string().describe("추출할 입력 파일 경로"),
      projectDir: z.string().describe("출력할 작업장 폴더 경로")
    }),
    outputSchema: z.object({
      command: z.literal("extract"),
      inputPath: z.string(),
      projectDir: z.string(),
      format: z.enum([
        "risum",
        "charx",
        "png",
        "jpg",
        "jpeg",
        "risup",
        "risupreset"
      ]),
      kind: z.enum(["module", "bot", "preset"])
    })
  },
  async ({ inputPath, projectDir }): Promise<CallToolResult> => {
    try {
      assertMcpPathAllowed(accessPolicy, inputPath, "input");
      assertMcpPathAllowed(accessPolicy, projectDir, "project");
      const result = await runExtractCommand(inputPath, projectDir);
      const sanitized = {
        ...result,
        inputPath: redactMcpPath(accessPolicy, result.inputPath),
        projectDir: redactMcpPath(accessPolicy, result.projectDir)
      };
      return {
        content: [{ type: "text", text: formatExtractResult(sanitized) }],
        structuredContent: sanitized
      };
    } catch (error: unknown) {
      return toToolError(error, accessPolicy);
    }
  }
);

server.registerTool(
  "build_project",
  {
    title: "Build Project",
    description:
      "작업장 폴더를 다시 결과 파일로 빌드합니다. 출력 파일 경로는 생략할 수 있습니다.",
    inputSchema: z.object({
      projectDir: z.string().describe("빌드할 작업장 폴더 경로"),
      outputPath: z
        .string()
        .optional()
        .describe("선택 사항: 직접 지정할 출력 파일 경로")
    }),
    outputSchema: z.object({
      command: z.literal("build"),
      projectDir: z.string(),
      outputPath: z.string(),
      kind: z.enum(["module", "bot", "preset"]),
      sourceFormat: z.enum([
        "risum",
        "charx",
        "png",
        "jpg",
        "jpeg",
        "risup",
        "risupreset"
      ])
    })
  },
  async ({ projectDir, outputPath }): Promise<CallToolResult> => {
    try {
      assertMcpPathAllowed(accessPolicy, projectDir, "project");
      if (outputPath) {
        assertMcpPathAllowed(accessPolicy, outputPath, "output");
      }
      const result = await runBuildCommand(projectDir, outputPath);
      const sanitized = {
        ...result,
        projectDir: redactMcpPath(accessPolicy, result.projectDir),
        outputPath: redactMcpPath(accessPolicy, result.outputPath)
      };
      return {
        content: [{ type: "text", text: formatBuildResult(sanitized) }],
        structuredContent: sanitized
      };
    } catch (error: unknown) {
      return toToolError(error, accessPolicy);
    }
  }
);

server.registerTool(
  "inspect_input",
  {
    title: "Inspect Input",
    description: "입력 파일의 핵심 메타데이터를 확인합니다.",
    inputSchema: z.object({
      inputPath: z.string().describe("확인할 입력 파일 경로")
    }),
    outputSchema: z.object({
      command: z.literal("inspect"),
      inputPath: z.string(),
      format: z.enum([
        "risum",
        "charx",
        "png",
        "jpg",
        "jpeg",
        "risup",
        "risupreset"
      ]),
      details: z.record(z.string(), z.unknown())
    })
  },
  async ({ inputPath }): Promise<CallToolResult> => {
    try {
      assertMcpPathAllowed(accessPolicy, inputPath, "input");
      const result = await runInspectCommand(inputPath);
      const sanitized = {
        ...result,
        inputPath: redactMcpPath(accessPolicy, result.inputPath),
        details: { ...result.details }
      };
      return {
        content: [{ type: "text", text: formatInspectResult(sanitized) }],
        structuredContent: sanitized
      };
    } catch (error: unknown) {
      return toToolError(error, accessPolicy);
    }
  }
);

async function main(): Promise<void> {
  assertMcpAccessPolicyConfigured(accessPolicy);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `risu-workspace-tools MCP 서버가 stdio에서 실행 중입니다. 허용 루트 수: ${accessPolicy.allowedRoots.length}`
  );
}

function toToolError(error: unknown, policy: McpAccessPolicy): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [
      { type: "text", text: `오류: ${redactMcpMessage(policy, message)}` }
    ]
  };
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `MCP 서버 시작 실패: ${redactMcpMessage(accessPolicy, message)}`
  );
  process.exit(1);
});
