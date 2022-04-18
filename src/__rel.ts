import {
  dirname,
  fromFileUrl,
  join,
} from "https://deno.land/std@0.135.0/path/mod.ts";

export function __rel(meta: ImportMeta, ...paths: string[]) {
  return join(dirname(fromFileUrl(meta.url)), ...paths);
}

export { join };
