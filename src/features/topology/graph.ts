import type { components } from "@/lib/api/schema";
import { TOPOLOGY_LAYERS } from "./layers";
import {
  edgeLook,
  vertexLook,
  vertexTarget,
  type EdgeLook,
  type TopologyEdge,
  type TopologyVertex,
  type VertexLook,
  type VertexTarget,
} from "./look";

type Topology = components["schemas"]["Topology"];

export interface GraphVertex {
  vertex: TopologyVertex;
  look: VertexLook;
  target?: VertexTarget;
}

export interface GraphEdge {
  source: number;
  target: number;
  edge: TopologyEdge;
  look: EdgeLook;
}

/** A topology ready to lay out and draw: the vertices by index, the edges by theirs. */
export interface Graph {
  vertices: GraphVertex[];
  edges: GraphEdge[];
}

/**
 * The graph of a topology. A vertex given twice is kept once; an edge naming a
 * vertex the topology lacks, or joining a vertex to itself, is left out.
 */
export function buildGraph(topology: Topology): Graph {
  const index = new Map<string, number>();
  const vertices: GraphVertex[] = [];
  for (const vertex of topology.vertices) {
    if (index.has(vertex.id)) continue;
    index.set(vertex.id, vertices.length);
    vertices.push({ vertex, look: vertexLook(vertex), target: vertexTarget(vertex) });
  }
  const edges: GraphEdge[] = [];
  for (const edge of topology.edges) {
    const source = index.get(edge.from);
    const target = index.get(edge.to);
    if (source === undefined || target === undefined || source === target) continue;
    edges.push({ source, target, edge, look: edgeLook(edge) });
  }
  return { vertices, edges };
}

/** How many vertices of each layer the graph has, in the order of the layers, none left out. */
export function layerCounts(graph: Graph): { layer: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { vertex } of graph.vertices)
    counts.set(vertex.layer, (counts.get(vertex.layer) ?? 0) + 1);
  const known: readonly string[] = TOPOLOGY_LAYERS;
  return [
    ...known.filter((layer) => counts.has(layer)),
    ...[...counts.keys()].filter((layer) => !known.includes(layer)),
  ].map((layer) => ({ layer, count: counts.get(layer) ?? 0 }));
}
