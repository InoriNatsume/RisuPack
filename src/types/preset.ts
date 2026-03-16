export interface PromptTemplatePackMetaItem {
  jsonFile: string;
  textFile?: string;
}

export interface PromptTemplatePackMeta {
  version: 1;
  items: PromptTemplatePackMetaItem[];
}

export interface RegexPackMetaItem {
  sourceFile: string;
}

export interface PresetRegexPackMeta {
  version: 1;
  items: RegexPackMetaItem[];
}
