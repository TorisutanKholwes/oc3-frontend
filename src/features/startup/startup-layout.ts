/**
 * The layout of a startup graph: a drawing in rows, from the top down, one row
 * a step of the start, as the order the agent follows reads best that way.
 *
 * The row of a step is the longest path to it from the first step along the
 * "sequence" edges, so that a step comes after all those it follows: after a
 * parallel subset, the next step comes once all its resources are drawn. The
 * "requires" edges do not place the steps, they are drawn over the rows. In a
 * row, the steps are ordered by the mean place of the steps they follow, then
 * by their order in the graph, so that the branches of a parallel subset stay
 * under it.
 */

export interface LayoutInput {
  /** The ids of the steps, in the order of the graph. */
  ids: readonly string[];
  /** The "sequence" edges, by id. */
  edges: readonly { from: string; to: string }[];
}

export interface LayoutBox {
  x: number;
  y: number;
  row: number;
}

export interface Layout {
  boxes: Map<string, LayoutBox>;
  width: number;
  height: number;
}

export const BOX_WIDTH = 200;
export const BOX_HEIGHT = 52;
export const GAP_X = 28;
export const GAP_Y = 44;
export const MARGIN = 16;
/** Between the lines of a row that wraps. */
export const GAP_WRAP = 22;
/** On the right of the steps, for the requirement arcs. */
export const RIGHT_ROOM = 48;

/** The row of each step: the longest path to it along the sequence edges. */
export function rows(input: LayoutInput): Map<string, number> {
  const known = new Set(input.ids);
  const next = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of input.ids) {
    next.set(id, []);
    indegree.set(id, 0);
  }
  for (const { from, to } of input.edges) {
    if (!known.has(from) || !known.has(to) || from === to) continue;
    next.get(from)?.push(to);
    indegree.set(to, (indegree.get(to) ?? 0) + 1);
  }
  const row = new Map<string, number>(input.ids.map((id) => [id, 0]));
  const queue = input.ids.filter((id) => indegree.get(id) === 0);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i] as string;
    for (const to of next.get(id) ?? []) {
      row.set(to, Math.max(row.get(to) ?? 0, (row.get(id) ?? 0) + 1));
      const left = (indegree.get(to) ?? 0) - 1;
      indegree.set(to, left);
      if (left === 0) queue.push(to);
    }
  }
  // A cycle, which the agent would refuse, leaves its steps where they were.
  return row;
}

/**
 * Places the steps in rows, each centered in the width given. A row holding
 * more steps than the width fits, as the resources of a parallel subset, wraps
 * on several lines, closer to one another than the rows are: the drawing never
 * grows wider than its frame, only taller. Without a width, or one narrower than
 * a step, a row stays on one line, the drawing as wide as its widest row.
 */
export function layout(input: LayoutInput, availableWidth = Infinity): Layout {
  const row = rows(input);
  const order = new Map(input.ids.map((id, i) => [id, i]));
  const previous = new Map<string, string[]>();
  for (const { from, to } of input.edges) {
    if (!order.has(from) || !order.has(to)) continue;
    const l = previous.get(to) ?? [];
    l.push(from);
    previous.set(to, l);
  }
  const byRow: string[][] = [];
  for (const id of input.ids) {
    const r = row.get(id) ?? 0;
    (byRow[r] ??= []).push(id);
  }
  const place = new Map<string, number>();
  for (const ids of byRow) {
    if (ids === undefined) continue;
    const weight = (id: string) => {
      const before = (previous.get(id) ?? []).filter((p) => place.has(p));
      if (before.length === 0) return Infinity;
      return before.reduce((sum, p) => sum + (place.get(p) ?? 0), 0) / before.length;
    };
    const weights = new Map(ids.map((id) => [id, weight(id)]));
    ids.sort((a, b) => {
      const wa = weights.get(a) ?? Infinity;
      const wb = weights.get(b) ?? Infinity;
      if (wa !== wb) return wa < wb ? -1 : 1;
      return (order.get(a) ?? 0) - (order.get(b) ?? 0);
    });
    ids.forEach((id, i) => place.set(id, i));
  }
  // The room on the right is for the requirement arcs, drawn beside the steps.
  const fit = Math.floor((availableWidth - MARGIN * 2 - RIGHT_ROOM + GAP_X) / (BOX_WIDTH + GAP_X));
  const columns = Number.isFinite(fit) && fit >= 1 ? fit : Infinity;
  const widest = Math.max(1, ...byRow.map((ids) => Math.min(ids?.length ?? 0, columns)));
  const needed = MARGIN * 2 + RIGHT_ROOM + widest * BOX_WIDTH + (widest - 1) * GAP_X;
  const width = Number.isFinite(availableWidth) ? Math.max(availableWidth, needed) : needed;
  const boxes = new Map<string, LayoutBox>();
  let y = MARGIN;
  byRow.forEach((ids, r) => {
    if (ids === undefined) return;
    for (let start = 0; start < ids.length; start += columns) {
      const line = ids.slice(start, start + columns);
      const lineWidth = line.length * BOX_WIDTH + (line.length - 1) * GAP_X;
      const x0 = (width - RIGHT_ROOM - lineWidth) / 2;
      line.forEach((id, i) => {
        boxes.set(id, { x: x0 + i * (BOX_WIDTH + GAP_X), y, row: r });
      });
      y += BOX_HEIGHT + (start + columns < ids.length ? GAP_WRAP : GAP_Y);
    }
  });
  const height = byRow.length === 0 ? MARGIN * 2 : y - GAP_Y + MARGIN;
  return { boxes, width, height };
}
