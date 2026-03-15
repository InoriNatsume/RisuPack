export interface LorebookPackMetaItem {
  kind: "folder" | "entry";
  data: Record<string, unknown>;
  folderDir?: string;
  sourceFile?: string;
}

export interface LorebookPackMeta {
  version: 1;
  items: LorebookPackMetaItem[];
}

export interface RegexPackMetaItem {
  sourceFile: string;
}

export interface RegexPackMeta {
  version: 1;
  items: RegexPackMetaItem[];
}

export type TriggerMode = "none" | "lua" | "v2" | "unsupported-v1";

export interface TriggerPackMetaItem {
  version: 1;
  mode: TriggerMode;
  sourceFile?: string;
  noteFile?: string;
  triggerIndex?: number;
  effectIndex?: number;
  data?: unknown;
}
