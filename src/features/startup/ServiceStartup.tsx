import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ObjectState } from "@/components/opensvc/StatusBadge";
import { statusBadge } from "@/components/opensvc/status";
import {
  ClockIcon,
  CubeIcon,
  DatabaseIcon,
  FolderIcon,
  GearIcon,
  HashIcon,
  LinkIcon,
  LockIcon,
  NetworkIcon,
  PowerIcon,
  PulseIcon,
  ServerIcon,
  StackIcon,
} from "@/components/ui/icons";
import { BOX_HEIGHT, BOX_WIDTH, layout } from "./startup-layout";
import { useServiceStartup, type StartupEdge, type StartupVertex } from "./use-service-startup";

type Icon = typeof ServerIcon;

const FAMILY_ICON: Record<string, Icon> = {
  ip: NetworkIcon,
  volume: DatabaseIcon,
  disk: DatabaseIcon,
  fs: FolderIcon,
  share: LinkIcon,
  container: CubeIcon,
  app: GearIcon,
  hb: PulseIcon,
  stonith: PowerIcon,
};

function vertexIcon(v: StartupVertex): Icon {
  switch (v.kind) {
    case "service":
      return PowerIcon;
    case "node":
    case "encap":
      return ServerIcon;
    case "subset":
      return StackIcon;
    case "trigger":
      return ClockIcon;
  }
  if (v.type === "scsireserv") return LockIcon;
  return FAMILY_ICON[v.family ?? ""] ?? HashIcon;
}

const STATE_STROKE: Record<ObjectState, string> = {
  up: "stroke-state-up",
  warn: "stroke-state-warn",
  down: "stroke-state-down",
  unknown: "stroke-line-strong",
};

const STATE_FILL: Record<ObjectState, string> = {
  up: "fill-state-up",
  warn: "fill-state-warn",
  down: "fill-state-down",
  unknown: "fill-state-unknown",
};

const STATE_INK: Record<ObjectState, string> = {
  up: "text-state-up",
  warn: "text-state-warn",
  down: "text-state-down",
  unknown: "text-ink-muted",
};

/** The words of the flags of a step, translated. */
function flags(v: StartupVertex, t: (key: string) => string): string[] {
  const l: string[] = [];
  if (v.parallel) l.push(t("startup.flags.parallel"));
  if (v.disabled) l.push(t("startup.flags.disabled"));
  if (v.optional) l.push(t("startup.flags.optional"));
  if (v.monitor) l.push(t("startup.flags.monitor"));
  if (v.standby) l.push(t("startup.flags.standby"));
  if (v.encap) l.push(t("startup.flags.encap"));
  return l;
}

/** The second line of a step: its driver and status, or what it is. */
function subtitle(v: StartupVertex, t: (key: string) => string): string {
  switch (v.kind) {
    case "service":
      return t("startup.kinds.service");
    case "node":
      return t("startup.kinds.node");
    case "encap":
      return v.rid === undefined
        ? t("startup.kinds.encap")
        : `${t("startup.kinds.encap")} · ${v.rid}`;
    case "subset":
      return v.parallel ? t("startup.flags.parallel") : t("startup.serial");
    case "trigger":
      return v.rid ?? t("startup.kinds.service");
  }
  const kind = [v.family, v.type].filter((s) => s !== undefined && s !== "").join(".");
  return [kind, v.status ?? t("startup.unreported")].join(" · ");
}

function tooltip(v: StartupVertex, t: (key: string) => string): string {
  const lines = [v.label, subtitle(v, t)];
  const f = flags(v, t);
  if (f.length > 0) lines.push(f.join(", "));
  if (v.desc !== undefined && v.desc !== "") lines.push(v.desc);
  return lines.join("\n");
}

/** A path from the bottom of a box to the top of another, curved. */
function sequencePath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const x1 = a.x + BOX_WIDTH / 2;
  const y1 = a.y + BOX_HEIGHT;
  const x2 = b.x + BOX_WIDTH / 2;
  const y2 = b.y - 2;
  const dy = (y2 - y1) / 2;
  return `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`;
}

