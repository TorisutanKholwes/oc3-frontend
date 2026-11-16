import { describe, expect, test } from "vitest";
import {
  DEFAULT_LAYERS,
  formatLayers,
  isEmptyStart,
  LAYER_GROUPS,
  parseAppIds,
  parseIds,
  parseLayers,
  parseTopologySearch,
  sameLayers,
  TOPOLOGY_LAYERS,
  topologyQuery,
} from "./layers";

describe("layers", () => {
  test("the groups of the picker hold every layer once", () => {
    const grouped = LAYER_GROUPS.flatMap((group) => group.layers);
    expect([...grouped].sort()).toEqual([...TOPOLOGY_LAYERS].sort());
  });

  test("defaults to the layers of the historical collector", () => {
    expect(parseLayers(undefined)).toEqual([...DEFAULT_LAYERS].sort(byCanonical));
    expect(parseLayers("")).toEqual(parseLayers(undefined));
    expect(parseLayers("unknown,,")).toEqual(parseLayers(undefined));
  });

  test("keeps the known layers, once, in the canonical order", () => {
    expect(parseLayers("countries, nodes,bogus,nodes,san")).toEqual(["nodes", "san", "countries"]);
    expect(formatLayers(["racks", "services", "racks"])).toBe("services,racks");
    expect(sameLayers(["racks", "nodes"], ["nodes", "racks"])).toBe(true);
    expect(sameLayers(["racks"], ["nodes", "racks"])).toBe(false);
  });
});

function byCanonical(a: string, b: string) {
  const order: readonly string[] = TOPOLOGY_LAYERS;
  return order.indexOf(a) - order.indexOf(b);
}

describe("ids", () => {
  test("splits, trims and dedupes", () => {
    expect(parseIds(" a, b,,a ,c")).toEqual(["a", "b", "c"]);
    expect(parseIds(undefined)).toEqual([]);
  });

  test("keeps the integer application ids only", () => {
    expect(parseAppIds("1, 2,x,3.5,2")).toEqual([1, 2]);
  });
});

describe("topologyQuery", () => {
  test("names what the topology starts from, empty lists left out", () => {
    expect(
      topologyQuery({ nodeIds: ["n1", "n2", "n1"], svcIds: [], appIds: [4] }, [
        "services",
        "nodes",
      ]),
    ).toEqual({ node_ids: "n1,n2", app_ids: "4", display: "nodes,services" });
  });

  test("an empty start is told apart", () => {
    expect(isEmptyStart({})).toBe(true);
    expect(isEmptyStart({ nodeIds: [], svcIds: [] })).toBe(true);
    expect(isEmptyStart({ svcIds: ["s"] })).toBe(false);
  });
});

describe("parseTopologySearch", () => {
  test("keeps the strings and the record looked at", () => {
    expect(
      parseTopologySearch({
        node_ids: "a,b",
        svc_ids: "",
        app_ids: 12,
        display: "nodes",
        peek: "node:a",
        peekat: "1",
        other: "x",
      }),
    ).toEqual({
      node_ids: "a,b",
      svc_ids: undefined,
      app_ids: "12",
      display: "nodes",
      peek: "node:a",
      peektab: undefined,
      peekat: 1,
    });
  });
});
