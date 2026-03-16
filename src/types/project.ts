export type SupportedInputFormat =
  | "risum"
  | "charx"
  | "png"
  | "jpg"
  | "jpeg"
  | "risup"
  | "risupreset";

export type ProjectKind = "module" | "bot" | "preset";

export interface ProjectMeta {
  kind: ProjectKind;
  sourceFormat: SupportedInputFormat;
  sourceName: string;
  createdBy: "risu-workspace-tools";
  version: 1;
}
