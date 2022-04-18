const children = new Set<Deno.Process>();
function killChildren() {
  for (const process of children) {
    process.kill("SIGKILL");
  }
}
Deno.addSignalListener("SIGINT", () => {
  console.log();
  killChildren();
  Deno.exit(1);
});
Deno.addSignalListener("SIGTERM", () => {
  killChildren();
  Deno.exit(1);
});
window.addEventListener("unload", killChildren);

export function spawn(opt: Deno.RunOptions) {
  opt = {
    ...opt,
    stdin: "null",
  };
  const process = Deno.run(opt);
  children.add(process);
  process.status().then(() => children.delete(process));
  return process;
}
