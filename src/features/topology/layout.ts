/**
 * A force-directed layout, in the manner of the vis.js network the historical
 * collector drew its topology with: the vertices push one another away as
 * charges do, each edge pulls its two ends to its rest length as a spring, a
 * central gravity keeps the whole together, and a friction lets it settle.
 * As in d3-force, the forces cool down step by step (`alpha`): the layout comes
 * to rest in a few hundred steps whatever the graph, rather than oscillating.
 *
 * A vertex is a body, an edge a spring between two bodies, in the order of the
 * vertices and edges given, so that a caller paints them without copying.
 * Beyond `EXACT_LIMIT` bodies the repulsion is approximated with a Barnes-Hut
 * quadtree, O(n log n) a step rather than O(n²).
 */

export interface LayoutParams {
  /** Strength of the repulsion between two bodies, by the product of their masses. */
  repulsion: number;
  /** Stiffness of the springs. */
  springConstant: number;
  /** Rest length of a spring between two bodies of no size. */
  springLength: number;
  /** Pull of every body toward the origin, by its mass. */
  centralGravity: number;
  /** Share of its velocity a body loses at each step. */
  friction: number;
  /** Time step of the integration. */
  timestep: number;
  /** Bound on the velocity of a body, against explosions. */
  maxVelocity: number;
  /** The layout has settled once no body moves faster. */
  minVelocity: number;
  /** Barnes-Hut accuracy: a cell seen under a smaller ratio of size to distance is one body. */
  theta: number;
  /** Cooling of the forces at each step, as a share of their strength. */
  alphaDecay: number;
  /** The layout has settled once the forces have cooled down below this. */
  alphaMin: number;
  /** Bound on the steps of a layout, settled or not. */
  maxIterations: number;
}

export const DEFAULT_PARAMS: LayoutParams = {
  repulsion: 2000,
  springConstant: 0.2,
  springLength: 70,
  centralGravity: 0.3,
  friction: 0.35,
  timestep: 1,
  maxVelocity: 60,
  minVelocity: 0.2,
  theta: 0.7,
  // From 1 to alphaMin in about 400 steps.
  alphaDecay: 1 - Math.pow(0.001, 1 / 400),
  alphaMin: 0.001,
  maxIterations: 1000,
};

/** Up to this many bodies, the repulsion is computed between every pair. */
export const EXACT_LIMIT = 250;

export interface LayoutVertex {
  mass: number;
  radius: number;
}

export interface LayoutEdge {
  source: number;
  target: number;
}

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The force of the last step. */
  fx: number;
  fy: number;
  mass: number;
  radius: number;
  /** Held in place, as while dragged. */
  pinned: boolean;
  /** Position in the vertices given. */
  index: number;
}

export interface Spring {
  a: Body;
  b: Body;
  rest: number;
}

export interface Simulation {
  readonly bodies: readonly Body[];
  readonly springs: readonly Spring[];
  readonly params: LayoutParams;
  /** Steps run since the layout started or was last reheated. */
  iterations: number;
  /** Strength of the forces, from 1 at the start down to `alphaMin`. */
  alpha: number;
  /** The highest velocity of the last step. */
  velocity: number;
  /** Whether the layout settled or ran out of steps. */
  settled: boolean;
}

/** A small seeded generator (mulberry32): the same graph, the same drawing. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Places the bodies before the forces do: the heaviest first, on a spiral, and
 * every other near a neighbour already placed, breadth first. Starting close to
 * its shape, the layout settles in fewer steps, and the seed makes it the same
 * from one drawing to the next.
 */
