import { describe, expect, test } from "vitest";
import {
  bounds,
  computeForces,
  createSimulation,
  DEFAULT_PARAMS,
  fitTransform,
  MAX_ZOOM,
  pin,
  reheat,
  run,
  step,
  unpin,
  zoomAt,
  type LayoutEdge,
  type Body,
  type LayoutVertex,
  type Simulation,
} from "./layout";

const vertex = (mass = 3, radius = 14): LayoutVertex => ({ mass, radius });

function body(sim: Simulation, i: number): Body {
  const found = sim.bodies[i];
  if (found === undefined) throw new Error(`no body ${i}`);
  return found;
}

function distance(sim: Simulation, a: number, b: number) {
  const p = body(sim, a);
  const q = body(sim, b);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

function finite(sim: Simulation) {
  return sim.bodies.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
}

const xs = (sim: Simulation) => sim.bodies.map((p) => p.x);

/** Appends a vertex, and returns its index. */
function add(vertices: LayoutVertex[], v: LayoutVertex): number {
  vertices.push(v);
  return vertices.length - 1;
}

/** The element at an index, which the test knows to be there. */
function nth<T>(list: readonly T[], i: number): T {
  const found = list[i];
  if (found === undefined) throw new Error(`no element ${i}`);
  return found;
}

/**
 * A park as the collector has them: services on nodes, nodes in racks, racks in
 * rooms, rooms in a few countries.
 */
function park(services: number, nodes: number, racks: number) {
  const vertices: LayoutVertex[] = [];
  const edges: LayoutEdge[] = [];
  const countries = [add(vertices, vertex(10, 28)), add(vertices, vertex(10, 28))];
  const rooms = Array.from({ length: 6 }, (_, i) => {
    const room = add(vertices, vertex(7, 20));
    edges.push({ source: room, target: nth(countries, i % 2) });
    return room;
  });
  const rackIds = Array.from({ length: racks }, (_, i) => {
    const rack = add(vertices, vertex(6, 18));
    edges.push({ source: rack, target: nth(rooms, i % rooms.length) });
    return rack;
  });
  const nodeIds = Array.from({ length: nodes }, (_, i) => {
    const node = add(vertices, vertex(3, 14));
    edges.push({ source: node, target: nth(rackIds, i % rackIds.length) });
    return node;
  });
  for (let i = 0; i < services; i++) {
    const svc = add(vertices, vertex(8, 15));
    // Two instances each, on nodes far apart in the list.
    edges.push({ source: svc, target: nth(nodeIds, i % nodes) });
    edges.push({ source: svc, target: nth(nodeIds, (i * 7 + 3) % nodes) });
  }
  return { vertices, edges };
}

describe("createSimulation", () => {
  test("places the same graph the same way for the same seed", () => {
    const { vertices, edges } = park(20, 30, 4);
    const a = createSimulation(vertices, edges, {}, 3);
    const b = createSimulation(vertices, edges, {}, 3);
    run(a, 50);
    run(b, 50);
    expect(xs(a)).toEqual(xs(b));
    const c = createSimulation(vertices, edges, {}, 4);
    run(c, 50);
    expect(xs(c)).not.toEqual(xs(a));
  });

  test("leaves out the edges to nowhere and the loops", () => {
    const sim = createSimulation(
      [vertex(), vertex()],
      [
        { source: 0, target: 1 },
        { source: 0, target: 5 },
        { source: 1, target: 1 },
        { source: -1, target: 0 },
      ],
    );
    expect(sim.springs.map(({ a, b }) => [a.index, b.index])).toEqual([[0, 1]]);
  });

  test("an empty graph is settled at once", () => {
    const sim = createSimulation([], []);
    expect(sim.settled).toBe(true);
    expect(run(sim, 10)).toBe(0);
    expect(bounds(sim, 5)).toEqual({ minX: -5, minY: -5, maxX: 5, maxY: 5 });
  });
});

describe("step", () => {
  test("brings linked vertices closer than unlinked ones, and settles", () => {
    // Two triangles, not linked to each other.
    const sim = createSimulation(
      Array.from({ length: 6 }, () => vertex()),
      [
        { source: 0, target: 1 },
        { source: 1, target: 2 },
        { source: 2, target: 0 },
        { source: 3, target: 4 },
        { source: 4, target: 5 },
        { source: 5, target: 3 },
      ],
    );
    run(sim);
    expect(sim.settled).toBe(true);
    expect(sim.iterations).toBeLessThan(DEFAULT_PARAMS.maxIterations);
    expect(finite(sim)).toBe(true);
    const linked = distance(sim, 0, 1);
    expect(linked).toBeGreaterThan(30);
    expect(linked).toBeLessThan(distance(sim, 0, 3));
  });

  test("pushes apart vertices at the same place", () => {
    const sim = createSimulation([vertex(), vertex()], []);
    for (const p of sim.bodies) {
      p.x = 0;
      p.y = 0;
    }
    for (let i = 0; i < 20; i++) step(sim);
    expect(finite(sim)).toBe(true);
    expect(distance(sim, 0, 1)).toBeGreaterThan(1);
  });

  test("holds a pinned vertex where it was put", () => {
    const { vertices, edges } = park(5, 10, 2);
    const sim = createSimulation(vertices, edges);
    const held = body(sim, 4);
    pin(held, 500, -300);
    reheat(sim);
    run(sim, 200);
    expect([held.x, held.y]).toEqual([500, -300]);
    unpin(held);
    reheat(sim, 0.1);
    expect(sim.settled).toBe(false);
    step(sim);
    expect(held.x).not.toBe(500);
  });
});

describe("Barnes-Hut", () => {
  test.each([
    [DEFAULT_PARAMS.theta, 0.05, 0.15],
    [0.01, 0.001, 0.001],
  ])("approximates the exact repulsion, theta %f", (theta, median, aggregate) => {
    const { vertices, edges } = park(150, 200, 20);
    // The repulsion alone, on the first positions.
    const sim = createSimulation(vertices, edges, { springConstant: 0, centralGravity: 0, theta });
    computeForces(sim, true);
    const exact = sim.bodies.map((p) => [p.fx, p.fy] as const);
    computeForces(sim, false);
    let error = 0;
    let total = 0;
    const relative = sim.bodies.map((p, i) => {
      const [ex, ey] = nth(exact, i);
      const e = Math.hypot(ex - p.fx, ey - p.fy);
      error += e;
      total += Math.hypot(ex, ey);
      return e / (Math.hypot(ex, ey) || 1);
    });
    relative.sort((a, b) => a - b);
    // Most forces within a few percent; the largest gaps on the bodies whose
    // pushes nearly cancel out, a small force anyway.
    expect(nth(relative, Math.floor(relative.length / 2))).toBeLessThan(median);
    expect(error / total).toBeLessThan(aggregate);
  });

  test("lays out a thousand objects without blowing up", () => {
    const { vertices, edges } = park(400, 560, 40);
    expect(vertices.length).toBe(1008);
    const sim = createSimulation(vertices, edges);
    run(sim);
    expect(sim.settled).toBe(true);
    expect(finite(sim)).toBe(true);
    const box = bounds(sim);
    // Spread, but not flung away: within a few thousand pixels.
    expect(box.maxX - box.minX).toBeGreaterThan(500);
    expect(box.maxX - box.minX).toBeLessThan(20000);
  });
});

describe("view", () => {
  test("fits the box in the frame, centred, not enlarged beyond the bound", () => {
    const view = fitTransform({ minX: -100, minY: -50, maxX: 100, maxY: 50 }, 400, 400);
    expect(view.k).toBe(1.5);
    expect(view.x).toBe(200);
    expect(view.y).toBe(200);
    const wide = fitTransform({ minX: 0, minY: 0, maxX: 2000, maxY: 100 }, 400, 300);
    expect(wide.k).toBeCloseTo(0.2);
    expect(wide.x + 1000 * wide.k).toBeCloseTo(200);
  });

  test("zooms around the pointer, within bounds", () => {
    const view = { x: 10, y: 20, k: 1 };
    const zoomed = zoomAt(view, 2, 110, 120);
    // The point under the pointer stays there.
    expect((110 - zoomed.x) / zoomed.k).toBeCloseTo((110 - view.x) / view.k);
    expect((120 - zoomed.y) / zoomed.k).toBeCloseTo((120 - view.y) / view.k);
    expect(zoomAt(view, 1000, 0, 0).k).toBe(MAX_ZOOM);
  });
});
