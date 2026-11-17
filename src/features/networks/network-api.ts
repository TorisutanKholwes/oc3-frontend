import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { components, operations } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { useMyGroupRoles } from "@/features/requests/request-steps";
import type { NetworkUser } from "./network-access";

export type NetworkRow = components["schemas"]["NetworkRow"];
export type SegmentRow = components["schemas"]["NetworkSegmentRow"];
export type ResponsibleRow = components["schemas"]["NetworkSegmentResponsibleRow"];
export type NetworkIpRow = components["schemas"]["NetworkIpRow"];

/** The properties of a network its detail changes, those left out kept. */
export type NetworkChanges =
  operations["PostNetwork"]["requestBody"]["content"]["application/json"];

const rows = <T>(data: { data?: unknown }): T[] =>
  Array.isArray(data.data) ? (data.data as T[]) : [];

/** A declared network, for its detail panel. */
export function useNetwork(netId: string | undefined) {
  return useQuery({
    queryKey: ["network", netId],
    enabled: netId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/networks/{net_id}", {
        params: { path: { net_id: netId ?? "" } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return rows<NetworkRow>(data)[0] ?? null;
    },
  });
}

/** The segments of a network, by first address. */
export function useSegments(netId: string | undefined) {
  return useQuery({
    queryKey: ["network", netId, "segments"],
    enabled: netId !== undefined,
    queryFn: async () => {
      const { data, error } = await api.GET("/networks/{net_id}/segments", {
        params: { path: { net_id: netId ?? "" }, query: { limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return rows<SegmentRow>(data);
    },
  });
}

/** The groups responsible for a segment, by role. */
export function useResponsibles(netId: string, segId: string) {
  return useQuery({
    queryKey: ["network", netId, "segments", segId, "responsibles"],
    queryFn: async () => {
      const { data, error } = await api.GET("/networks/{net_id}/segments/{seg_id}/responsibles", {
        params: { path: { net_id: netId, seg_id: segId }, query: { limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return rows<ResponsibleRow>(data).sort((a, b) => (a.role ?? "").localeCompare(b.role ?? ""));
    },
  });
}

/** Why the addresses of a network cannot be listed, by the status of the refusal. */
export type IpsRefusal = "forbidden" | "tooMany" | "other";

/** An error of the addresses view, with the reason the status gives. */
export class IpsError extends Error {
  constructor(
    message: string,
    readonly reason: IpsRefusal,
  ) {
    super(message);
  }
}

/** The reason of a refusal of `/networks/{net_id}/ips`, from its status. */
export function ipsRefusal(status: number): IpsRefusal {
  if (status === 403) return "forbidden";
  if (status === 400) return "tooMany";
  return "other";
}

export interface IpsPage {
  rows: NetworkIpRow[];
  /** Addresses matching, all pages together. */
  count: number;
}

/**
 * A page of the addresses of a network the user may allocate: those of the
 * segments their groups are responsible for, or of the whole network without
 * segment; `free` keeps those no node reports.
 */
export function useNetworkIps(netId: string, free: boolean, offset: number, limit: number) {
  return useQuery({
    queryKey: ["network", netId, "ips", free, offset, limit],
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async (): Promise<IpsPage> => {
      const { data, error, response } = await api.GET("/networks/{net_id}/ips", {
        params: { path: { net_id: netId }, query: { free, offset, limit } },
      });
      if (error !== undefined) throw new IpsError(problemText(error), ipsRefusal(response.status));
      const all = Array.isArray(data.data) ? data.data : [];
      return { rows: all, count: data.meta?.count ?? all.length };
    },
  });
}

/** Changes properties of a network; the others are kept. */
export async function saveNetwork(netId: string, changes: NetworkChanges) {
  const { error } = await api.POST("/networks/{net_id}", {
    params: { path: { net_id: netId } },
    body: changes,
  });
  if (error !== undefined) throw new Error(problemText(error));
}

/** Deletes a network, its segments and their responsibles with it. */
export async function deleteNetwork(netId: string) {
  const { error } = await api.DELETE("/networks/{net_id}", {
    params: { path: { net_id: netId } },
  });
  if (error !== undefined) throw new Error(problemText(error));
}

/** Changes the type or the range of a segment. */
export async function saveSegment(
  netId: string,
  segId: string,
  changes: Pick<SegmentRow, "seg_type" | "seg_begin" | "seg_end">,
) {
  const { error } = await api.POST("/networks/{net_id}/segments/{seg_id}", {
    params: { path: { net_id: netId, seg_id: segId } },
    body: changes,
  });
  if (error !== undefined) throw new Error(problemText(error));
}

/** Deletes a segment. */
export function deleteSegment(netId: string, segId: string) {
  return api.DELETE("/networks/{net_id}/segments/{seg_id}", {
    params: { path: { net_id: netId, seg_id: segId } },
  });
}

/** Makes a group responsible for a segment, or no longer. */
export function changeResponsible(netId: string, segId: string, group: string, add: boolean) {
  const params = { params: { path: { net_id: netId, seg_id: segId, group_id: group } } };
  return add
    ? api.POST("/networks/{net_id}/segments/{seg_id}/responsibles/{group_id}", params)
    : api.DELETE("/networks/{net_id}/segments/{seg_id}/responsibles/{group_id}", params);
}

/**
 * The privileges and the groups of the user the requests are made as, for
 * `network-access`; undefined until both are read.
 */
export function useNetworkUser(): NetworkUser | undefined {
  const privileges = useEffectivePrivileges();
  const groups = useMyGroupRoles();
  if (privileges.data === undefined || groups.data === undefined) return undefined;
  return { privileges: privileges.data, groups: groups.data };
}
