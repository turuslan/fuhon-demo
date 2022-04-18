import { goLog, LOTUS } from "./_.ts";
import { spawn } from "../spawn.ts";
import { NodeApi, repoRpc } from "../api.ts";
import { red } from "../color.ts";
import { join } from "../__rel.ts";
import { ensureDirSync } from "../mkdir.ts";

export class LotusNode {
  process: Deno.Process = null as any;
  _ready: Promise<void>;
  api: NodeApi = null as any;
  constructor(
    public repo: string,
    public genesis: string,
    port: number,
    o?: { fvm?: boolean; debug?: boolean },
  ) {
    o = { fvm: false, debug: false, ...o };
    ensureDirSync(repo);
    const args = [
      "--repo",
      repo,
      "daemon",
      "--profile",
      "bootstrapper",
      "--genesis",
      genesis,
      "--api",
      `${port}`,
    ];
    const env = {
      ...goLog(join(repo, "go.log")),
      ...(o.fvm ? {} : { LEGACY_VM: "1" }),
    };
    if (o.debug) {
      console.log(
        `${red("DEBUG lotus")}\n  arg: ${args.join(" ")}\n  env: ${
          Object.entries(env).map((x) => x.join("=")).join(";")
        }`,
      );
    } else {
      this.process = spawn({
        cmd: [LOTUS, ...args],
        env,
      });
    }
    this._ready = repoRpc(repo).then((rpc) => {
      this.api = new NodeApi(rpc);
    });
  }
  async ready() {
    await this._ready;
    return this;
  }
}
