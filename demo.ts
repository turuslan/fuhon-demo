#!/usr/bin/env -S deno run --allow-all

import { cacheTmp } from "./src/cache_tmp.ts";
import { green, red } from "./src/color.ts";
import { makeGenesis } from "./src/lotus/genesis.ts";
import { LotusMiner } from "./src/lotus/miner.ts";
import { LotusNode } from "./src/lotus/node.ts";
import { FuhonNode } from "./src/fuhon/node.ts";
import { join } from "./src/__rel.ts";
import { FuhonMiner } from "./src/fuhon/miner.ts";
import { NodeApi } from "./src/api.ts";
import { delay } from "https://deno.land/std@0.136.0/async/delay.ts";
import { deferred } from "https://deno.land/std@0.136.0/async/deferred.ts";
import { Sha1 } from "https://deno.land/std@0.136.0/hash/sha1.ts";

const [CACHE, TMP] = cacheTmp(import.meta);

const genesis = await makeGenesis({ tmp: TMP, cache: CACHE, sectors: [1, 1] });
let port = 3000;

const node2 = await new FuhonNode(join(TMP, "fuhon1"), genesis.car, port++)
  .ready();
console.log(green("fuhon1"), (await node2.api.Version()).Version);

const node1 = await new LotusNode(join(TMP, "lotus2"), genesis.car, port++)
  .ready();
console.log(green("lotus2"), (await node1.api.Version()).Version);

await node2.api.NetConnect(await node1.api.NetAddrsListen());

function watchChain(name: string, node: { api: NodeApi }) {
  node.api.rpc.chan("Filecoin.ChainNotify", [], (cs) => {
    for (const c of cs) {
      if (c.Type === "revert") continue;
      const ts = c.Val;
      console.log(
        `${name} chain: epoch ${ts.Height} [${
          ts.Blocks.map((b: any) =>
            ["lotus-miner", "fuhon-miner"][+b.Miner.slice(-1)]
          )
            .join(" ")
        }]`,
      );
    }
  });
}
watchChain("lotus2", node1);
watchChain("fuhon1", node2);

const miner1 = await new LotusMiner(
  join(TMP, "miner2"),
  node1,
  genesis.miners[0],
  port++,
).ready();
console.log(green("miner2"), (await miner1.api.Version()).Version);

const miner2 = await new FuhonMiner(
  join(TMP, "miner1"),
  node2,
  genesis.miners[1],
  port++,
).ready();
console.log(green("miner1"), (await miner2.api.Version()).Version);

const _kSector =
  "kStateUnknown kSealPreCommit1Fail kSealPreCommit2Fail kPreCommitFail kComputeProofFail kCommitFail kFinalizeFail kDealsExpired kRecoverDealIDs kPacking kWaitDeals kPreCommit1 kPreCommit2 kPreCommitting kSubmitPreCommitBatch kPreCommittingWait kWaitSeed kComputeProof kCommitting kCommitWait kFinalizeSector kProving kFaulty kFaultReported kRemoving kRemoveFail kRemoved kForce"
    .split(" ");
async function watchSector(miner: LotusMiner, i: number) {
  let _s, s;
  while (true) {
    const r = await miner.api.SectorsStatus(i, false);
    s = r.State;
    if (/^\d+$/.test(s) && +s < _kSector.length) {
      s = _kSector[+s];
    }
    if (s !== _s) {
      let p = _s;
      _s = s;
      console.log(
        `${green(`sector ${miner.actor}-${i}`)}: ${
          /fail/i.test(s) ? red(s) : s === "Proving" ? green(s) : s
        }`,
      );
    }
    await delay(1000);
  }
}
async function watchSectors(miner: LotusMiner) {
  const s = new Set();
  while (true) {
    for (const i of await miner.api.SectorsList()) {
      if (s.has(i)) continue;
      watchSector(miner, i);
      s.add(i);
    }
    await delay(1000);
  }
}
watchSectors(miner2);

const miner2_peer = await miner2.api.NetAddrsListen();
while (true) {
  const chain = await node2.api.StateMinerInfo(miner2.actor, []);
  if (chain.PeerId === miner2_peer.ID) break;
  await delay(1000);
}

const path1 = join(TMP, "file1.bin");
Deno.writeFileSync(path1, crypto.getRandomValues(new Uint8Array(1931)));
console.log(green("ClientImport"));
const { Root: cid1 } = await node2.api.ClientImport({
  Path: path1,
  IsCAR: false,
});

