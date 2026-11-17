import { describe, expect, it } from "vitest";
import { BOX_WIDTH, GAP_X, layout, rows } from "./startup-layout";

describe("rows", () => {
  it("places a step after the longest path to it", () => {
    // a > subset > (b, c) > d, and a > d directly: d still comes after b and c.
    const r = rows({
      ids: ["a", "subset", "b", "c", "d"],
      edges: [
        { from: "a", to: "subset" },
        { from: "subset", to: "b" },
        { from: "subset", to: "c" },
        { from: "b", to: "d" },
        { from: "c", to: "d" },
        { from: "a", to: "d" },
      ],
    });
    expect(Object.fromEntries(r)).toEqual({ a: 0, subset: 1, b: 2, c: 2, d: 3 });
  });

  it("ignores the edges naming unknown steps and survives a cycle", () => {
    const r = rows({
      ids: ["a", "b"],
      edges: [
        { from: "a", to: "zz" },
        { from: "a", to: "b" },
        { from: "b", to: "a" },
      ],
    });
    expect(r.get("a")).toBe(0);
    expect(r.get("b")).toBe(0);
  });
});

describe("layout", () => {
  it("centers each row on the widest", () => {
    const l = layout({
      ids: ["s", "b", "c"],
      edges: [
        { from: "s", to: "b" },
        { from: "s", to: "c" },
      ],
    });
    const s = l.boxes.get("s");
    const b = l.boxes.get("b");
    const c = l.boxes.get("c");
    expect(s?.row).toBe(0);
    expect(b?.row).toBe(1);
    expect(c?.x).toBe((b?.x ?? 0) + BOX_WIDTH + GAP_X);
    // The single step of the first row sits in the middle of the two below.
    expect((s?.x ?? 0) + BOX_WIDTH / 2).toBe(((b?.x ?? 0) + (c?.x ?? 0) + BOX_WIDTH) / 2);
    expect(l.width).toBeGreaterThan(2 * BOX_WIDTH);
  });

  it("keeps the branches under the steps they follow", () => {
    // Two parallel branches: x1 > x2 and y1 > y2, y1 given first in the second row.
    const l = layout({
      ids: ["root", "x1", "y1", "y2", "x2"],
      edges: [
        { from: "root", to: "x1" },
        { from: "root", to: "y1" },
        { from: "y1", to: "y2" },
        { from: "x1", to: "x2" },
      ],
    });
    expect((l.boxes.get("x2")?.x ?? 0) < (l.boxes.get("y2")?.x ?? 0)).toBe(true);
  });
});

describe("layout in a width", () => {
  const fan = {
    ids: ["subset", ...Array.from({ length: 13 }, (_, i) => `c${i}`), "next"],
    edges: [
      ...Array.from({ length: 13 }, (_, i) => ({ from: "subset", to: `c${i}` })),
      ...Array.from({ length: 13 }, (_, i) => ({ from: `c${i}`, to: "next" })),
    ],
  };

  it("wraps a wide row on lines, never wider than the width", () => {
    const l = layout(fan, 700);
    expect(l.width).toBe(700);
    for (const box of l.boxes.values()) expect(box.x + BOX_WIDTH).toBeLessThanOrEqual(700);
    // 700 fits 2 steps a line: the 13 resources take 7 lines, all of row 1.
    const ys = new Set(
      [...l.boxes.entries()].filter(([id]) => id.startsWith("c")).map(([, b]) => b.y),
    );
    expect(ys.size).toBe(7);
    expect(l.boxes.get("c0")?.row).toBe(1);
    // The next step comes under the last line.
    expect(l.boxes.get("next")?.y).toBeGreaterThan(Math.max(...ys));
  });

  it("lays out again wider in a wider frame", () => {
    expect(layout(fan, 3000).height).toBeLessThan(layout(fan, 700).height);
  });

  it("keeps a row whole in a frame narrower than a step", () => {
    const l = layout(fan, 100);
    expect(l.width).toBeGreaterThan(100);
    expect(new Set([...l.boxes.values()].map((b) => b.y)).size).toBe(3);
  });
});
