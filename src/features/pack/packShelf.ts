/** Moving packs on and off the shelf. Everything goes through the store's settings, so it saves like any edit. */
import { useStore } from "../../data/store";
import { uid } from "../../data/types";
import { AppSpec } from "../../lib/appSpec";
import { createPack, deletePack, LIVE_KEYS, Live, packsFor, parseShelf, renamePack, Shelf, switchTo } from "../../lib/packs";

type Config = ReturnType<typeof useStore.getState>["config"];

const liveOf = (config: Config): Live => Object.fromEntries(LIVE_KEYS.map((k) => [k, config[k]])) as Live;

function write(shelf: Shelf, live: Live | null) {
  const { config, setSetting } = useStore.getState();
  setSetting("packs", JSON.stringify(shelf));
  if (!live) return;
  for (const k of LIVE_KEYS) if (config[k] !== live[k]) setSetting(k, live[k]);
}

export function switchPack(id: string) {
  const { config } = useStore.getState();
  const next = switchTo(parseShelf(config.packs), liveOf(config), id);
  if (next) write(next.shelf, next.live);
}

export function newPack(name: string, project: string, spec?: AppSpec) {
  const { config } = useStore.getState();
  const next = createPack(parseShelf(config.packs), liveOf(config), uid(), name, project, spec);
  write(next.shelf, next.live);
}

export function renameCurrentPack(name: string) {
  const shelf = parseShelf(useStore.getState().config.packs);
  write(renamePack(shelf, shelf.current, name), null);
}

/** False when it's the last pack, which stays. */
export function removePack(id: string): boolean {
  const { config } = useStore.getState();
  const next = deletePack(parseShelf(config.packs), id);
  if (!next) return false;
  write(next.shelf, next.live);
  return true;
}

/**
 * When the project changes, bring out that project's pack, if it has one. Nothing is created: a project
 * without a pack keeps whichever pack is out until the person makes one.
 */
export function followProject(project: string) {
  const { config } = useStore.getState();
  const shelf = parseShelf(config.packs);
  const current = shelf.list.find((p) => p.id === shelf.current);
  if (!current || current.project === project) return;
  const own = packsFor(shelf, project)[0];
  if (own) switchPack(own.id);
}
