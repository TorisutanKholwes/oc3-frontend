import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { isEmptyStart, topologyQuery, type TopologyStart } from "./layers";

/**
 * The topology of the nodes, services and applications given, with the layers
 * asked for. Nothing is read for an empty start. The previous drawing stays on
 * screen while other layers load. A refusal of the collector, a selection too
 * large or an unknown layer, comes back as its message.
 */
export function useTopology(start: TopologyStart, layers: readonly string[]) {
  const query = topologyQuery(start, layers);
  return useQuery({
    queryKey: ["topology", query],
    enabled: !isEmptyStart(start) && query.display !== "",
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET("/topology", { signal, params: { query } });
      if (error !== undefined) throw new Error(problemText(error));
      return data;
    },
  });
}