function seedPositions(sim: Simulation, seed: number) {
  const rand = random(seed);
  const neighbours = new Map<Body, Body[]>(sim.bodies.map((body) => [body, []]));
  for (const { a, b } of sim.springs) {
    neighbours.get(a)?.push(b);
    neighbours.get(b)?.push(a);
  }
  const order = [...sim.bodies].sort((p, q) => q.mass - p.mass || p.index - q.index);
  const placed = new Set<Body>();
  const golden = Math.PI * (3 - Math.sqrt(5));
  let roots = 0;
  for (const root of order) {
    if (placed.has(root)) continue;
    const r = 4 * sim.params.springLength * Math.sqrt(roots);
    root.x = r * Math.cos(roots * golden);
    root.y = r * Math.sin(roots * golden);
    placed.add(root);
    roots += 1;
    const queue = [root];
    for (let head = 0; head < queue.length; head++) {
      const from = queue[head];
      if (from === undefined) break;
      for (const to of neighbours.get(from) ?? []) {
        if (placed.has(to)) continue;
        const angle = rand() * 2 * Math.PI;
        const distance = sim.params.springLength * (0.5 + rand());
        to.x = from.x + distance * Math.cos(angle);
        to.y = from.y + distance * Math.sin(angle);
        placed.add(to);
        queue.push(to);
      }
    }
  }
}

/**
 * A layout of the vertices and edges given, the edges naming their ends by index;
 * those naming no vertex, and the loops, are left out.
 */
export function createSimulation(
  vertices: readonly LayoutVertex[],
  edges: readonly LayoutEdge[],
  params: Partial<LayoutParams> = {},
  seed = 1,
): Simulation {
  const merged = { ...DEFAULT_PARAMS, ...params };
  const bodies: Body[] = vertices.map((v, index) => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    fx: 0,
    fy: 0,
    mass: Math.max(v.mass, 0.1),
    radius: Math.max(v.radius, 0),
    pinned: false,
    index,
  }));
  const springs: Spring[] = [];
  for (const edge of edges) {
    const a = bodies[edge.source];
    const b = bodies[edge.target];
    if (a === undefined || b === undefined || a === b) continue;
    // Larger vertices keep their neighbours farther, their discs apart.
    springs.push({ a, b, rest: merged.springLength + a.radius + b.radius });
  }
  const sim: Simulation = {
    bodies,
    springs,
    params: merged,
    iterations: 0,
    alpha: 1,
    velocity: Infinity,
    settled: bodies.length === 0,
  };
  seedPositions(sim, seed);
  return sim;
}

/** A cell of the Barnes-Hut quadtree. */
interface Cell {
  x0: number;
  y0: number;
  size: number;
  mass: number;
  /** Centre of mass, summed weighted until the tree is complete. */
  cx: number;
  cy: number;
  /** The body of a leaf; null for an empty leaf or an inner cell. */
  body: Body | null;
  /** Further bodies of a leaf at the deepest level, at the same place. */
  more: Body[] | null;
  children: [Cell | null, Cell | null, Cell | null, Cell | null] | null;
}

const MAX_DEPTH = 24;

function newCell(x0: number, y0: number, size: number): Cell {
  return { x0, y0, size, mass: 0, cx: 0, cy: 0, body: null, more: null, children: null };
}

/** The child cell of the quadrant of a point, created when missing. */
function childAt(cell: Cell, x: number, y: number): Cell {
  const half = cell.size / 2;
  const right = x >= cell.x0 + half;
  const below = y >= cell.y0 + half;
  const q = (right ? 1 : 0) + (below ? 2 : 0);
  const children = (cell.children ??= [null, null, null, null]);
  const existing = children[q];
  if (existing !== null && existing !== undefined) return existing;
  const created = newCell(cell.x0 + (right ? half : 0), cell.y0 + (below ? half : 0), half);
  children[q] = created;
  return created;
}

function addMass(cell: Cell, body: Body) {
  cell.mass += body.mass;
  cell.cx += body.x * body.mass;
  cell.cy += body.y * body.mass;
}

function insert(root: Cell, body: Body) {
  let cell = root;
  for (let depth = 0; ; depth++) {
    addMass(cell, body);
    if (cell.children !== null) {
      cell = childAt(cell, body.x, body.y);
      continue;
    }
    if (cell.body === null) {
      cell.body = body;
      return;
    }
    if (depth >= MAX_DEPTH) {
      (cell.more ??= []).push(body);
      return;
    }
    // A leaf taken: its body goes down a level, and this one follows.
    const previous = cell.body;
    cell.body = null;
    const down = childAt(cell, previous.x, previous.y);
    addMass(down, previous);
    down.body = previous;
    cell = childAt(cell, body.x, body.y);
  }
}

