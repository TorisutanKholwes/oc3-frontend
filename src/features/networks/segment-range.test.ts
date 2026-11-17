import { describe, expect, it } from "vitest";
import { rangeProblem, rangeSize } from "./segment-range";

const network = { begin: "10.0.0.1", end: "10.0.0.254" };

describe("rangeProblem", () => {
  it("accepts a range inside the network", () => {
    expect(rangeProblem(network, "10.0.0.10", "10.0.0.20")).toBeNull();
  });

  it("waits for the fields to be typed", () => {
    expect(rangeProblem(network, "", "")).toBeNull();
    expect(rangeProblem(network, "10.0.0.10", "")).toBeNull();
  });

  it("refuses what is not an address", () => {
    expect(rangeProblem(network, "10.0.0", "")).toEqual({ field: "begin", key: "invalid" });
    expect(rangeProblem(network, "10.0.0.1", "10.0.0.256")).toEqual({
      field: "end",
      key: "invalid",
    });
  });

  it("refuses an address outside the network", () => {
    expect(rangeProblem(network, "10.0.1.1", "")).toEqual({ field: "begin", key: "outside" });
    expect(rangeProblem(network, "10.0.0.1", "10.0.0.255")).toEqual({
      field: "end",
      key: "outside",
    });
  });

  it("refuses a last address before the first", () => {
    expect(rangeProblem(network, "10.0.0.20", "10.0.0.10")).toEqual({
      field: "end",
      key: "before",
    });
  });

  it("checks only the form without the network", () => {
    expect(rangeProblem(undefined, "192.168.0.1", "192.168.0.9")).toBeNull();
  });
});

describe("rangeSize", () => {
  it("counts the addresses, both ends included", () => {
    expect(rangeSize("10.0.0.10", "10.0.0.20")).toBe(11);
    expect(rangeSize("10.0.0.255", "10.0.1.0")).toBe(2);
  });

  it("is null for an invalid or reversed range", () => {
    expect(rangeSize("10.0.0.20", "10.0.0.10")).toBeNull();
    expect(rangeSize("x", "10.0.0.10")).toBeNull();
  });
});
