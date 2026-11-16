import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePeek } from "@/components/opensvc/use-peek";
import { buildGraph } from "./graph";
import {
  DEFAULT_LAYERS,
  formatLayers,
  isEmptyStart,
  normalizeLayers,
  sameLayers,
  type TopologyLayer,
  type TopologyStart,
} from "./layers";
import { LayerPicker } from "./LayerPicker";
import type { VertexTarget } from "./look";
import { Topology } from "./Topology";
import { useTopology } from "./use-topology";

/**
 * The topology of nodes, services or applications, as the historical collector
 * drew it: the layers to show, then the graph. A node, a service or an
 * application of the graph opens its record over the view, as any badge naming
 * one (`usePeek`).
 *
 * The layers are those the view holds when it gives `onLayersChange` (the page
 * keeps them in its URL), else they live here, the historical defaults first.
 */
export function TopologyView({
  start,
  layers: heldLayers,
  onLayersChange,
  wheel = "focus",
  frameClassName = "h-[60vh] min-h-80",
}: {
  start: TopologyStart;
  layers?: readonly TopologyLayer[];
  onLayersChange?: (layers: TopologyLayer[]) => void;
  /** Whether the wheel zooms at once, or once the drawing has the focus. */
  wheel?: "always" | "focus";
  /** Size of the drawing. */
  frameClassName?: string;
}) {
  const { t } = useTranslation();
  const [localLayers, setLocalLayers] = useState<TopologyLayer[]>([...DEFAULT_LAYERS]);
  const layers = heldLayers ?? localLayers;
  const setLayers = onLayersChange ?? setLocalLayers;
  // The boxes ticked, applied with Redraw; reset when the layers change elsewhere.
  const [draft, setDraft] = useState<TopologyLayer[]>([...layers]);
  const [applied, setApplied] = useState(formatLayers(layers));
  if (formatLayers(layers) !== applied) {
    setApplied(formatLayers(layers));
    setDraft([...layers]);
  }
  // Redrawn with the same layers, the graph is read again and laid out anew.
  const [generation, setGeneration] = useState(1);
  const topology = useTopology(start, layers);
  const graph = useMemo(
    () => (topology.data === undefined ? undefined : buildGraph(topology.data)),
    [topology.data],
  );
  const peek = usePeek();
  const onOpen = useCallback(
    (target: VertexTarget) => {
      peek(target.kind, target.id);
    },
    [peek],
  );

  function apply() {
    if (sameLayers(draft, layers)) {
      setGeneration((g) => g + 1);
      void topology.refetch();
      return;
    }
    setLayers(normalizeLayers(draft));
  }

  const body = (() => {
    if (isEmptyStart(start)) return <p className="text-ink-muted">{t("topology.noStart")}</p>;
    if (topology.isError)
      return (
        <p role="alert" className="text-state-down">
          ■ {t("topology.error", { message: topology.error.message })}
        </p>
      );
    if (graph === undefined) return <p className="text-ink-muted">{t("topology.loading")}</p>;
    if (graph.vertices.length === 0) return <p className="text-ink-muted">{t("topology.empty")}</p>;
    return (
      <>
        <Topology
          graph={graph}
          seed={generation}
          onOpen={onOpen}
          wheel={wheel}
          className={frameClassName}
        />
        <p className="mt-1 text-data text-ink-muted">
          {t(wheel === "focus" ? "topology.hintFocus" : "topology.hint")}
        </p>
      </>
    );
  })();

  return (
    <div className="space-y-3">
      <LayerPicker value={draft} onChange={setDraft} onApply={apply} busy={topology.isFetching} />
      <div aria-busy={topology.isFetching} className="relative">
        {topology.isFetching && graph !== undefined && (
          <p role="status" className="absolute top-2 left-2 z-10 text-data text-ink-muted">
            {t("topology.loading")}
          </p>
        )}
        {body}
      </div>
    </div>
  );
}