/** A path from the right side of a box to the right side of another, bowed outward. */
function requiresPath(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const x1 = a.x + BOX_WIDTH;
  const y1 = a.y + BOX_HEIGHT / 2;
  const x2 = b.x + BOX_WIDTH + 2;
  const y2 = b.y + BOX_HEIGHT / 2;
  const bow = 30 + Math.abs(y2 - y1) / 6;
  return `M${x1},${y1} C${x1 + bow},${y1} ${x2 + bow},${y2} ${x2},${y2}`;
}

/**
 * The inner width of an element, followed as it changes: the panel resized by
 * hand, the window, a scroll bar coming. 0 until measured.
 */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    const measure = () => {
      setWidth(Math.floor(el.clientWidth));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width] as const;
}

/**
 * The startup of a service on one of its nodes, as the historical collector's
 * startup tab drew it: its resources in the order the agent starts them, from
 * the top down, their triggers around them, the subsets that start theirs in
 * parallel branching out, the encap resources last; each resource with the
 * state the node last reported. Dashed, the requirements a start waits for
 * (start_requires).
 *
 * The drawing takes the width of the panel and no more, laid out again as the
 * panel is resized: the steps of a row that do not fit, as the resources of a
 * large parallel subset, wrap on more lines; a panel narrower than a step
 * scales the drawing down.
 *
 * The node is chosen among those of the service; the disabled resources, which
 * the agent skips, are left out unless asked for.
 */
