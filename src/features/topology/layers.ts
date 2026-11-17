/**
 * The layers of a topology, as `GET /topology` names them in its `display`
 * parameter, and what a drawing starts from.
 */
export const TOPOLOGY_LAYERS = [
  "nodes",
  "services",
  "apps",
  "envs",
  "resources",
  "disks",
  "arrays",
  "san",
  "hvs",
  "hvpools",
  "hvvdcs",
  "enclosures",
  "racks",
  "rooms",
  "buildings",
  "cities",
  "countries",
] as const;

export type TopologyLayer = (typeof TOPOLOGY_LAYERS)[number];

export type LayerGroupKey = "objects" | "storage" | "locations";

/**
 * The layers as the picker groups them: the objects and what they run, the
 * storage, then the locations from the closest to the node to the farthest.
 */
export const LAYER_GROUPS: readonly { key: LayerGroupKey; layers: readonly TopologyLayer[] }[] = [
  { key: "objects", layers: ["nodes", "services", "apps", "envs", "resources"] },
  { key: "storage", layers: ["disks", "arrays", "san"] },
  {
    key: "locations",
    layers: [
      "hvs",
      "hvpools",
      "hvvdcs",
      "enclosures",
      "racks",
      "rooms",
      "buildings",
      "cities",
      "countries",
    ],
  },
];

/** The layers the historical collector checked by default. */
export const DEFAULT_LAYERS: readonly TopologyLayer[] = [
  "nodes",
  "services",
  "countries",
  "cities",
  "buildings",
  "rooms",
  "racks",
  "enclosures",
  "hvs",
  "hvpools",
  "hvvdcs",
];

export function isTopologyLayer(value: string): value is TopologyLayer {
  return (TOPOLOGY_LAYERS as readonly string[]).includes(value);
}

/** The layers given, known ones only, once each, in the canonical order. */
export function normalizeLayers(layers: Iterable<string>): TopologyLayer[] {
  const set = new Set(layers);
  return TOPOLOGY_LAYERS.filter((layer) => set.has(layer));
}

/**
 * The layers of a `display` value, comma-separated: the defaults when it names
 * none the collector knows.
 */
export function parseLayers(value: string | undefined): TopologyLayer[] {
  const layers = normalizeLayers((value ?? "").split(",").map((part) => part.trim()));
  return layers.length === 0 ? normalizeLayers(DEFAULT_LAYERS) : layers;
}

/** The `display` value of layers, canonical: the same choice, the same cache key. */
export function formatLayers(layers: Iterable<string>): string {
  return normalizeLayers(layers).join(",");
}

/** Whether two choices of layers are the same, whatever their order. */
export function sameLayers(a: Iterable<string>, b: Iterable<string>): boolean {
  return formatLayers(a) === formatLayers(b);
}

/** The ids of a comma-separated list, trimmed, once each. */
export function parseIds(value: string | undefined): string[] {
  const ids = (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return [...new Set(ids)];
}

/** The ids of applications in a comma-separated list: integers only. */
export function parseAppIds(value: string | undefined): number[] {
  return parseIds(value)
    .filter((part) => /^\d+$/.test(part))
    .map(Number);
}

/** What a topology starts from: nodes, services and applications by id. */
export interface TopologyStart {
  nodeIds?: readonly string[];
  svcIds?: readonly string[];
  appIds?: readonly number[];
}

/** Whether a start names nothing, which the collector would draw empty. */
export function isEmptyStart(start: TopologyStart): boolean {
  return (
    (start.nodeIds?.length ?? 0) === 0 &&
    (start.svcIds?.length ?? 0) === 0 &&
    (start.appIds?.length ?? 0) === 0
  );
}

/** The query of `GET /topology`, without the empty lists. */
export interface TopologyQuery {
  node_ids?: string;
  svc_ids?: string;
  app_ids?: string;
  display: string;
}

export function topologyQuery(start: TopologyStart, layers: Iterable<string>): TopologyQuery {
  const query: TopologyQuery = { display: formatLayers(layers) };
  const join = (ids: readonly (string | number)[] | undefined) =>
    ids === undefined || ids.length === 0 ? undefined : [...new Set(ids)].join(",");
  const nodeIds = join(start.nodeIds);
  const svcIds = join(start.svcIds);
  const appIds = join(start.appIds);
  if (nodeIds !== undefined) query.node_ids = nodeIds;
  if (svcIds !== undefined) query.svc_ids = svcIds;
  if (appIds !== undefined) query.app_ids = appIds;
  return query;
}

/**
 * The search of the topology page: what it starts from and its layers, as
 * comma-separated lists, and the record opened over it (see `PeekPanel`).
 */
export interface TopologySearch {
  node_ids?: string;
  svc_ids?: string;
  app_ids?: string;
  display?: string;
  peek?: string;
  peektab?: string;
  peekat?: number;
}

export function parseTopologySearch(raw: Record<string, unknown>): TopologySearch {
  const text = (value: unknown) =>
    typeof value === "string" && value !== ""
      ? value
      : typeof value === "number"
        ? String(value)
        : undefined;
  const at = typeof raw.peekat === "number" ? raw.peekat : Number(raw.peekat);
  return {
    node_ids: text(raw.node_ids),
    svc_ids: text(raw.svc_ids),
    app_ids: text(raw.app_ids),
    display: text(raw.display),
    peek: text(raw.peek),
    peektab: text(raw.peektab),
    peekat: Number.isInteger(at) && at >= 0 ? at : undefined,
  };
}