function finish(cell: Cell) {
  if (cell.mass > 0) {
    cell.cx /= cell.mass;
    cell.cy /= cell.mass;
  }
  if (cell.children !== null) for (const c of cell.children) if (c !== null) finish(c);
}

function buildTree(bodies: readonly Body[]): Cell {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y } of bodies) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const size = Math.max(maxX - minX, maxY - minY, 1) * 1.0001;
  const root = newCell(minX, minY, size);
  for (const body of bodies) insert(root, body);
  finish(root);
  return root;
}

/**
 * The repulsion of `q` on `p`, added to the force of `p`, and, with `both`, its
 * opposite to that of `q`.
 */
function repel(p: Body, q: Body, repulsion: number, both: boolean) {
  let dx = p.x - q.x;
  let dy = p.y - q.y;
  let d = Math.sqrt(dx * dx + dy * dy);
  if (d === 0) {
    // Two bodies at the same place: pushed apart along a direction of their own.
    const angle = ((p.index * 7919 + q.index * 104729) % 360) * (Math.PI / 180);
    dx = Math.cos(angle);
    dy = Math.sin(angle);
    d = 1;
  }
  // Closer than their discs, the force is that at their discs: it would blow up.
  const dd = Math.max(d, 1, 0.5 * (p.radius + q.radius));
  const f = (repulsion * p.mass * q.mass) / (dd * dd * d);
  p.fx += dx * f;
  p.fy += dy * f;
  if (both) {
    q.fx -= dx * f;
    q.fy -= dy * f;
  }
}

function repelExact(bodies: readonly Body[], repulsion: number) {
  bodies.forEach((p, i) => {
    for (let j = i + 1; j < bodies.length; j++) {
      const q = bodies[j];
      if (q !== undefined) repel(p, q, repulsion, true);
    }
  });
}

function repelTree(bodies: readonly Body[], repulsion: number, theta: number) {
  const root = buildTree(bodies);
  const theta2 = theta * theta;
  const stack: Cell[] = [];
  for (const p of bodies) {
    stack.push(root);
    for (let cell = stack.pop(); cell !== undefined; cell = stack.pop()) {
      if (cell.mass === 0) continue;
      if (cell.children === null) {
        if (cell.body !== null && cell.body !== p) repel(p, cell.body, repulsion, false);
        if (cell.more !== null)
          for (const q of cell.more) if (q !== p) repel(p, q, repulsion, false);
        continue;
      }
      const dx = p.x - cell.cx;
      const dy = p.y - cell.cy;
      const d2 = dx * dx + dy * dy;
      if (cell.size * cell.size < theta2 * d2) {
        // Far enough: the whole cell pushes as one body at its centre of mass.
        const d = Math.sqrt(d2);
        const f = (repulsion * p.mass * cell.mass) / (d2 * d);
        p.fx += dx * f;
        p.fy += dy * f;
        continue;
      }
      for (const c of cell.children) if (c !== null) stack.push(c);
    }
  }
}

/** The forces on every body, in its `fx` and `fy`. */
export function computeForces(sim: Simulation, exact = sim.bodies.length <= EXACT_LIMIT) {
  const { repulsion, theta, springConstant, centralGravity } = sim.params;
  for (const body of sim.bodies) {
    body.fx = 0;
    body.fy = 0;
  }
  if (exact) repelExact(sim.bodies, repulsion);
  else repelTree(sim.bodies, repulsion, theta);
  for (const { a, b, rest } of sim.springs) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.01);
    const f = (springConstant * (d - rest)) / d;
    a.fx += dx * f;
    a.fy += dy * f;
    b.fx -= dx * f;
    b.fy -= dy * f;
  }
  for (const body of sim.bodies) {
    const d = Math.sqrt(body.x * body.x + body.y * body.y);
    if (d === 0) continue;
    const f = (centralGravity * body.mass) / d;
    body.fx -= body.x * f;
    body.fy -= body.y * f;
  }
}

/**
 * One step of the layout: forces, then velocities and positions. Returns the
 * highest velocity, by which the caller sees whether it has settled.
 */
