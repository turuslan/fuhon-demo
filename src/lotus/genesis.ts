import { spawn } from "../spawn.ts";
import { existsSync } from "https://deno.land/std@0.135.0/fs/exists.ts";
import { ensureSymlinkSync } from "https://deno.land/std@0.135.0/fs/ensure_symlink.ts";
import { LOTUS } from "./_.ts";
import { join } from "../__rel.ts";
import { red } from "../color.ts";
import { ensureDirSync } from "../mkdir.ts";

const NETWORK = 15;
export const SECTOR = "2KiB";

async function seed(...args: string[]) {
  if (Deno.env.get("CMD")) console.info(`lotus-seed ${args.join(" ")}`);
  const process = spawn({
    cmd: [`${LOTUS}-seed`, ...args],
    stdout: "piped",
    stderr: "piped",
  });
  const status = await process.status();
  if (!status.success) {
    const stdout = new TextDecoder().decode(await process.output());
    const stderr = new TextDecoder().decode(await process.stderrOutput());
    console.error("lotus-seed", args);
    console.error(stdout);
    console.error(red(stderr));
    Deno.exit(1);
  }
}

export interface GenesisMiner {
  i: number;
  actor: string;
  info: PresealInfo;
}
class PresealInfo {
  key: string;
  json: string;
  constructor(public dir: string, public actor: string) {
    this.key = join(dir, `pre-seal-${actor}.key`);
    this.json = join(dir, `pre-seal-${actor}.json`);
  }
  _sector(type: "cache" | "sealed", i: number) {
    return join(this.dir, type, `s-${this.actor}-${i}`);
  }
  _copy(to: PresealInfo, type: "cache" | "sealed", i: number) {
    const _to = to._sector(type, i);
    ensureSymlinkSync(this._sector(type, i), _to);
  }
  copy(to: PresealInfo, i: number) {
    this._copy(to, "cache", i);
    this._copy(to, "sealed", i);
  }
  async _preseal(i: number | null, key: string) {
    const args = [
      "--sector-dir",
      this.dir,
      "pre-seal",
      "--network-version",
      `${NETWORK}`,
      "--sector-size",
      SECTOR,
      "--miner-addr",
      this.actor,
      "--num-sectors",
      i !== null ? "1" : "0",
    ];
    if (i !== null) args.push("--sector-offset", `${i}`);
    const _key = existsSync(key);
    if (_key) args.push("--key", key);
    await seed(...args);
    if (!_key) Deno.copyFileSync(this.key, key);
  }
}
async function makeMiner(
  cache: string,
  out: string,
  i: number,
  count: number,
): Promise<GenesisMiner> {
  const actor = `t0${1000 + i}`;
  const dir1 = join(cache, "preseal", actor);
  const key = join(dir1, "key");
  const info2 = new PresealInfo(out, actor);
  const json = {};
  const Sectors: any = [];
  for (let j = 0; j < count; ++j) {
    const info1 = new PresealInfo(join(dir1, `s-${j}`), actor);
    if (!existsSync(info1.json)) {
      await info1._preseal(j, key);
    }
    info1.copy(info2, j);
    const _json = JSON.parse(Deno.readTextFileSync(info1.json))[actor];
    Sectors.push(..._json.Sectors);
    Object.assign(json, _json);
  }
  Deno.copyFileSync(key, info2.key);
  Deno.writeTextFileSync(
    info2.json,
    JSON.stringify({ [actor]: { ...json, Sectors } }),
  );
  return {
    i,
    actor,
    info: info2,
  };
}

export async function makeGenesis(opt: {
  cache: string;
  tmp: string;
  sectors: number[];
}) {
  const genesis = join(opt.tmp, "genesis");
  ensureDirSync(genesis);
  if (opt.sectors.length === 0) throw new Error("no miners");
  if (opt.sectors.some((x) => x === 0)) throw new Error("empty miner");
  const json = join(genesis, "genesis.json");
  const car = join(genesis, "genesis.car");
  const miners: GenesisMiner[] = [];

  await seed("genesis", "new", "--network-name", "mainnet", json); // BUG: lotus-miner, "--network-name mainnet"
  await seed(
    "genesis",
    "set-network-version",
    "--network-version",
    `${NETWORK}`,
    json,
  );
  for (let i = 0; i < opt.sectors.length; ++i) {
    const miner = await makeMiner(opt.cache, genesis, i, opt.sectors[i]);
    await seed("genesis", "add-miner", json, miner.info.json);
    miners.push(miner);
  }
  Deno.writeTextFileSync(
    join(genesis, "sectorstore.json"),
    JSON.stringify({
      ID: "04907c98-22ea-4cca-bf07-043b23d9a6ae",
      Weight: 0,
      CanSeal: true,
      CanStore: true,
      MaxStorage: 0,
    }),
  );
  await seed("genesis", "car", "--out", car, json);

  return {
    car,
    miners,
  };
}
