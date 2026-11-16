import type { components } from "@/lib/api/schema";
import { ipv4Value } from "./ipv4";

type NetworkRow = components["schemas"]["NetworkRow"];

/** What is wrong with a segment range, by field: the key of its message. */
export interface RangeProblem {
  field: "begin" | "end";
  key: "invalid" | "outside" | "before";
}

/**
 * What is wrong with the range typed for a segment of `network`, checked as the
 * server does; null when valid, or not typed yet. The server alone knows the other
 * segments of the network and refuses an overlap.
 */
export function rangeProblem(
  network: Pick<NetworkRow, "begin" | "end"> | undefined,
  begin: string,
  end: string,
): RangeProblem | null {
  const low = ipv4Value(network?.begin ?? "");
  const high = ipv4Value(network?.end ?? "");
  const first = ipv4Value(begin);
  const last = ipv4Value(end);
  if (begin.trim() !== "") {
    if (first === null) return { field: "begin", key: "invalid" };
    if (low !== null && high !== null && (first < low || first > high))
      return { field: "begin", key: "outside" };
  }
  if (end.trim() !== "") {
    if (last === null) return { field: "end", key: "invalid" };
    if (low !== null && high !== null && (last < low || last > high))
      return { field: "end", key: "outside" };
  }
  if (first !== null && last !== null && last < first) return { field: "end", key: "before" };
  return null;
}

/** The number of addresses of a valid range, null when it is not one. */
export function rangeSize(begin: string, end: string): number | null {
  const first = ipv4Value(begin);
  const last = ipv4Value(end);
  return first !== null && last !== null && last >= first ? last - first + 1 : null;
}