export function step(sim: Simulation): number {
  computeForces(sim);
  const { friction, timestep, maxVelocity, alphaDecay, alphaMin, minVelocity, maxIterations } =
    sim.params;
  const keep = 1 - friction;
  let highest = 0;
  for (const body of sim.bodies) {
    if (body.pinned) {
      body.vx = 0;
      body.vy = 0;
      continue;
    }
    let vx = (body.vx + ((sim.alpha * body.fx) / body.mass) * timestep) * keep;
    let vy = (body.vy + ((sim.alpha * body.fy) / body.mass) * timestep) * keep;
    const v = Math.sqrt(vx * vx + vy * vy);
    if (v > maxVelocity) {
      vx *= maxVelocity / v;
      vy *= maxVelocity / v;
    }
    body.vx = vx;
    body.vy = vy;
    body.x += vx * timestep;
    body.y += vy * timestep;
    highest = Math.max(highest, Math.min(v, maxVelocity));
  }
  sim.iterations += 1;
  sim.alpha *= 1 - alphaDecay;
  sim.velocity = highest;
  sim.settled = sim.alpha < alphaMin || highest < minVelocity || sim.iterations >= maxIterations;
  return highest;
}

/**
 * Runs steps until the layout settles, `maxSteps` are done, or the time budget
 * in milliseconds is spent: a frame's worth, for an animation. Returns the
 * number of steps run.
 */
export function run(sim: Simulation, maxSteps = Infinity, budgetMs = Infinity): number {
  const start = budgetMs === Infinity ? 0 : performance.now();
  let steps = 0;
  while (!sim.settled && steps < maxSteps) {
    step(sim);
    steps += 1;
    if (budgetMs !== Infinity && performance.now() - start >= budgetMs) break;
  }
  return steps;
}

/** Holds a body where it is put, as while dragged. */
export function pin(body: Body, x: number, y: number) {
  body.pinned = true;
  body.x = x;
  body.y = y;
  body.vx = 0;
  body.vy = 0;
}

export function unpin(body: Body) {
  body.pinned = false;
}

/**
 * Sets the layout going again for a while, as after a body was moved: its
 * neighbours follow, then everything settles again.
 */
export function reheat(sim: Simulation, alpha = 0.3) {
  if (sim.bodies.length === 0) return;
  sim.alpha = Math.max(sim.alpha, alpha);
  sim.iterations = 0;
  sim.settled = false;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** The box around the bodies, their discs included, and a margin. */
export function bounds(sim: Simulation, margin = 0): Bounds {
  if (sim.bodies.length === 0) return { minX: -margin, minY: -margin, maxX: margin, maxY: margin };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { x, y, radius } of sim.bodies) {
    minX = Math.min(minX, x - radius);
    minY = Math.min(minY, y - radius);
    maxX = Math.max(maxX, x + radius);
    maxY = Math.max(maxY, y + radius);
  }
  return { minX: minX - margin, minY: minY - margin, maxX: maxX + margin, maxY: maxY + margin };
}

export interface ViewTransform {
  x: number;
  y: number;
  k: number;
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 4;

export function clampZoom(k: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, k));
}

/**
 * The transform showing the box whole and centred in a viewport of the size
 * given, not enlarged beyond `maxScale`.
 */
export function fitTransform(
  box: Bounds,
  width: number,
  height: number,
  maxScale = 1.5,
): ViewTransform {
  const w = Math.max(box.maxX - box.minX, 1);
  const h = Math.max(box.maxY - box.minY, 1);
  const k = clampZoom(Math.min(width / w, height / h, maxScale));
  return {
    k,
    x: width / 2 - ((box.minX + box.maxX) / 2) * k,
    y: height / 2 - ((box.minY + box.maxY) / 2) * k,
  };
}

/**
 * The transform zoomed by `factor` around the point (px, py) of the viewport,
 * which stays under the pointer.
 */
export function zoomAt(view: ViewTransform, factor: number, px: number, py: number): ViewTransform {
  const k = clampZoom(view.k * factor);
  const ratio = k / view.k;
  return { k, x: px - (px - view.x) * ratio, y: py - (py - view.y) * ratio };
}
