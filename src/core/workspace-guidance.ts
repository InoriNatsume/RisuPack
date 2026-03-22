import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

import type { ProjectMeta } from "../types/project.js";

const TEMPLATE_ARCHIVE_PATH = ["templates", "workspace-guidance.zip"];

export function ensureWorkspaceGuidance(
  projectDir: string,
  projectMeta: ProjectMeta
): void {
  const resolvedProjectDir = resolve(projectDir);
  const skillDirectory = skillDirectoryName(projectMeta);
  const skillPath = join(".agents", "skills", skillDirectory, "SKILL.md");
  const replacements = {
    projectKind: projectMeta.kind,
    sourceFormat: projectMeta.sourceFormat,
    projectDir: resolvedProjectDir,
    skillPath: normalizeForMarkdownPath(skillPath),
    cliEntry: resolve(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "..",
      "dist",
      "cli",
      "main.js"
    )
  };
  const zip = new AdmZip(templateArchivePath());
  const templateFiles = [
    {
      from: "AGENTS.md",
      to: "AGENTS.md"
    },
    {
      from: join(".agents", "skills", skillDirectory, "SKILL.md"),
      to: skillPath
    }
  ] as const;

  for (const templateFile of templateFiles) {
    const destinationPath = join(resolvedProjectDir, templateFile.to);
    if (existsSync(destinationPath)) {
      continue;
    }

    const entry = findTemplateEntry(zip, templateFile.from);
    if (!entry) {
      throw new Error(
        `작업장 가이드 템플릿을 찾을 수 없습니다: ${templateFile.from}`
      );
    }
    const rendered = renderTemplate(
      entry.getData().toString("utf-8"),
      replacements
    );

    mkdirSync(dirname(destinationPath), { recursive: true });
    writeFileSync(destinationPath, rendered, "utf-8");
  }
}

function skillDirectoryName(projectMeta: ProjectMeta): string {
  switch (projectMeta.kind) {
    case "bot":
      return "risu-bot-workspace";
    case "module":
      return "risu-module-workspace";
    case "preset":
      return "risu-preset-workspace";
  }
}

function templateArchivePath(): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    ...TEMPLATE_ARCHIVE_PATH
  );
}

function renderTemplate(
  template: string,
  replacements: Record<string, string>
): string {
  let rendered = template;

  for (const [key, value] of Object.entries(replacements)) {
    rendered = rendered.replaceAll(`{{${key}}}`, value);
  }

  return rendered;
}

function normalizeForZipPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function normalizeForMarkdownPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function findTemplateEntry(zip: AdmZip, templatePath: string) {
  const normalizedTemplatePath = normalizeForZipPath(templatePath);
  return zip
    .getEntries()
    .find(
      (entry) => normalizeForZipPath(entry.entryName) === normalizedTemplatePath
    );
}
