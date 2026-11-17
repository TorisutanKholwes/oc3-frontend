import { useQuery } from "@tanstack/react-query";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";

export type SecurePatternRow = components["schemas"]["SysreportSecurePatternRow"];
export type AuthorizationRow = components["schemas"]["SysreportAuthorizationRow"];

/** The query keys of the two lists, invalidated by their writes. */
export const SECURE_PATTERNS_KEY = ["sysreport", "secure-patterns"] as const;
export const AUTHORIZATIONS_KEY = ["sysreport", "authorizations"] as const;

/** The secure patterns, by pattern. */
export function useSecurePatterns() {
  return useQuery({
    queryKey: SECURE_PATTERNS_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET("/sysreport/secure_patterns", {
        params: { query: { props: "id,pattern", orderby: "pattern", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: SecurePatternRow[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });
}

/** The authorizations, by group, filterset and pattern. */
export function useAuthorizations() {
  return useQuery({
    queryKey: AUTHORIZATIONS_KEY,
    queryFn: async () => {
      const { data, error } = await api.GET("/sysreport/authorizations", {
        params: {
          query: {
            props: "id,group_id,group_name,fset_id,fset_name,pattern",
            orderby: "group_name,fset_name,pattern",
            limit: 0,
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: AuthorizationRow[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });
}

export interface Choice {
  id: number;
  name: string;
}

interface GroupRow {
  id?: number;
  role?: string;
  privilege?: string;
}

/**
 * The teams an authorization may name: the organizational ones, as the historical
 * collector offered, without Everybody nor the private teams of the users.
 */
export function organizationalTeams(rows: GroupRow[]): Choice[] {
  return rows.flatMap((row): Choice[] =>
    typeof row.id === "number" &&
    typeof row.role === "string" &&
    row.privilege !== "T" &&
    row.role !== "Everybody" &&
    !row.role.startsWith("user_")
      ? [{ id: row.id, name: row.role }]
      : [],
  );
}

export function useAuthorizationTeams() {
  return useQuery({
    queryKey: ["groups", "organizational"],
    queryFn: async () => {
      const { data, error } = await api.GET("/groups", {
        params: { query: { props: "id,role,privilege", orderby: "role", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return organizationalTeams(Array.isArray(data.data) ? data.data : []);
    },
  });
}

export function useAuthorizationFiltersets() {
  return useQuery({
    queryKey: ["filtersets", "id-name"],
    queryFn: async () => {
      const { data, error } = await api.GET("/filtersets", {
        params: { query: { props: "id,fset_name", orderby: "fset_name", limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows = Array.isArray(data.data) ? data.data : [];
      return rows.flatMap((row): Choice[] =>
        typeof row.id === "number" && typeof row.fset_name === "string"
          ? [{ id: row.id, name: row.fset_name }]
          : [],
      );
    },
  });
}

/** The name of a group or filterset, its id when it does not exist any more. */
export function nameOrId(name: string | undefined, id: number | undefined): string {
  return name !== undefined && name !== "" ? name : `#${String(id ?? "")}`;
}

export async function createSecurePattern(pattern: string): Promise<void> {
  const { error } = await api.POST("/sysreport/secure_patterns", { body: { pattern } });
  if (error !== undefined) throw new Error(problemText(error));
}

export async function deleteSecurePattern(id: number): Promise<void> {
  const { error } = await api.DELETE("/sysreport/secure_patterns/{id}", {
    params: { path: { id } },
  });
  if (error !== undefined) throw new Error(problemText(error));
}

export async function createAuthorization(
  groupId: number,
  fsetId: number,
  pattern: string,
): Promise<void> {
  const { error } = await api.POST("/sysreport/authorizations", {
    body: { group_id: groupId, fset_id: fsetId, pattern },
  });
  if (error !== undefined) throw new Error(problemText(error));
}

export async function deleteAuthorization(id: number): Promise<void> {
  const { error } = await api.DELETE("/sysreport/authorizations/{id}", {
    params: { path: { id } },
  });
  if (error !== undefined) throw new Error(problemText(error));
}