export function ServiceStartup({ svcId }: { svcId: string }) {
  const { t } = useTranslation();
  const [nodeId, setNodeId] = useState<string | undefined>(undefined);
  const [showDisabled, setShowDisabled] = useState(false);
  const startup = useServiceStartup(svcId, nodeId, showDisabled);
  const data = startup.data;
  const nodeSelectId = useId();
  const markerId = useId();
  const requiresMarkerId = useId();
  const [frameRef, frameWidth] = useWidth<HTMLDivElement>();

  const drawing = useMemo(() => {
    if (data === undefined) return undefined;
    const sequence = data.edges.filter((e) => e.kind === "sequence");
    return {
      layout: layout(
        { ids: data.vertices.map((v) => v.id), edges: sequence },
        // The border of the frame takes its two pixels.
        frameWidth > 0 ? frameWidth - 2 : Infinity,
      ),
      sequence,
      requires: data.edges.filter((e) => e.kind === "requires"),
    };
  }, [data, frameWidth]);

  const controls = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {data !== undefined && data.nodes.length > 1 && (
        <div className="flex items-center gap-2">
          <label htmlFor={nodeSelectId} className="font-medium">
            {t("startup.node")}
          </label>
          <select
            id={nodeSelectId}
            value={data.node_id ?? ""}
            onChange={(event) => {
              setNodeId(event.target.value);
            }}
            className="h-8 rounded-(--radius-control) border border-line bg-surface px-2"
          >
            {data.nodes.map((n) => (
              <option key={n.node_id} value={n.node_id}>
                {n.nodename}
              </option>
            ))}
          </select>
        </div>
      )}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          className="accent-(--accent)"
          checked={showDisabled}
          onChange={(event) => {
            setShowDisabled(event.target.checked);
          }}
        />
        {t("startup.showDisabled")}
      </label>
    </div>
  );

  const body = (() => {
    if (startup.isError)
      return (
        <p role="alert" className="text-state-down">
          ■ {t("startup.error", { message: startup.error.message })}
        </p>
      );
    if (data === undefined || drawing === undefined || frameWidth === 0)
      return <p className="text-ink-muted">{t("startup.loading")}</p>;
    if (data.nodes.length === 0) return <p className="text-ink-muted">{t("startup.noNode")}</p>;
    if (data.vertices.length === 0)
      return <p className="text-ink-muted">{t("startup.noConfig")}</p>;
    const { boxes, width, height } = drawing.layout;
    const byId = new Map(data.vertices.map((v) => [v.id, v]));
    const edgeOf = (e: StartupEdge) => {
      const a = boxes.get(e.from);
      const b = boxes.get(e.to);
      return a === undefined || b === undefined ? undefined : { a, b };
    };
    return (
      <div className="overflow-hidden rounded-(--radius-control) border border-line bg-surface-raised">
        <svg
          width="100%"
          height={(height * Math.max(1, frameWidth - 2)) / width}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={t("startup.summary", {
            nodename: data.nodename ?? "",
            count: data.vertices.filter((v) => v.kind === "resource").length,
          })}
          className="block"
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" className="fill-ink-muted" />
            </marker>
            <marker
              id={requiresMarkerId}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" className="fill-accent" />
            </marker>
          </defs>
          {drawing.sequence.map((e) => {
            const p = edgeOf(e);
            if (p === undefined) return null;
            return (
              <path
                key={`s:${e.from}:${e.to}`}
                d={sequencePath(p.a, p.b)}
                className="fill-none stroke-ink-muted"
                strokeWidth={1.5}
                markerEnd={`url(#${markerId})`}
              />
            );
          })}
          {drawing.requires.map((e) => {
            const p = edgeOf(e);
            if (p === undefined) return null;
            return (
              <g key={`r:${e.from}:${e.to}`}>
                <title>
                  {t("startup.requires", {
                    from: byId.get(e.to)?.label ?? e.to,
                    to: byId.get(e.from)?.label ?? e.from,
                    states: e.label ?? "",
                  })}
                </title>
                <path
                  d={requiresPath(p.a, p.b)}
                  className="fill-none stroke-accent"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  markerEnd={`url(#${requiresMarkerId})`}
                />
              </g>
            );
          })}
          {data.vertices.map((v) => {
            const box = boxes.get(v.id);
            if (box === undefined) return null;
            const Icon = vertexIcon(v);
            const state =
              v.kind === "resource" && v.status !== undefined
                ? statusBadge(v.status).state
                : undefined;
            const muted = v.disabled === true;
            const f = flags(v, t);
            return (
              <g key={v.id} transform={`translate(${box.x},${box.y})`} opacity={muted ? 0.5 : 1}>
                <title>{tooltip(v, t)}</title>
                <rect
                  width={BOX_WIDTH}
                  height={BOX_HEIGHT}
                  rx={6}
                  className={`fill-surface ${state === undefined ? "stroke-line-strong" : STATE_STROKE[state]}`}
                  strokeWidth={state === undefined ? 1 : 2}
                  strokeDasharray={v.kind === "trigger" || muted ? "4 3" : undefined}
                />
                <Icon
                  x={8}
                  y={BOX_HEIGHT / 2 - 10}
                  width={20}
                  height={20}
                  className={state === undefined ? "text-icon-service" : STATE_INK[state]}
                />
                {state !== undefined && (
                  <circle cx={BOX_WIDTH - 10} cy={10} r={4} className={STATE_FILL[state]} />
                )}
                <text x={36} y={20} className="fill-ink text-[12px] font-medium">
                  {clip(v.label, 22)}
                </text>
                <text x={36} y={36} className="fill-ink-muted text-[10px]">
                  {clip(subtitle(v, t), 30)}
                </text>
                {f.length > 0 && (
                  <text x={36} y={48} className="fill-ink-muted text-[9px] italic">
                    {clip(f.join(" · "), 34)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    );
  })();

  return (
    <div className="space-y-3">
      {controls}
      <div ref={frameRef} aria-busy={startup.isFetching} className="w-full min-w-0">
        {body}
      </div>
      {data !== undefined && data.vertices.length > 0 && (
        <p className="text-data text-ink-muted">{t("startup.hint")}</p>
      )}
    </div>
  );
}

function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
