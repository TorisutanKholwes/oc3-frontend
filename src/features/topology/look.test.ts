import { describe, expect, test } from "vitest";
import { buildGraph, layerCounts } from "./graph";
import {
  edgeLook,
  resourceIcon,
  vertexLook,
  vertexTarget,
  vertexTitle,
  type TopologyVertex,
} from "./look";

describe("vertexLook", () => {
  test("tints a service by its state, with the shape of the status badges", () => {
    const look = (status?: string) =>
      vertexLook({ id: "svc:1", kind: "service", layer: "services", label: "s", status });
    expect(look("up")).toMatchObject({ icon: "stack", ink: "text-state-up", state: "up" });
    expect(look("stdby up").state).toBe("up");
    expect(look("stdby down").ink).toBe("text-state-down");
    expect(look("warn").state).toBe("warn");
    expect(look("undef").state).toBe("unknown");
    expect(look("n/a").state).toBe("unknown");
    expect(look(undefined).state).toBe("unknown");
  });

  test("draws the gathering layers larger and heavier, as the historical collector", () => {
    const node = vertexLook({ id: "node:1", kind: "node", layer: "nodes", label: "n" });
    for (const layer of ["apps", "envs", "countries"] as const) {
      const look = vertexLook({ id: layer, kind: layer, layer, label: layer });
      expect(look.radius).toBeGreaterThan(node.radius);
      expect(look.mass).toBeGreaterThan(node.mass);
    }
    expect(node).toEqual({ icon: "server", ink: "text-icon-node", radius: 14, mass: 3 });
  });

  test("gives the locations, hypervisors, storage and SAN their own pictograms", () => {
    const icon = (layer: TopologyVertex["layer"], kind: string = layer) =>
      vertexLook({ id: layer, kind, layer, label: layer }).icon;
    expect(icon("racks")).toBe("location");
    expect(icon("hvpools")).toBe("cloud");
    expect(icon("arrays", "array")).toBe("database");
    expect(icon("san", "sansw")).toBe("switch");
    expect(icon("resources", "container.docker")).toBe("cube");
    expect(icon("resources", "disk")).toBe("database");
  });

  test("picks a resource pictogram by type family", () => {
    expect(resourceIcon("ip")).toBe("network");
    expect(resourceIcon("fs.flag")).toBe("folder");
    expect(resourceIcon("disk.scsireserv")).toBe("lock");
    expect(resourceIcon("whatever")).toBe("hash");
  });
});

describe("edgeLook", () => {
  test("is neutral without a status", () => {
    expect(edgeLook({ from: "a", to: "b" })).toEqual({ stroke: "stroke-line-strong" });
  });

  test("tints and dashes by state", () => {
    expect(edgeLook({ from: "a", to: "b", status: "up" })).toMatchObject({
      stroke: "stroke-state-up",
      dash: undefined,
    });
    expect(edgeLook({ from: "a", to: "b", status: "down" })).toMatchObject({
      stroke: "stroke-state-down",
      dash: "6 4",
    });
    expect(edgeLook({ from: "a", to: "b", status: "undef" }).dash).toBe("2 3");
  });
});

describe("vertexTarget", () => {
  test("opens the node, else the service, an application by its code", () => {
    expect(
      vertexTarget({ id: "node:n1", kind: "node", layer: "nodes", label: "n", node_id: "n1" }),
    ).toEqual({ kind: "node", id: "n1" });
    expect(
      vertexTarget({ id: "svc:s1", kind: "service", layer: "services", label: "s", svc_id: "s1" }),
    ).toEqual({ kind: "service", id: "s1" });
    expect(vertexTarget({ id: "app:x", kind: "app", layer: "apps", label: "APPX" })).toEqual({
      kind: "app",
      id: "APPX",
    });
    expect(vertexTarget({ id: "loc:racks:r1", kind: "racks", layer: "racks", label: "r1" })).toBe(
      undefined,
    );
  });

  test("titles a vertex with its detail and state", () => {
    expect(
      vertexTitle({ id: "n", kind: "node", layer: "nodes", label: "n1", detail: "Linux" }),
    ).toBe("n1\nLinux");
  });
});

describe("buildGraph", () => {
  test("indexes the vertices and drops the edges to nowhere", () => {
    const graph = buildGraph({
      vertices: [
        { id: "a", kind: "node", layer: "nodes", label: "a" },
        { id: "b", kind: "service", layer: "services", label: "b", status: "up" },
        { id: "a", kind: "node", layer: "nodes", label: "a again" },
        { id: "c", kind: "racks", layer: "racks", label: "c" },
      ],
      edges: [
        { from: "a", to: "b", status: "up" },
        { from: "a", to: "missing" },
        { from: "c", to: "c" },
        { from: "a", to: "c", label: "2" },
      ],
    });
    expect(graph.vertices.map((v) => v.vertex.label)).toEqual(["a", "b", "c"]);
    expect(graph.edges.map((e) => [e.source, e.target])).toEqual([
      [0, 1],
      [0, 2],
    ]);
    expect(layerCounts(graph)).toEqual([
      { layer: "nodes", count: 1 },
      { layer: "services", count: 1 },
      { layer: "racks", count: 1 },
    ]);
  });
});
