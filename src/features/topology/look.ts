import type { components } from "@/lib/api/schema";
import type { ObjectState } from "@/components/opensvc/StatusBadge";
import { statusBadge } from "@/components/opensvc/status";

export type TopologyVertex = components["schemas"]["TopologyVertex"];
export type TopologyEdge = components["schemas"]["TopologyEdge"];

/** The pictograms of the vertices, drawn by `Topology` from the app's icon set. */
export type VertexIcon =
  | "server"
  | "stack"
  | "asterisk"
  | "env"
  | "database"
  | "switch"
  | "cloud"
  | "location"
  | "network"
  | "folder"
  | "cube"
  | "gear"
  | "swap"
  | "pulse"
  | "link"
  | "power"
  | "clock"
  | "lock"
  | "hash";

/**
 * Tint of a vertex: the ink of its object family, or of the state of a service.
 * Written out in full: Tailwind does not see names built at runtime.
 */
const FAMILY_INK = {
  node: "text-icon-node",
  service: "text-icon-service",
  app: "text-icon-app",
  disk: "text-icon-disk",
  network: "text-icon-network",
} as const;

const STATE_INK: Record<ObjectState, string> = {
  up: "text-state-up",
  warn: "text-state-warn",
  down: "text-state-down",
  unknown: "text-state-unknown",
};

const STATE_STROKE: Record<ObjectState, string> = {
  up: "stroke-state-up",
  warn: "stroke-state-warn",
  down: "stroke-state-down",
  unknown: "stroke-state-unknown",
};

export interface VertexLook {
  icon: VertexIcon;
  /** Ink class of the pictogram and of the ring around it. */
  ink: string;
  /** Radius of the disc of the vertex, in pixels at scale 1. */
  radius: number;
  /** Weight in the layout: the heavy vertices push the others farther. */
  mass: number;
  /** The state of a service, shown by the shape of a mark as well as its tint. */
  state?: ObjectState;
}

/**
 * Sizes and masses by layer, those of the historical collector's vis.js groups
 * (icon sizes 50 to 110, masses 3 to 16) brought to the pixels of this drawing:
 * the applications, environments and countries gather many others, they are
 * drawn larger and weigh more.
 */
const LAYER_RADIUS: Record<string, number> = {
  nodes: 14,
  services: 15,
  apps: 26,
  envs: 26,
  resources: 12,
  disks: 13,
  arrays: 24,
  san: 14,
  hvs: 14,
  hvpools: 18,
  hvvdcs: 22,
  enclosures: 16,
  racks: 18,
  rooms: 20,
  buildings: 20,
  cities: 22,
  countries: 28,
};

const LAYER_MASS: Record<string, number> = {
  nodes: 3,
  services: 8,
  apps: 16,
  envs: 16,
  resources: 3,
  disks: 3,
  arrays: 4,
  san: 3,
  hvs: 2,
  hvpools: 3,
  hvvdcs: 4,
  enclosures: 5,
  racks: 6,
  rooms: 7,
  buildings: 8,
  cities: 9,
  countries: 10,
};

/** Pictograms of the resource type families, as the historical topology drew them. */
const RESOURCE_ICON: Record<string, VertexIcon> = {
  ip: "network",
  fs: "folder",
  disk: "database",
  volume: "database",
  container: "cube",
  app: "gear",
  sync: "swap",
  hb: "pulse",
  share: "link",
  stonith: "power",
  task: "clock",
  certificate: "lock",
};

/** The icon of a resource type family, such as `container.docker` or `disk.scsireserv`. */
export function resourceIcon(kind: string): VertexIcon {
  const [family] = kind.split(".");
  if (kind === "disk.scsireserv") return "lock";
  return RESOURCE_ICON[family ?? ""] ?? "hash";
}

/** The state of a collector availability, as the status badges show it. */
export function stateOf(status: string | undefined): ObjectState {
  return statusBadge(status).state;
}

/** Pictogram, tint, size and weight of a vertex, by its layer and kind. */
export function vertexLook(vertex: TopologyVertex): VertexLook {
  const radius = LAYER_RADIUS[vertex.layer] ?? 14;
  const mass = LAYER_MASS[vertex.layer] ?? 3;
  const look = (icon: VertexIcon, ink: string): VertexLook => ({ icon, ink, radius, mass });
  switch (vertex.layer) {
    case "nodes":
      return look("server", FAMILY_INK.node);
    case "services": {
      const state = stateOf(vertex.status);
      return { ...look("stack", STATE_INK[state]), state };
    }
    case "apps":
      return look("asterisk", FAMILY_INK.app);
    case "envs":
      return look("env", FAMILY_INK.node);
    case "resources":
      return look(resourceIcon(vertex.kind), FAMILY_INK.service);
    case "disks":
    case "arrays":
      return look("database", FAMILY_INK.disk);
    case "san":
      return look("switch", FAMILY_INK.network);
    case "hvs":
    case "hvpools":
    case "hvvdcs":
      return look("cloud", FAMILY_INK.node);
    default:
      return look("location", FAMILY_INK.node);
  }
}

export interface EdgeLook {
  /** Stroke class: the state of the instance or resource, neutral without one. */
  stroke: string;
  /** Dashes telling the states apart without colour: none for up and warn. */
  dash?: string;
  state?: ObjectState;
}

/** Stroke of an edge: the tint and dashes of its state, neutral when it has none. */
export function edgeLook(edge: TopologyEdge): EdgeLook {
  if (edge.status === undefined || edge.status === "") return { stroke: "stroke-line-strong" };
  const state = stateOf(edge.status);
  const dash = state === "down" ? "6 4" : state === "unknown" ? "2 3" : undefined;
  return { stroke: STATE_STROKE[state], dash, state };
}

/** The record a vertex opens: its node, its service, or its application code. */
export interface VertexTarget {
  kind: "node" | "service" | "app";
  id: string;
}

/**
 * What a click on a vertex opens, as the historical topology: the node of a vertex
 * that names one, else its service; an application by its code.
 */
export function vertexTarget(vertex: TopologyVertex): VertexTarget | undefined {
  if (vertex.layer === "apps") return { kind: "app", id: vertex.label };
  if (vertex.node_id !== undefined && vertex.node_id !== "")
    return { kind: "node", id: vertex.node_id };
  if (vertex.svc_id !== undefined && vertex.svc_id !== "")
    return { kind: "service", id: vertex.svc_id };
  return undefined;
}

/** The tooltip of a vertex: its name, then its detail and its state. */
export function vertexTitle(vertex: TopologyVertex): string {
  return [vertex.label, vertex.detail, vertex.status].filter((part) => part).join("\n");
}
