export function rm(...paths: string[]) {
  for (const path of paths) {
    try {
      Deno.removeSync(path, { recursive: true });
    } catch (e) {
      if (!(e instanceof Deno.errors.NotFound)) throw e;
    }
  }
}