let onDeal = deferred<void>();
const _StorageDealStatus =
  "StorageDealUnknown StorageDealProposalNotFound StorageDealProposalRejected StorageDealProposalAccepted StorageDealStaged StorageDealSealing StorageDealFinalizing StorageDealActive StorageDealExpired StorageDealSlashed StorageDealRejecting StorageDealFailing StorageDealFundsEnsured StorageDealCheckForAcceptance StorageDealValidating StorageDealAcceptWait StorageDealStartDataTransfer StorageDealTransferring StorageDealWaitingForData StorageDealVerifyData StorageDealEnsureProviderFunds StorageDealEnsureClientFunds StorageDealProviderFunding StorageDealClientFunding StorageDealPublish StorageDealPublishing StorageDealError StorageDealProviderTransferAwaitRestart StorageDealClientTransferRestart StorageDealAwaitingPreCommit"
    .split(" ");
async function watchStorageDealsClient(node: LotusNode) {
  const ss = new Map<string, string>();
  while (true) {
    for (const r of await node.api.ClientListDeals()) {
      const k = r.ProposalCid["/"];
      const s = r.State, S = _StorageDealStatus[s];
      const _s = ss.get(k) ?? null;
      if (s !== _s) {
        ss.set(k, s);
        const m = `${green("client")}: p=${k} i=${r.DealID || "?"} ${S}(${s})`;
        console.log(
          S === "StorageDealActive"
            ? green(m)
            : /fail|error/i.test(S)
            ? red(m)
            : m,
        );
        if (S === "StorageDealActive") onDeal.resolve();
      }
    }
    await delay(1000);
  }
}
async function watchStorageDealsProvider(miner: LotusMiner) {
  const ss = new Map<string, string>();
  while (true) {
    for (const r of await miner.api.MarketListIncompleteDeals() || []) {
      const k = r.ProposalCid["/"];
      const s = r.State, S = _StorageDealStatus[s];
      const _s = ss.get(k) ?? null;
      if (s !== _s) {
        ss.set(k, s);
        let m = `${green("provider")}: p=${k} i=${r.DealID || "?"} ${S}(${s})${
          r.Message && ` [${r.Message}]`
        }`;
        if (/^StorageDealPublish(ing)?$/.test(S) && r.PublishCid) {
          m += ` ${r.PublishCid["/"]}`;
        }
        console.log(
          S === "StorageDealActive"
            ? green(m)
            : /fail|error/i.test(S)
            ? red(m)
            : m,
        );
      }
    }
    await delay(1000);
  }
}
watchStorageDealsClient(node2);
watchStorageDealsProvider(miner2);

console.log(green("ClientStartDeal"));
const deal1 = await node2.api.ClientStartDeal({
  Data: { Root: cid1, TransferType: "graphsync", PieceCid: null, PieceSize: 0 },
  Wallet: miner2.owner,
  Miner: miner2.actor,
  EpochPrice: "953",
  MinBlocksDuration: 180 * 2880 * /* BUG */ 2,
  ProviderCollateral: "0",
  DealStartEpoch: (await node2.api.ChainHead()).Height + 220,
  FastRetrieval: false,
  VerifiedDeal: false,
});

await onDeal;

const offers = await node2.api.rpc.call("Filecoin.ClientFindData", [
  cid1,
  null,
]);
const [offer] = offers;
if (!offers.length) console.log(red("NO OFFERS"));
const ff = offers.length > 1 ? ` +${offers.length - 1}` : "";
console.log(green("OFFER") + ff, JSON.stringify(offer));
const order = {
  Root: offer.Root,
  Piece: offer.Piece,
  Size: offer.Size,
  Total: offer.MinPrice,
  UnsealPrice: offer.UnsealPrice,
  PaymentInterval: offer.PaymentInterval,
  PaymentIntervalIncrease: offer.PaymentIntervalIncrease,
  Client: miner2.owner,
  Miner: offer.Miner,
  MinerPeer: offer.MinerPeer || null,

  LocalStore: null,
};
console.log(green("ORDER"), JSON.stringify(order));
const path1_out = join(TMP, "file1.retrieved.bin");
try {
  await node2.api.rpc.call("Filecoin.ClientRetrieve", [order, {
    Path: path1_out,
    IsCAR: false,
  }]);
  console.log(green("RETRIEVE"), "ok");
  function hash(path: string) {
    return new Sha1().update(Deno.readFileSync(path));
  }
  console.log(`stored    file hash ${hash(path1)}`);
  console.log(`retrieved file hash ${hash(path1_out)}`);
} catch (e) {
  console.log(red("RETRIEVE"), e.stack);
}

console.log(green("DONE"));

Deno.exit();
