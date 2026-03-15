export interface ModuleAssetRecord {
  sourceIndex: number;
  path: string;
  originalName: string;
  declaredExt?: string;
  detectedExt: string;
  mediaKind: "image" | "audio" | "video" | "binary";
}

export interface ModuleProjectMeta {
  assetRoot: string;
  assets: ModuleAssetRecord[];
}
