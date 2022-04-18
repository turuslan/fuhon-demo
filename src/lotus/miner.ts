import { goLog, LOTUS } from "./_.ts";
import { spawn } from "../spawn.ts";
import { MinerApi, NodeApi, repoRpc } from "../api.ts";
import { GenesisMiner, SECTOR } from "./genesis.ts";
import * as Toml from "https://deno.land/std@0.135.0/encoding/toml.ts";
import { decode as unhex } from "https://deno.land/std@0.135.0/encoding/hex.ts";
import { red } from "../color.ts";
import { join } from "../__rel.ts";
import { ensureDirSync } from "../mkdir.ts";

const MINER = `${LOTUS}-miner`;

function patchConfig(repo: string) {
  const path = join(repo, "config.toml");
  const root = Toml.parse(Deno.readTextFileSync(path)) as any;
  root.Dealmaking.StartEpochSealingBuffer = 20;
  root.Dealmaking.ExpectedSealDuration = "5m0s";
  root.Dealmaking.PublishMsgPeriod = "1s";
  root.Dealmaking.MaxDealsPerPublishMsg = 1;
  root.Sealing.AggregateCommits = false;
  root.Sealing.BatchPreCommits = false;
  Deno.writeTextFileSync(path, Toml.stringify(root));
}

export class LotusMiner {
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
    this._ready = node._ready.then(async () => {
      this.owner = await node.api.WalletImport(
        JSON.parse(
          new TextDecoder().decode(unhex(Deno.readFileSync(genesis.info.key))),
        ),
      );
      const args1 = [
        "--repo",
        node.repo,
        "--miner-repo",
        repo,
        "init",
        "--nosync",
        "--sector-size",
        SECTOR,

        "--genesis-miner",
        "--actor",
        genesis.actor,
        "--pre-sealed-sectors",
        genesis.info.dir,
        "--pre-sealed-metadata",
        genesis.info.json,
      ];
      this.process = spawn({
        cmd: [
          MINER,
          ...args1,
        ],
        env: {
          ...goLog(`${repo}-init.log`),
        },
      });
      const status = await this.process.status();
      if (!status.success) throw new Error();
      patchConfig(repo);
      const args2 = [
        "--miner-repo",
        repo,
        "--repo",
        node.repo,
        "run",
        "--nosync",
        "--miner-api",
        `${port}`,
      ];
      const env = {
        ...goLog(join(repo, "go.log")),
      };
      if (!"DEBUG") {
        console.log(
          `${red("DEBUG lotus-miner")}\n  arg: ${args2.join(" ")}\n  env: ${
            Object.entries(env).map((x) => x.join("=")).join(";")
          }`,
        );
      } else {
        this.process = spawn({
          cmd: [MINER, ...args2],
          env,
        });
      }
      this.api = new MinerApi(await repoRpc(repo));
    });
  }
  async ready() {
    await this._ready;
    return this;
  }
}
