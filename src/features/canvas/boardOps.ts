import { useStore } from "../../data/store";
import { BoardItem, now, uid } from "../../data/types";

export const nextZ = (items: Pick<BoardItem, "z">[]) => items.reduce((m, i) => Math.max(m, i.z), 0) + 1;

/** Lays new images out in a row below whatever is already on the board. */
export function placeAssets(
  boardId: string,
  assetIds: string[],
  existing: BoardItem[],
  origin?: { x: number; y: number },
): BoardItem[] {
  const assets = useStore.getState().assets;
  const placed = existing.filter((i) => i.kind !== "connector");
  const bottom = placed.reduce((m, i) => Math.max(m, i.y + i.h), 0);
  const startX = origin?.x ?? 64;
  const startY = origin?.y ?? (placed.length ? bottom + 40 : 64);
  let z = nextZ(existing);
  return assetIds.map((asset_id, i) => {
    const a = assets.find((x) => x.id === asset_id);
    const isDoc = a?.kind !== "image";
    const w = isDoc ? 340 : 240;
    const ratio = a?.width && a?.height ? a.height / a.width : 1;
    return {
      id: uid(),
      board_id: boardId,
      kind: "image",
      x: startX + (i % 4) * (w + 24),
      y: startY + Math.floor(i / 4) * 300,
      w,
      h: isDoc ? 84 : Math.round(Math.max(120, Math.min(320, w * ratio))),
      rotation: 0,
      z: z++,
      asset_id,
      data: {},
      updated_at: now(),
    };
  });
}

/** Adding from outside the canvas (Library, say): writes rows the canvas loads when it opens. */
export function addAssetsToBoard(boardId: string, assetIds: string[]) {
  const s = useStore.getState();
  const existing = s.board_items.filter((i) => i.board_id === boardId);
  s.putItems(placeAssets(boardId, assetIds, existing));
  s.touchBoard(boardId);
}
