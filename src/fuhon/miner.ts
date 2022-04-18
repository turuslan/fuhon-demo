import { spawn } from "../spawn.ts";
import { MinerApi, NodeApi, repoRpc } from "../api.ts";
import { ensureDirSync } from "../mkdir.ts";
import { red } from "../color.ts";
import { FUHON_MINER } from "./_.ts";
import { GenesisMiner, SECTOR } from "../lotus/genesis.ts";
import { decode as unhex } from "https://deno.land/std@0.135.0/encoding/hex.ts";
import { __rel, join } from "../__rel.ts";

export class FuhonMiner {
  process: Deno.Process = null as any;
  _ready: Promise<void>;
  api: MinerApi = null as any;
  owner: string = null as any;
  actor: string;
  constructor(
    public repo: string,
    node: { repo: string; _ready: Promise<void>; api: NodeApi },
    genesis: GenesisMiner,
    port: number,
  ) {
    this.actor = genesis.actor;
    ensureDirSync(repo);
    const params = "proof-params.json";
    Deno.copyFileSync(__rel(import.meta, params), join(repo, params));
    this._ready = node._ready.then(async () => {
      this.owner = await node.api.WalletImport(
        JSON.parse(
          new TextDecoder().decode(unhex(Deno.readFileSync(genesis.info.key))),
        ),
      );
      const args = [
        "--miner-repo",
        repo,
        "--repo",
        node.repo,
        "--miner-api",
        `${port}`,
        "--actor",
        genesis.actor,
        "--sector-size",
        SECTOR,
        "--pre-sealed-sectors",
        genesis.info.dir,
        "--pre-sealed-metadata",
        genesis.info.json,
        "--profile",
        "2k",
        "--fake-winning-post",
      ];
      if (!"DEBUG") {
        console.log(
          `${red("DEBUG fuhon-miner")}\n  arg: ${args.join(" ")}`,
        );
      } else {
        this.process = spawn({ cmd: [FUHON_MINER, ...args], stdout: "null" });
      }
      this.api = new MinerApi(await repoRpc(repo));
    });
  }
  async ready() {
    await this._ready;
    return this;
  }
}
