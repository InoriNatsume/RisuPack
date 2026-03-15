export interface BotEditableData {
  name: string;
  description: string;
  firstMessage: string;
  additionalFirstMessages: string[];
  globalNote: string;
  css: string;
  defaultVariables: string;
}

export interface PngAssetRecord {
  chunkKey: string;
  assetIndex: string;
  path: string;
  originalName: string;
  declaredExt?: string;
  detectedExt: string;
  mediaKind: "image" | "audio" | "video" | "binary";
}

export interface BotAssetRecord {
  sourcePath: string;
  path: string;
  originalName: string;
  declaredExt?: string;
  detectedExt: string;
  mediaKind: "image" | "audio" | "video" | "binary";
}

export interface BotMeta {
  format: "charx" | "png" | "jpg" | "jpeg";
  container: "zip-charx" | "jpeg-zip" | "png-chunks";
  cardFile: "card.json";
  assetRoot: string;
  assets: string[];
  botAssets?: BotAssetRecord[];
  xMetaFiles: string[];
  embeddedModuleProjectDir?: string;
  preservedModuleFile?: string;
  preservedContainerPrefixFile?: string;
  preservedContainerFile?: string;
  pngCardChunkKeys?: Array<"ccv3" | "chara">;
  pngAssets?: PngAssetRecord[];
}
