import { basename } from "node:path";

export interface WorkspaceAssetRecord {
  path: string;
  originalName?: string;
}

export function assignWorkspaceAssets<T extends WorkspaceAssetRecord>(
  currentPaths: string[],
  previousRecords: T[]
): Array<{ path: string; record?: T }> {
  const indexedRecords = previousRecords.map((record, index) => ({
    ...record,
    index
  }));
  const byPath = new Map(indexedRecords.map((record) => [record.path, record]));
  const byStem = new Map<string, Array<T & { index: number }>>();
  indexedRecords.forEach((record) => {
    const stemKeys = new Set([
      stemFromPath(record.path),
      stemFromPath(record.originalName ?? record.path)
    ]);
    for (const key of stemKeys) {
      if (!key) {
        continue;
      }
      const items = byStem.get(key) ?? [];
      items.push(record);
      byStem.set(key, items);
    }
  });

  const used = new Set<number>();
  const orderedPrevious = indexedRecords;

  return currentPaths.map((path) => {
    const exact = byPath.get(path);
    if (exact && !used.has(exact.index)) {
      used.add(exact.index);
      return { path, record: exact };
    }

    const stemMatches = byStem.get(stemFromPath(path)) ?? [];
    const availableStem = stemMatches.find((item) => !used.has(item.index));
    if (availableStem) {
      used.add(availableStem.index);
      return { path, record: availableStem };
    }

    const nextByOrder = orderedPrevious.find((item) => !used.has(item.index));
    if (nextByOrder) {
      used.add(nextByOrder.index);
      return { path, record: nextByOrder };
    }

    return { path };
  });
}

function stemFromPath(value: string): string {
  return basename(value)
    .replace(/\.[^.]+$/, "")
    .toLowerCase();
}
