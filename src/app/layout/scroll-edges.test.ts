import { describe, expect, it } from "vitest";
import { scrollEdges } from "./scroll-edges";

describe("scrollEdges", () => {
  it("tells nothing hidden when the content fits", () => {
    expect(scrollEdges({ scrollTop: 0, clientHeight: 500, scrollHeight: 500 })).toEqual({
      above: false,
      below: false,
    });
  });
  it("tells entries below at the top of a long menu", () => {
    expect(scrollEdges({ scrollTop: 0, clientHeight: 500, scrollHeight: 900 })).toEqual({
      above: false,
      below: true,
    });
  });
  it("tells entries on both sides in the middle", () => {
    expect(scrollEdges({ scrollTop: 200, clientHeight: 500, scrollHeight: 900 })).toEqual({
      above: true,
      below: true,
    });
  });
  it("tells entries above only at the bottom, a rounded pixel aside", () => {
    expect(scrollEdges({ scrollTop: 399.5, clientHeight: 500, scrollHeight: 900 })).toEqual({
      above: true,
      below: false,
    });
  });
});
