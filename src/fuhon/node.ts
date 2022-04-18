import { spawn } from "../spawn.ts";
import { NodeApi, repoRpc } from "../api.ts";
import { ensureDirSync } from "../mkdir.ts";
import { red } from "../color.ts";
import { FUHON_NODE } from "./_.ts";

export class FuhonNode {
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
      "--genesis",
      genesis,
      "--api",
      `${port}`,
      "--port",
      `${port + 100}`,
      "--log",
      "d",
      "--profile",
      "2k",
      "--fake-winning-post",
    ];
    if (o.debug) {
      console.log(
        `\n${red("DEBUG fuhon-node")}\n  arg: ${JSON.stringify(args)}\n`,
      );
    } else {
      this.process = spawn({
        cmd: [FUHON_NODE, ...args],
        stdout: "null",
        env: o.fvm ? { FUHON_USE_FVM_EXPERIMENTAL: "1" } : {},
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
