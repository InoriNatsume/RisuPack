export type SupportedInputFormat = "risum" | "charx" | "png" | "jpg" | "jpeg";

export type ProjectKind = "module" | "bot";

export interface ProjectMeta {
  kind: ProjectKind;
  sourceFormat: SupportedInputFormat;
  sourceName: string;
  createdBy: "risu-workspace-tools";
  version: 1;
}
