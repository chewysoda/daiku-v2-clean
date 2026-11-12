import * as Y from "yjs";
import { BoardItem, now } from "../../data/types";

const LOCAL = "local";
const LOAD = "load";

/**
 * A board's items in a Yjs document. SQLite rows stay the source of truth for now, but every
 * edit already goes through a CRDT, so sync can arrive later without changing the data model.
 * It also provides undo and redo.
 */
export class BoardDoc {
  readonly doc = new Y.Doc();
  private items = this.doc.getMap<BoardItem>("items");
  private undoManager = new Y.UndoManager(this.items, {
    trackedOrigins: new Set([LOCAL]),
    captureTimeout: 400,
  });

  constructor(initial: BoardItem[] = []) {
    this.doc.transact(() => {
      for (const item of initial) this.items.set(item.id, item);
    }, LOAD);
  }

  all(): BoardItem[] {
    return [...this.items.values()];
  }

  get(id: string): BoardItem | undefined {
    return this.items.get(id);
  }

  put(...items: BoardItem[]) {
    this.doc.transact(() => {
      const stamp = now();
      for (const item of items) this.items.set(item.id, { ...item, updated_at: stamp });
    }, LOCAL);
  }

  patch(patches: { id: string; changes: Partial<BoardItem> }[]) {
    this.doc.transact(() => {
      const stamp = now();
      for (const { id, changes } of patches) {
        const cur = this.items.get(id);
        if (cur) this.items.set(id, { ...cur, ...changes, updated_at: stamp });
      }
    }, LOCAL);
  }

  remove(ids: string[]) {
    const gone = new Set(ids);
    this.doc.transact(() => {
      for (const id of ids) this.items.delete(id);
      // A connector can't outlive either end.
      for (const item of this.items.values()) {
        if (item.kind === "connector" && (gone.has(item.data.from ?? "") || gone.has(item.data.to ?? ""))) {
          this.items.delete(item.id);
        }
      }
    }, LOCAL);
  }

  /** Reports what changed, for writing through to SQLite and re-rendering. */
  observe(fn: (changed: BoardItem[], removed: string[]) => void) {
    const handler = (event: Y.YMapEvent<BoardItem>, tx: Y.Transaction) => {
      if (tx.origin === LOAD) return;
      const changed: BoardItem[] = [];
      const removed: string[] = [];
      for (const key of event.changes.keys.keys()) {
        const value = this.items.get(key);
        if (value) changed.push(value);
        else removed.push(key);
      }
      fn(changed, removed);
    };
    this.items.observe(handler);
    return () => this.items.unobserve(handler);
  }

  /** Ends the current undo step, so that the next change undoes on its own however quickly it follows. */
  checkpoint() {
    this.undoManager.stopCapturing();
  }
  undo() {
    this.undoManager.undo();
  }
  redo() {
    this.undoManager.redo();
  }
  destroy() {
    this.undoManager.destroy();
    this.doc.destroy();
  }
}
