import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { ObjectState } from "@/components/opensvc/StatusBadge";
import {
  AsteriskIcon,
  ClockIcon,
  CloudIcon,
  CubeIcon,
  DatabaseIcon,
  EnvIcon,
  FitIcon,
  FolderIcon,
  GearIcon,
  HashIcon,
  LinkIcon,
  LocationIcon,
  LockIcon,
  MinusIcon,
  NetworkIcon,
  PlusIcon,
  PowerIcon,
  PulseIcon,
  ServerIcon,
  StackIcon,
  SwapIcon,
  SwitchIcon,
} from "@/components/ui/icons";
import { layerCounts, type Graph } from "./graph";
import {
  bounds,
  createSimulation,
  fitTransform,
  pin,
  reheat,
  run,
  unpin,
  zoomAt,
  type Simulation,
  type ViewTransform,
} from "./layout";
import { vertexTitle, type VertexIcon, type VertexTarget } from "./look";

const ICONS: Record<VertexIcon, typeof ServerIcon> = {
  server: ServerIcon,
  stack: StackIcon,
  asterisk: AsteriskIcon,
  env: EnvIcon,
  database: DatabaseIcon,
  switch: SwitchIcon,
  cloud: CloudIcon,
  location: LocationIcon,
  network: NetworkIcon,
  folder: FolderIcon,
  cube: CubeIcon,
  gear: GearIcon,
  swap: SwapIcon,
  pulse: PulseIcon,
  link: LinkIcon,
  power: PowerIcon,
  clock: ClockIcon,
  lock: LockIcon,
  hash: HashIcon,
};

const STATE_FILL: Record<ObjectState, string> = {
  up: "fill-state-up",
  warn: "fill-state-warn",
  down: "fill-state-down",
  unknown: "fill-surface-raised stroke-state-unknown",
};

/**
 * The shape of a state beside a service, as the status badges draw it (● ▲ ■ ○):
 * told apart without colour.
 */
function StateMark({ state, x, y }: { state: ObjectState; x: number; y: number }) {
  const s = 4.5;
  const className = `${STATE_FILL[state]} stroke-surface-raised`;
  switch (state) {
    case "warn":
      return (
        <path
          d={`M${x} ${y - s * 1.1}L${x + s * 1.1} ${y + s * 0.9}H${x - s * 1.1}Z`}
          className={className}
          strokeWidth={1.5}
        />
      );
    case "down":
      return (
        <rect
          x={x - s}
          y={y - s}
          width={2 * s}
          height={2 * s}
          className={className}
          strokeWidth={1.5}
        />
      );
    case "unknown":
      return <circle cx={x} cy={y} r={s} className={STATE_FILL.unknown} strokeWidth={1.8} />;
    default:
      return <circle cx={x} cy={y} r={s} className={className} strokeWidth={1.5} />;
  }
}

/** Below this zoom, the labels are hidden: unreadable, and costly to paint. */
const LABEL_ZOOM = 0.35;
/** Room around the drawing when it is fitted, for the labels under the vertices. */
const FIT_MARGIN = 28;
/** Time given to the layout in a frame, in milliseconds. */
const FRAME_BUDGET = 12;
/** A pointer moving less than this, in pixels, clicks rather than drags. */
const CLICK_SLOP = 4;

type Gesture =
  | {
      kind: "pan";
      pointerId: number;
      startX: number;
      startY: number;
      view: ViewTransform;
    }
  | {
      kind: "drag";
      pointerId: number;
      index: number;
      startX: number;
      startY: number;
      moved: boolean;
    };

/**
 * A topology drawn as a graph in SVG: its vertices laid out by forces
 * (`layout.ts`), moved as the layout settles. React draws the vertices and
 * edges once per graph; the positions are then written into the DOM at each
 * frame, the tree left alone.
 *
 * The background drags to pan, the wheel zooms (once the drawing has the
 * focus, or with Ctrl, when `wheel` is "focus", so that the page around still
 * scrolls), a vertex drags to move it, held in place while dragged. A click on
 * a node, a service or an application, or Enter on it, opens its record
 * (`onOpen`).
 */
