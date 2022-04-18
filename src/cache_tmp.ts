import { ensureDirSync } from "./mkdir.ts";
import { rm } from "./rm.ts";
import { __rel, join } from "./__rel.ts";

/** @returns [cache, tmp] */
export function cacheTmp(meta: ImportMeta) {
  const dir = __rel(meta);
  const cache = join(dir, "data-cache");
  const tmp = join(dir, "data-tmp");
  rm(tmp);
  ensureDirSync(cache);
  ensureDirSync(tmp);
  return [cache, tmp] as [string, string];
}
