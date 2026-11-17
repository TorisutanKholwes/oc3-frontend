import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { checkedRows } from "@/features/assistant/checked-rows";
import { CollectorList, type ListColumn } from "../CollectorList";
import type { ResolvedListSearch } from "@/lib/list-search";

interface Disk {
  id?: string;
  name: string;
}

const columns: ListColumn<Disk>[] = [
  { prop: "name", labelKey: "list.name", family: "node", render: (row) => row.name },
];
const search: ResolvedListSearch = { sort: [], offset: 0, limit: 50, filters: {} };

/** A list of the page of the disks, as a view renders it, without telling its selection. */
function renderList(rows: Disk[], total?: number) {
  const rootRoute = createRootRoute();
  const page = createRoute({
    getParentRoute: () => rootRoute,
    path: "/disks",
    component: () => (
      <CollectorList<Disk>
        columns={columns}
        defaultCols={["name"]}
        rows={rows}
        rowId={(row) => row.id}
        search={search}
        onChange={() => undefined}
        isPending={false}
        isFetching={false}
        errorMessage={null}
        hasMore={false}
        total={total}
      />
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ["/disks"] }),
  });
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const tick = async (count: number) => {
  const boxes = await screen.findAllByRole("checkbox", { name: "Select this row" });
  boxes.slice(0, count).forEach((box) => fireEvent.click(box));
};

describe("the rows ticked in a list", () => {
  // jsdom has no ResizeObserver, which the list fits its columns with.
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterAll(() => {
    vi.unstubAllGlobals();
  });

  test("go with a question to the assistant, in the order of the list, none once it leaves", async () => {
    const { unmount } = renderList([
      { id: "10", name: "b" },
      { id: "9", name: "a" },
      { id: "11", name: "c" },
    ]);
    await tick(2);
    await waitFor(() => {
      expect(checkedRows()).toEqual({ kind: "disks", ids: ["10", "9"], exact: true, all: false });
    });
    unmount();
    expect(checkedRows()).toBeNull();
  });

  test("are every row of the list when all the rows of its total are ticked", async () => {
    const { unmount } = renderList(
      [
        { id: "1", name: "a" },
        { id: "2", name: "b" },
      ],
      2,
    );
    await tick(2);
    await waitFor(() => {
      expect(checkedRows()?.all).toBe(true);
    });
    unmount();
  });

  test("give their count alone when a row has no id, ticked by its position", async () => {
    const { unmount } = renderList([{ name: "a" }, { id: "7", name: "b" }]);
    await tick(2);
    await waitFor(() => {
      expect(checkedRows()?.exact).toBe(false);
    });
    unmount();
  });
});
