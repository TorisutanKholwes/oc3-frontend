import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { fakeClient } from "@/features/assistant/tests/fake-client";

// The shell as far as the assistant goes: a signed-in user, the other parts of the
// top bar and of the page left out.
vi.mock("@/lib/api/auth", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAuthStatus: () => "ok",
  useCredentials: () => ({ user: "alice" }),
}));
vi.mock("@/lib/api/impersonation", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useEffectiveUser: () => "alice",
  useImpersonation: () => null,
}));
vi.mock("@/lib/user-prefs", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useAppearance: () => undefined,
  useNavViewPref: () => ({ view: "operator", setView: () => undefined }),
}));
const passThrough = ({ children }: { children: ReactNode }) => children;
const nothing = () => null;
vi.mock("../BookmarksProvider", () => ({ BookmarksProvider: passThrough }));
vi.mock("../PanelSideProvider", () => ({ PanelSideProvider: passThrough }));
vi.mock("../BookmarksBar", () => ({ BookmarksBar: nothing }));
vi.mock("../Sidebar", () => ({ Sidebar: nothing }));
vi.mock("../PeekPanel", () => ({ PeekPanel: nothing }));
vi.mock("../PanelAnchor", () => ({ PanelAnchor: nothing }));
// It measures the top bar with a ResizeObserver, which jsdom has not.
vi.mock("../app-top", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../app-top")>()),
  useAppTop: () => undefined,
}));
vi.mock("../UserMenu", () => ({ UserMenu: nothing }));
vi.mock("../ImpersonationBanner", () => ({ ImpersonationBanner: nothing }));
vi.mock("../LiveIndicator", () => ({ LiveIndicator: nothing }));
vi.mock("../SessionFilter", () => ({ SessionFilter: nothing }));
vi.mock("../search/GlobalSearch", () => ({ GlobalSearch: nothing }));
vi.mock("@/features/actions/ActionQueueLink", () => ({ ActionQueueLink: nothing }));
vi.mock("@/components/ui/NoticeRegion", () => ({ NoticeRegion: nothing }));
vi.mock("@/features/assistant/assistant-client", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  assistantClient: fakeClient([]),
}));

const { AppShell } = await import("../AppShell");

function renderShell() {
  const rootRoute = createRootRoute({ component: AppShell });
  const nodes = createRoute({
    getParentRoute: () => rootRoute,
    path: "/nodes",
    component: nothing,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([nodes]),
    history: createMemoryHistory({ initialEntries: ["/nodes"] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("the shell", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ enabled: true, available: true }))),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("opens the dock of the assistant from its button of the top bar, in the chat it holds", async () => {
    renderShell();
    const button = await screen.findByRole("button", { name: "Open the assistant" });
    expect(button.closest("header")).not.toBeNull();
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByRole("complementary")).toBeInTheDocument();
    });
  });
});
