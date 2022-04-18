import { join } from "https://deno.land/std@0.136.0/path/mod.ts";
import { delay } from "https://deno.land/std@0.136.0/async/delay.ts";

class CallError extends Error {
  constructor(
    public id: number,
    public method: string,
    public params: any[],
    public error?: JsonRpcError,
  ) {
    super();
  }
  withError(error: JsonRpcError) {
    this.error = error;
    this.message = `${this.method}${
      JSON.stringify(this.params)
    } id=${this.id} ${error ? JSON.stringify(error) : "TODO"}`;
    return this;
  }
}

interface JsonRpcError {
  code: number;
  message: string;
}
type CallCb<R = any> = (e: JsonRpcError | null, r: R | null) => void;
type ChanCb<R = any> = (r: R) => void;
export class Rpc {
  id = 0;
  calls = new Map<number, CallCb>();
  chans = new Map<number, ChanCb>();
  constructor(public ws: WebSocket) {
    ws.onmessage = ({ data }) => {
      const { id, error, result, method, params } = JSON.parse(data) as {
        id: number;
        error: JsonRpcError;
        result: any;
        method: string;
        params: any;
      };
      if (method === "xrpc.ch.close") {
        this.chans.delete(params[0]);
      } else if (method === "xrpc.ch.val") {
        const cb = this.chans.get(params[0])!;
        cb(params[1]);
      } else {
        const cb = this.calls.get(id)!;
        cb(error ?? null, result);
        this.calls.delete(id);
      }
    };
    ws.onclose = () => {
      for (const cb of this.calls.values()) {
        cb({ code: -1, message: "WebSocker closed" }, null);
      }
      this.calls.clear();
      this.chans.clear();
    };
  }
  call<R = any>(method: string, params: any[]) {
    const id = this.id++;
    const call = new CallError(id, method, params);
    if (this.ws.readyState !== this.ws.OPEN) {
      return Promise.reject(
        call.withError({ code: -1, message: "WebSocket not writable" }),
      );
    }
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return new Promise<R>((resolve, reject) =>
      this.calls.set(
        id,
        (error, result) => {
          if (error) {
            reject(call.withError(error));
          } else {
            resolve(result);
          }
        },
      )
    );
  }
  async chan<R = any>(method: string, params: any[], cb: ChanCb<R>) {
    const id = await this.call<number>(method, params);
    this.chans.set(id, cb);
  }
}

export function repoInfo(repo: string) {
  let match: RegExpMatchArray;
  let maddr: string;
  let token: string;
  try {
    maddr = Deno.readTextFileSync(join(repo, "api"));
    match = maddr.match(
      /\/ip4\/([^/]+)\/tcp\/([^/]+)(\/http|$)/,
    )!;
    token = Deno.readTextFileSync(join(repo, "token"));
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) return null;
    throw e;
  }
  if (!match) return null;
  const host = match[1];
  const port = +match[2];
  return {
    token,
    maddr,
    ws: `ws://${host}:${port}/rpc/v0?token=${token}`,
  };
}

export async function repoRpc(repo: string) {
  let url: string | null = null;
  while (true) {
    url = repoInfo(repo)?.ws ?? null;
    if (url) break;
    await delay(100);
  }
  let ws: WebSocket;
  while (true) {
    ws = new WebSocket(url);
    const open = await new Promise((resolve) => {
      ws.onopen = () => resolve(true);
      ws.onerror = () => resolve(false);
    });
    if (open) break;
    await delay(100);
  }
  return new Rpc(ws);
}

function call<T>(
  _proto: T,
  method: keyof T,
  prop: PropertyDescriptor,
) {
  prop.value = function (this: T & { rpc: Rpc }, ...params: any[]) {
    return this.rpc.call(`Filecoin.${method}`, params);
  };
}

interface _Cid {
  ["/"]: string;
}

interface _DataRef {
  TransferType: "graphsync" | "manual";
  Root: _Cid;
  PieceCid: _Cid | null;
  PieceSize: number;
}

interface _Block {
  Miner: string;
  Parents: _Cid[];
  Height: number;
  ParentStateRoot: _Cid;
  ParentMessageReceipts: _Cid;
  Messages: _Cid;
}

interface _Ts {
  Cids: _Cid[];
  Height: number;
  Blocks: _Block[];
}

interface _Message {
  Version: _Cid;
  To: string;
  From: string;
  Nonce: number;
  Value: string;
  GasLimit: number;
  GasFeeCap: string;
  GasPremium: string;
  Method: number;
  Params: string;
}

interface _Message2 {
  Cid: _Cid;
  Message: _Message;
}

export class NodeApi {
  constructor(public rpc: Rpc) {}
  @call
  ChainGetMessagesInTipset(tsk: _Cid[]): Promise<_Message2[] | null> {
    throw new Error();
  }
  @call
  ChainGetTipSet(tsk: _Cid[]): Promise<_Ts> {
    throw new Error();
  }
  @call
  ChainHead(): Promise<_Ts> {
    throw new Error();
  }
  @call
  ClientImport(
    _: { Path: string; IsCAR: boolean },
  ): Promise<{ Root: _Cid; ImportID: number }> {
    throw new Error();
  }
  @call
  ClientListDeals(): Promise<any[]> {
    throw new Error();
  }
  @call
  ClientStartDeal(_: {
    Data: _DataRef;
    Wallet: string;
    Miner: string;
    EpochPrice: string;
    MinBlocksDuration: number;
    ProviderCollateral: string;
    DealStartEpoch: number;
    FastRetrieval: boolean;
    VerifiedDeal: boolean;
  }): Promise<_Cid> {
    throw new Error();
  }
  @call
  NetConnect(a: any): Promise<void> {
    throw new Error();
  }
  @call
  NetAddrsListen(): Promise<any> {
    throw new Error();
  }
  @call
  StateMinerInfo(actor: string, tsk: _Cid[]): Promise<any> {
    throw new Error();
  }
  @call
  Version(): Promise<any> {
    throw new Error();
  }
  @call
  WalletImport(key: any): Promise<string> {
    throw new Error();
  }
}

export class MinerApi {
  constructor(public rpc: Rpc) {}
  @call
  MarketListIncompleteDeals(): Promise<any[]> {
    throw new Error();
  }
  @call
  NetAddrsListen(): Promise<any> {
    throw new Error();
  }
  @call
  PledgeSector(): Promise<void> {
    throw new Error();
  }
  @call
  SectorsList(): Promise<number[]> {
    throw new Error();
  }
  @call
  SectorMarkForUpgrade(i: number, snap: boolean): Promise<any> {
    throw new Error();
  }
  @call
  SectorsStatus(i: number, _: boolean): Promise<any> {
    throw new Error();
  }
  @call
  Version(): Promise<any> {
    throw new Error();
  }
}
