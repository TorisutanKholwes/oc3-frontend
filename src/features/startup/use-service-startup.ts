import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import type { components } from "@/lib/api/schema";

export type ServiceStartup = components["schemas"]["ServiceStartup"];
export type StartupVertex = components["schemas"]["ServiceStartupVertex"];
export type StartupEdge = components["schemas"]["ServiceStartupEdge"];

/**
 * The startup graph of a service on one of its nodes, the first by name when
 * none is given. The previous drawing stays on screen while another node, or
 * the disabled resources, load.
 */
export function useServiceStartup(
  svcId: string | undefined,
  nodeId: string | undefined,
  showDisabled: boolean,
) {
  return useQuery({
    queryKey: ["service", svcId, "startup", nodeId ?? "", showDisabled],
    enabled: svcId !== undefined,
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/services/{svc_id}/startup", {
        signal,
        params: {
          path: { svc_id: svcId ?? "" },
          query: {
            ...(nodeId === undefined ? {} : { node_id: nodeId }),
            ...(showDisabled ? { show_disabled: true } : {}),
          },
        },
      });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}
