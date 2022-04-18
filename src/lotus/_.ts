import { __rel } from "../__rel.ts";

export const LOTUS = __rel(import.meta, "../../bin-lotus/lotus");

export function goLog(log: string) {
  return {
    GOLOG_FILE: log,
  };
}
