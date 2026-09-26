export type PendingToasts<Entry> = {
  add: (id: number, entry: Entry) => void;
  /** Hands the entry out once and forgets it, so commit and undo each find it at most once, never both. */
  take: (id: number) => Entry | undefined;
  /** Replaces the entry through `change` only while it is pending: a settled toast stays settled. */
  update: (id: number, change: (entry: Entry) => Entry) => void;
  ids: () => number[];
};

export function createPendingToasts<Entry>(): PendingToasts<Entry> {
  const entries = new Map<number, Entry>();
  return {
    add: (id, entry) => {
      entries.set(id, entry);
    },
    take: (id) => {
      const entry = entries.get(id);
      entries.delete(id);
      return entry;
    },
    update: (id, change) => {
      const entry = entries.get(id);
      if (entry !== undefined) entries.set(id, change(entry));
    },
    ids: () => [...entries.keys()],
  };
}
