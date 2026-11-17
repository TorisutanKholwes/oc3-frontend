import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import type { TopologyStart } from "./layers";
import { TopologyView } from "./TopologyView";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function renderView(start: TopologyStart) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => <TopologyView start={start} /> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** jsdom has no pointer events: mouse events carrying a pointer id stand for them. */
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}

const TOPOLOGY = {
  vertices: [
    { id: "node:n1", kind: "node", layer: "nodes", label: "web01", node_id: "n1", detail: "Linux" },
    {
      id: "svc:s1",
      kind: "service",
      layer: "services",
      label: "shop",
      status: "warn",
      svc_id: "s1",
    },
    { id: "loc:racks:r1", kind: "racks", layer: "racks", label: "R1" },
  ],
  edges: [
    { from: "svc:s1", to: "node:n1", status: "up" },
    { from: "node:n1", to: "loc:racks:r1" },
  ],
};

describe("TopologyView", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  beforeEach(() => {
    void i18n.changeLanguage("en");
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("PointerEvent", TestPointerEvent);
    // jsdom captures no pointer.
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastUrl = () => {
    const input = fetchMock.mock.calls.at(-1)?.[0];
    return new URL(input instanceof Request ? input.url : String(input), window.location.href);
  };

  test("draws the graph of the node, its vertices named, and opens a node on click", async () => {
    fetchMock.mockResolvedValue(json(200, TOPOLOGY));
    const router = renderView({ nodeIds: ["n1"] });
    const graph = await screen.findByRole("group", { name: /Topology of 3 objects and 2 links/ });
    expect(graph).toHaveAccessibleName(/Nodes 1, Services 1, Racks 1/);
    expect(lastUrl().pathname).toBe("/api/topology");
    expect(lastUrl().searchParams.get("node_ids")).toBe("n1");
    expect(lastUrl().searchParams.get("display")).toBe(
      "nodes,services,hvs,hvpools,hvvdcs,enclosures,racks,rooms,buildings,cities,countries",
    );
    // The rack opens nothing: it is no button.
    expect(screen.getAllByRole("button", { name: /web01|shop|R1/ })).toHaveLength(2);
    const node = screen.getByRole("button", { name: "web01, Linux" });
    fireEvent.pointerDown(node, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
    fireEvent.pointerUp(node, { button: 0, pointerId: 1, clientX: 5, clientY: 5 });
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ peek: "node:n1" });
    });
    fireEvent.keyDown(screen.getByRole("button", { name: "shop, warn" }), { key: "Enter" });
    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({ peek: "service:s1" });
    });
  });

  test("redraws with the layers checked", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(200, TOPOLOGY)));
    renderView({ svcIds: ["s1"], appIds: [3] });
    await screen.findByRole("group", { name: /Topology/ });
    fireEvent.click(screen.getByRole("checkbox", { name: "Resources" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Countries" }));
    fireEvent.click(screen.getByRole("button", { name: "Redraw" }));
    await waitFor(() => {
      expect(lastUrl().searchParams.get("display")).toBe(
        "nodes,services,resources,hvs,hvpools,hvvdcs,enclosures,racks,rooms,buildings,cities",
      );
    });
    expect(lastUrl().searchParams.get("svc_ids")).toBe("s1");
    expect(lastUrl().searchParams.get("app_ids")).toBe("3");
  });

  test("says why the collector refused", async () => {
    fetchMock.mockResolvedValue(
      json(400, { text: "more than 1000 nodes and services to draw: narrow the selection" }),
    );
    renderView({ nodeIds: ["n1"] });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Cannot draw the topology: more than 1000 nodes and services to draw",
    );
  });

  test("has nothing to draw for an empty graph or an empty start", async () => {
    fetchMock.mockResolvedValue(json(200, { vertices: [], edges: [] }));
    renderView({ nodeIds: ["n1"] });
    expect(await screen.findByText("Nothing to draw.")).toBeInTheDocument();
  });

  test("reads nothing without a start", () => {
    renderView({});
    return waitFor(() => {
      expect(screen.getByText(/no node, service or application to start from/)).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
