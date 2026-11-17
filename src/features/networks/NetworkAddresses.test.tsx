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
import { NetworkAddresses } from "./NetworkAddresses";
import { pageBounds } from "./ips-page";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** The addresses of network 7, in a router for the node badges. */
function renderAddresses() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: () => <NetworkAddresses netId="7" /> });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("pageBounds", () => {
  test("numbers the addresses of the page from 1", () => {
    expect(pageBounds(0, 256, 300)).toEqual({
      from: 1,
      to: 256,
      hasPrevious: false,
      hasNext: true,
    });
    expect(pageBounds(256, 44, 300)).toEqual({
      from: 257,
      to: 300,
      hasPrevious: true,
      hasNext: false,
    });
  });

  test("shows nothing for an empty list", () => {
    expect(pageBounds(0, 0, 0)).toEqual({ from: 0, to: 0, hasPrevious: false, hasNext: false });
  });
});

describe("the addresses of a declared network", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  beforeEach(() => {
    void i18n.changeLanguage("en");
    fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const lastUrl = () => {
    const input = fetchMock.mock.calls.at(-1)?.[0];
    return new URL(input instanceof Request ? input.url : String(input), window.location.href);
  };

  test("lists the addresses with the nodes reporting them", async () => {
    fetchMock.mockResolvedValue(
      json(200, {
        data: [
          { ip: "10.0.0.1", seg_id: 3, seg_type: "static", nodes: [] },
          {
            ip: "10.0.0.2",
            seg_id: 3,
            seg_type: "static",
            nodes: [{ node_id: "n-1", nodename: "web01" }],
          },
        ],
        meta: { count: 2 },
      }),
    );
    renderAddresses();
    expect(await screen.findByText("10.0.0.1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /web01/ })).toBeInTheDocument();
    expect(screen.getByText("free")).toBeInTheDocument();
    expect(screen.getByText("1–2 of 2 addresses")).toBeInTheDocument();
    expect(lastUrl().pathname).toBe("/api/networks/7/ips");
    expect(lastUrl().searchParams.get("free")).toBe("false");
  });

  test("asks the free addresses only, from the first page", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(200, { data: [], meta: { count: 0 } })),
    );
    renderAddresses();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Free addresses only" }));
    await waitFor(() => {
      expect(lastUrl().searchParams.get("free")).toBe("true");
    });
    expect(lastUrl().searchParams.get("offset")).toBe("0");
    expect(await screen.findByText("No free address.")).toBeInTheDocument();
  });

  test("says why when the user is responsible for no segment", async () => {
    fetchMock.mockResolvedValue(json(403, { text: "responsible for no segment of network 7" }));
    renderAddresses();
    expect(
      await screen.findByText(/None of your groups is responsible for a segment/),
    ).toBeInTheDocument();
    expect(screen.getByText("responsible for no segment of network 7")).toBeInTheDocument();
  });

  test("says why when the network is too large to list", async () => {
    fetchMock.mockResolvedValue(json(400, { text: "16777214 addresses to list, more than 65536" }));
    renderAddresses();
    expect(await screen.findByText(/too many addresses to list/)).toBeInTheDocument();
  });
});