export const Topology = memo(function Topology({
  graph,
  onOpen,
  seed = 1,
  wheel = "always",
  className,
}: {
  graph: Graph;
  onOpen?: (target: VertexTarget) => void;
  /** Seed of the first positions: another one, another arrangement. */
  seed?: number;
  wheel?: "always" | "focus";
  /** Size of the frame: the drawing fills it. */
  className?: string;
}) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const viewportRef = useRef<SVGGElement>(null);
  const vertexRefs = useRef<(SVGGElement | null)[]>([]);
  const edgeRefs = useRef<(SVGLineElement | null)[]>([]);
  const edgeLabelRefs = useRef<(SVGTextElement | null)[]>([]);
  const simRef = useRef<Simulation | null>(null);
  const viewRef = useRef<ViewTransform>({ x: 0, y: 0, k: 1 });
  // Once the user pans or zooms, the view is theirs: the layout no longer refits it.
  const userViewRef = useRef(false);
  const frameRef = useRef<number | null>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const onOpenRef = useRef(onOpen);
  useLayoutEffect(() => {
    onOpenRef.current = onOpen;
  }, [onOpen]);

  /** Writes the positions of the layout into the DOM. */
  const paint = useCallback(() => {
    const sim = simRef.current;
    if (sim === null) return;
    sim.bodies.forEach((body, i) => {
      vertexRefs.current[i]?.setAttribute("transform", `translate(${body.x},${body.y})`);
    });
    graph.edges.forEach((edge, k) => {
      const a = sim.bodies[edge.source];
      const b = sim.bodies[edge.target];
      if (a === undefined || b === undefined) return;
      const line = edgeRefs.current[k];
      if (line !== null && line !== undefined) {
        line.setAttribute("x1", String(a.x));
        line.setAttribute("y1", String(a.y));
        line.setAttribute("x2", String(b.x));
        line.setAttribute("y2", String(b.y));
      }
      const label = edgeLabelRefs.current[k];
      if (label !== null && label !== undefined) {
        label.setAttribute("x", String((a.x + b.x) / 2));
        label.setAttribute("y", String((a.y + b.y) / 2));
      }
    });
  }, [graph]);

  const applyView = useCallback(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const { x, y, k } = viewRef.current;
    viewport.setAttribute("transform", `translate(${x},${y}) scale(${k})`);
    if (k < LABEL_ZOOM) viewport.setAttribute("data-far", "");
    else viewport.removeAttribute("data-far");
  }, []);

  const fit = useCallback(() => {
    const svg = svgRef.current;
    const sim = simRef.current;
    if (svg === null || sim === null) return;
    const width = svg.clientWidth || 600;
    const height = svg.clientHeight || 400;
    viewRef.current = fitTransform(bounds(sim, FIT_MARGIN), width, height);
    applyView();
  }, [applyView]);

  const frame = useCallback(() => {
    frameRef.current = null;
    const sim = simRef.current;
    if (sim === null) return;
    run(sim, Infinity, FRAME_BUDGET);
    paint();
    if (!userViewRef.current) fit();
    if (!sim.settled) frameRef.current = requestAnimationFrame(frame);
  }, [fit, paint]);

  const animate = useCallback(() => {
    if (frameRef.current === null) frameRef.current = requestAnimationFrame(frame);
  }, [frame]);

  // A new graph, a new layout: a few steps before the first paint, so that it
  // does not show piled up at the origin, then the rest frame by frame.
  useLayoutEffect(() => {
    const sim = createSimulation(
      graph.vertices.map(({ look }) => look),
      graph.edges,
      {},
      seed,
    );
    simRef.current = sim;
    userViewRef.current = false;
    run(sim, 30, FRAME_BUDGET);
    paint();
    fit();
    animate();
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
      simRef.current = null;
    };
  }, [graph, seed, paint, fit, animate]);

  // Fitted again as its frame changes size, unless the user placed the view.
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!userViewRef.current) fit();
    });
    observer.observe(svg);
    return () => {
      observer.disconnect();
    };
  }, [fit]);

  /** Zooms by a factor around a point of the frame, its centre by default. */
  const zoomBy = useCallback(
    (factor: number, px?: number, py?: number) => {
      const svg = svgRef.current;
      if (svg === null) return;
      userViewRef.current = true;
      viewRef.current = zoomAt(
        viewRef.current,
        factor,
        px ?? svg.clientWidth / 2,
        py ?? svg.clientHeight / 2,
      );
      applyView();
    },
    [applyView],
  );

  // The wheel listener is not passive, to keep the page from scrolling as it zooms;
  // React's is.
  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) return;
    const onWheel = (event: WheelEvent) => {
      const focused = svg.contains(document.activeElement);
      if (wheel === "focus" && !focused && !event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      const rect = svg.getBoundingClientRect();
      zoomBy(
        Math.exp(-event.deltaY * unit * 0.0015),
        event.clientX - rect.left,
        event.clientY - rect.top,
      );
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      svg.removeEventListener("wheel", onWheel);
    };
  }, [wheel, zoomBy]);

  /** The point of the drawing under a point of the screen. */
  function toGraph(clientX: number, clientY: number): [number, number] {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    const { x, y, k } = viewRef.current;
    return [(clientX - (rect?.left ?? 0) - x) / k, (clientY - (rect?.top ?? 0) - y) / k];
  }

  function vertexIndexOf(target: EventTarget | null): number | undefined {
    if (!(target instanceof Element)) return undefined;
    const element = target.closest("[data-vertex]");
    const index = element?.getAttribute("data-vertex");
    return index === null || index === undefined ? undefined : Number(index);
  }

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || gestureRef.current !== null) return;
    const svg = svgRef.current;
    if (svg === null) return;
    const index = vertexIndexOf(event.target);
    // The drawing takes the focus, and with it the wheel.
    if (index === undefined) svg.focus({ preventScroll: true });
    svg.setPointerCapture(event.pointerId);
    gestureRef.current =
      index === undefined
        ? {
            kind: "pan",
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            view: viewRef.current,
          }
        : {
            kind: "drag",
            pointerId: event.pointerId,
            index,
            startX: event.clientX,
            startY: event.clientY,
            moved: false,
          };
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === "pan") {
      userViewRef.current = true;
      viewRef.current = {
        ...gesture.view,
        x: gesture.view.x + event.clientX - gesture.startX,
        y: gesture.view.y + event.clientY - gesture.startY,
      };
      applyView();
      return;
    }
    const sim = simRef.current;
    if (sim === null) return;
    if (
      !gesture.moved &&
      Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) < CLICK_SLOP
    )
      return;
    gesture.moved = true;
    // Moved by hand, the drawing stays where the user put it.
    userViewRef.current = true;
    const body = sim.bodies[gesture.index];
    if (body === undefined) return;
    const [gx, gy] = toGraph(event.clientX, event.clientY);
    pin(body, gx, gy);
    reheat(sim);
    paint();
    animate();
  }

  function endGesture(event: PointerEvent<SVGSVGElement>, cancelled: boolean) {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    svgRef.current?.releasePointerCapture(event.pointerId);
    if (gesture.kind !== "drag") return;
    const sim = simRef.current;
    const body = sim?.bodies[gesture.index];
    if (body !== undefined) unpin(body);
    if (gesture.moved || cancelled) {
      if (sim !== null) reheat(sim, 0.1);
      animate();
      return;
    }
    const target = graph.vertices[gesture.index]?.target;
    if (target !== undefined) onOpenRef.current?.(target);
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key === "Enter" || event.key === " ") {
      const index = vertexIndexOf(event.target);
      const target = index === undefined ? undefined : graph.vertices[index]?.target;
      if (target === undefined) return;
      event.preventDefault();
      onOpenRef.current?.(target);
      return;
    }
    if (event.target !== svgRef.current) return;
    if (event.key === "+" || event.key === "=") zoomBy(1.25);
    else if (event.key === "-") zoomBy(0.8);
    else if (event.key === "0") {
      userViewRef.current = false;
      fit();
    } else return;
    event.preventDefault();
  }

  // Drawn once per graph: the positions are written by `paint`.
  const edges = useMemo(
    () =>
      graph.edges.map(({ look }, k) => (
        <line
          key={k}
          ref={(el) => {
            edgeRefs.current[k] = el;
          }}
          className={look.stroke}
          strokeWidth={1.5}
          strokeDasharray={look.dash}
          vectorEffect="non-scaling-stroke"
        />
      )),
    [graph],
  );
  const edgeLabels = useMemo(
    () =>
      graph.edges.map(({ edge }, k) =>
        edge.label === undefined || edge.label === "" ? null : (
          <text
            key={k}
            ref={(el) => {
              edgeLabelRefs.current[k] = el;
            }}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-ink-muted stroke-surface-raised stroke-[3px] text-[10px] [paint-order:stroke] group-data-[far]:hidden"
          >
            {edge.label}
          </text>
        ),
      ),
    [graph],
  );
  const vertices = useMemo(
    () =>
      graph.vertices.map(({ vertex, look, target }, i) => {
        const Icon = ICONS[look.icon];
        const size = look.radius * 1.2;
        const title = vertexTitle(vertex);
        return (
          <g
            key={vertex.id}
            data-vertex={i}
            ref={(el) => {
              vertexRefs.current[i] = el;
            }}
            tabIndex={target === undefined ? undefined : 0}
            role={target === undefined ? undefined : "button"}
            aria-label={target === undefined ? undefined : title.replaceAll("\n", ", ")}
            className={`${target === undefined ? "cursor-grab" : "cursor-pointer"} outline-none [&:focus-visible>circle]:stroke-(--focus-ring) [&:focus-visible>circle]:stroke-[3px]`}
          >
            <title>{title}</title>
            <circle
              r={look.radius}
              className={`fill-surface-raised stroke-current ${look.ink}`}
              strokeWidth={1.5}
            />
            <Icon x={-size / 2} y={-size / 2} width={size} height={size} className={look.ink} />
            {look.state !== undefined && (
              <StateMark state={look.state} x={look.radius * 0.75} y={-look.radius * 0.75} />
            )}
            <text
              y={look.radius + 11}
              textAnchor="middle"
              className="pointer-events-none fill-ink stroke-surface-raised stroke-[3px] text-[11px] [paint-order:stroke] group-data-[far]:hidden"
            >
              {vertex.label}
            </text>
          </g>
        );
      }),
    [graph],
  );

  const summary = t("topology.summary", {
    vertices: graph.vertices.length,
    edges: graph.edges.length,
    layers: layerCounts(graph)
      .map(({ layer, count }) => `${t(`topology.layers.${layer}`, layer)} ${count}`)
      .join(", "),
  });

  const button =
    "flex h-7 w-7 items-center justify-center rounded-(--radius-control) border border-line bg-surface-raised text-ink-muted hover:text-ink";

  return (
    <div
      className={`relative overflow-hidden rounded-(--radius-control) border border-line bg-surface-raised ${className ?? ""}`}
    >
      <svg
        ref={svgRef}
        // Not role="img": its nodes, services and applications are buttons.
        role="group"
        aria-roledescription={t("topology.roleDescription")}
        aria-label={summary}
        tabIndex={-1}
        className="h-full w-full touch-none outline-none select-none focus-visible:ring-2 focus-visible:ring-(--focus-ring)"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(event) => {
          endGesture(event, false);
        }}
        onPointerCancel={(event) => {
          endGesture(event, true);
        }}
        onKeyDown={onKeyDown}
      >
        <g ref={viewportRef} className="group">
          <g>{edges}</g>
          <g>{edgeLabels}</g>
          <g>{vertices}</g>
        </g>
      </svg>
      <div className="absolute top-2 right-2 flex flex-col gap-1">
        <button
          type="button"
          className={button}
          title={t("topology.zoomIn")}
          aria-label={t("topology.zoomIn")}
          onClick={() => {
            zoomBy(1.25);
          }}
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className={button}
          title={t("topology.zoomOut")}
          aria-label={t("topology.zoomOut")}
          onClick={() => {
            zoomBy(0.8);
          }}
        >
          <MinusIcon />
        </button>
        <button
          type="button"
          className={button}
          title={t("topology.fit")}
          aria-label={t("topology.fit")}
          onClick={() => {
            userViewRef.current = false;
            fit();
          }}
        >
          <FitIcon />
        </button>
      </div>
    </div>
  );
});
