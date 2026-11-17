import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Assistant } from "../Assistant";
import { AskAssistantLink } from "../AskAssistantLink";
import { AssistantChatProvider } from "../assistant-chat-context";
import { AssistantDock, AssistantDockButton } from "../AssistantDock";
import type { RunResult } from "../assistant-client";
import { replayRun } from "./agui-fixtures";
import { completed, fakeClient, started, text, type FakeClient } from "./fake-client";

const question = "Analyze the alert “check out of bounds” on par-dev-app02.";
const dock = () => screen.getByRole("complementary");
const dockBox = () => within(dock()).getByRole("textbox", { name: "Message to the assistant" });
const link = () => screen.getByRole("link", { name: "Analyze with the assistant" });

/** A record panel as SlideOver is: not modal, closed by Escape anywhere, inert once closed. */
function RecordPanelStub() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  return (
    <div role="dialog" aria-modal="false" aria-label="record" inert={!open}>
      panel
    </div>
  );
}

/**
 * The application as far as the dock goes: the chat held above the pages, a page
 * with a record and its link to the assistant, the page of the assistant, and
 * the dock over them.
 */
function renderApp(
  client: FakeClient,
  {
    link = true,
    panel = false,
    path = "/",
  }: { link?: boolean; panel?: boolean; path?: string } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({
    component: () => (
      <AssistantChatProvider client={client} identity="alice">
        <AssistantDockButton />
        <Outlet />
        <AssistantDock />
      </AssistantChatProvider>
    ),
  });
  const record = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => (
      <section aria-label="alert">
        {link && <AskAssistantLink prompt={question} />}
        {panel && <RecordPanelStub />}
      </section>
    ),
  });
  const page = createRoute({
    getParentRoute: () => rootRoute,
    path: "/ai",
    component: () => <Assistant client={client} />,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([record, page]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

/** Opens the dock from the link of the record, the question in its box. */
async function openFromRecord() {
  fireEvent.click(await screen.findByRole("link", { name: "Analyze with the assistant" }));
  await waitFor(() => {
    expect(dockBox()).toHaveValue(question);
  });
}

describe("the dock of the assistant", () => {
  let client: FakeClient;
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  beforeEach(() => {
    // The status of the assistant, and the lists the answers read the records from.
    fetchMock = vi.fn<typeof fetch>((input) => {
      const url = new URL(
        input instanceof Request ? input.url : String(input),
        window.location.href,
      );
      if (url.pathname === "/api/assistant/status")
        return Promise.resolve(Response.json({ enabled: true, available: true }));
      return Promise.resolve(Response.json({ data: [] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    client = fakeClient([{ id: "existing", title: "Previous diagnostic" }]);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("opens over the record with the question in its box, nothing sent", async () => {
    const router = renderApp(client);
    await openFromRecord();
    expect(router.state.location.pathname).toBe("/");
    expect(screen.getByRole("region", { name: "alert" })).toBeInTheDocument();
    expect(client.run).not.toHaveBeenCalled();
    expect(client.createConversation).not.toHaveBeenCalled();
  });

  test("leaves a click with a modifier to the link", async () => {
    const router = renderApp(client);
    // The browser would open the link in another tab; jsdom cannot.
    const leave = (event: MouseEvent) => {
      event.preventDefault();
    };
    document.addEventListener("click", leave);
    fireEvent.click(await screen.findByRole("link", { name: "Analyze with the assistant" }), {
      ctrlKey: true,
    });
    document.removeEventListener("click", leave);
    // The browser opens the page in another tab: the dock stays folded.
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(router.state.location.pathname).toBe("/");
  });

  test("drops a question asked while a turn runs, and says so", async () => {
    let finish: (result: RunResult) => void = () => undefined;
    client.run.mockImplementation(
      (_id, _input, options) =>
        new Promise<RunResult>((resolve) => {
          options?.onEvent?.(started());
          finish = (result) => {
            for (const event of text("Checked.")) options?.onEvent?.(event);
            resolve(result);
          };
        }),
    );
    renderApp(client);
    await openFromRecord();
    fireEvent.click(within(dock()).getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(within(dock()).getByRole("button", { name: "Stop" })).toBeInTheDocument();
    });
    fireEvent.click(link());
    expect(
      await within(dock()).findByText(/The question prepared was not taken/),
    ).toBeInTheDocument();
    expect(dockBox()).toHaveValue("");
    await act(async () => {
      finish(completed());
      await Promise.resolve();
    });
  });

  test("is not shown on the page of the assistant", async () => {
    const router = renderApp(client);
    await openFromRecord();
    await act(async () => {
      await router.navigate({ to: "/ai" });
    });
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "New conversation" })[0]).toBeEnabled();
    });
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  test("expands to the page, the conversation and the message typed kept", async () => {
    const router = renderApp(client);
    await openFromRecord();
    fireEvent.change(dockBox(), { target: { value: `${question} Since when?` } });
    fireEvent.click(within(dock()).getByRole("button", { name: "Open in the assistant page" }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/ai");
    });
    expect(screen.queryByRole("complementary")).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("textbox", { name: "Message to the assistant" })).toHaveValue(
        `${question} Since when?`,
      );
    });
    // The same chat: nothing read again, nothing sent.
    expect(client.listConversations).toHaveBeenCalledOnce();
    expect(client.run).not.toHaveBeenCalled();
    // A move, not an end: back on another page, the dock is there, folded.
    await act(async () => {
      await router.navigate({ to: "/" });
    });
    expect(await screen.findByRole("button", { name: "Open the assistant" })).toBeInTheDocument();
  });

  test("names an action waiting, to reject, or to decide on in the card of the page", async () => {
    // The golden confirmation expires on 2026-10-09 at 17:45.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-09T17:00:00Z") });
    client.run.mockImplementationOnce(replayRun("confirmation_preview_action"));
    renderApp(client);
    await openFromRecord();
    fireEvent.click(within(dock()).getByRole("button", { name: "Send" }));
    const waiting = await within(dock()).findByRole("group", {
      name: "Action waiting for a decision",
    });
    await waitFor(() => {
      expect(within(waiting).getByRole("button", { name: "Reject" })).toBeEnabled();
    });
    // Approved in the card of the page only, never from the dock itself.
    expect(within(dock()).queryByRole("button", { name: /Approve/ })).toBeNull();
    fireEvent.click(within(waiting).getByRole("button", { name: "Decide on it" }));
    const card = await screen.findByRole("dialog", { name: /^Decide on the action/ });
    expect(within(card).getByRole("button", { name: /Approve/ })).toBeInTheDocument();
    // Over the page, which stays: the record, not the page of the assistant.
    expect(screen.getByRole("region", { name: "alert" })).toBeInTheDocument();
    fireEvent.keyDown(card, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /^Decide on the action/ })).toBeNull();
    });
    expect(dock()).toBeInTheDocument();
  });

  test("approves the action waiting in the card over the page, and goes on there", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-09T17:00:00Z") });
    client.run
      .mockImplementationOnce(replayRun("confirmation_preview_action"))
      .mockImplementationOnce(replayRun("resume_approved"));
    const router = renderApp(client);
    await openFromRecord();
    fireEvent.click(within(dock()).getByRole("button", { name: "Send" }));
    const waiting = await within(dock()).findByRole("group", {
      name: "Action waiting for a decision",
    });
    fireEvent.click(within(waiting).getByRole("button", { name: "Decide on it" }));
    const card = await screen.findByRole("dialog", { name: /^Decide on the action/ });
    await waitFor(() => {
      expect(within(card).getByRole("button", { name: /^Approve/ })).toBeEnabled();
    });
    fireEvent.click(within(card).getByRole("button", { name: /^Approve/ }));
    await waitFor(() => {
      expect(client.run).toHaveBeenCalledTimes(2);
    });
    const resumed = client.run.mock.calls[1]?.[1];
    expect(resumed !== undefined && "resume" in resumed ? resumed.resume : undefined).toMatchObject(
      {
        approved: true,
      },
    );
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: /^Decide on the action/ })).toBeNull();
    });
    expect(router.state.location.pathname).toBe("/");
    expect(dock()).toBeInTheDocument();
  });

  test("folds on Escape, the focus back on the link that opened it", async () => {
    renderApp(client);
    await openFromRecord();
    fireEvent.keyDown(dockBox(), { key: "Escape" });
    await waitFor(() => {
      expect(link()).toHaveFocus();
    });
    expect(screen.queryByRole("complementary")).toBeNull();
    expect(screen.getByRole("button", { name: "Open the assistant" })).toBeInTheDocument();
  });

  test("tells, folded, that a turn ended meanwhile", async () => {
    let finish: (result: RunResult) => void = () => undefined;
    client.run.mockImplementation(
      (_id, _input, options) =>
        new Promise<RunResult>((resolve) => {
          options?.onEvent?.(started());
          finish = (result) => {
            for (const event of text("Checked.")) options?.onEvent?.(event);
            resolve(result);
          };
        }),
    );
    renderApp(client);
    await openFromRecord();
    fireEvent.click(within(dock()).getByRole("button", { name: "Send" }));
    fireEvent.click(await within(dock()).findByRole("button", { name: "Fold" }));
    expect(
      await screen.findByRole("button", {
        name: "Open the assistant · The assistant is answering",
      }),
    ).toBeInTheDocument();
    await act(async () => {
      finish(completed());
      await Promise.resolve();
    });
    expect(
      await screen.findByRole("button", {
        name: "Open the assistant · The assistant has finished",
      }),
    ).toBeInTheDocument();
  });

  test("opens and folds from its button of the top bar, which it leaves without the focus", async () => {
    renderApp(client, { link: false });
    const button = await screen.findByRole("button", { name: "Open the assistant" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    await waitFor(() => {
      expect(dockBox()).toBeEnabled();
    });
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(button).toHaveAccessibleName("Fold the assistant");
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.queryByRole("complementary")).toBeNull();
    });
    fireEvent.click(button);
    await waitFor(() => {
      expect(dockBox()).toBeEnabled();
    });
    // Folded with Escape, the focus leaves with it: the button is not ringed.
    fireEvent.keyDown(dockBox(), { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("complementary")).toBeNull();
    });
    expect(button).not.toHaveFocus();
  });

  test("opens with the key a out of a field, and folds with it", async () => {
    renderApp(client, { link: false });
    const button = await screen.findByRole("button", { name: "Open the assistant" });
    fireEvent.keyDown(document.body, { key: "a" });
    await waitFor(() => {
      expect(dockBox()).toBeEnabled();
    });
    // Typed in the message box, the key is a letter.
    fireEvent.keyDown(dockBox(), { key: "a" });
    expect(dock()).toBeInTheDocument();
    button.focus();
    fireEvent.keyDown(button, { key: "a" });
    await waitFor(() => {
      expect(screen.queryByRole("complementary")).toBeNull();
    });
    // With Ctrl, the key is the browser's.
    fireEvent.keyDown(document.body, { key: "a", ctrlKey: true });
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  test("folds on Escape from the page, once the panel over it is closed", async () => {
    renderApp(client, { link: false, panel: true });
    fireEvent.click(await screen.findByRole("button", { name: "Open the assistant" }));
    await waitFor(() => {
      expect(dockBox()).toBeEnabled();
    });
    act(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(screen.getByText("panel").closest('[role="dialog"]')).toHaveAttribute("inert");
    });
    expect(dock()).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("complementary")).toBeNull();
    });
  });

  test("gives the focus back to the row it was opened from with the key a", async () => {
    renderApp(client, { link: false });
    await screen.findByRole("button", { name: "Open the assistant" });
    const row = document.createElement("button");
    row.textContent = "a row";
    document.body.appendChild(row);
    try {
      row.focus();
      fireEvent.keyDown(row, { key: "a" });
      await waitFor(() => {
        expect(dockBox()).toHaveFocus();
      });
      fireEvent.keyDown(dockBox(), { key: "Escape" });
      await waitFor(() => {
        expect(screen.queryByRole("complementary")).toBeNull();
      });
      expect(row).toHaveFocus();
    } finally {
      row.remove();
    }
  });

  test("leaves Escape to a dialog open over the page, such as the one of the Designer", async () => {
    renderApp(client, { link: false });
    fireEvent.click(await screen.findByRole("button", { name: "Open the assistant" }));
    await waitFor(() => {
      expect(dockBox()).toBeEnabled();
    });
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    document.body.appendChild(dialog);
    try {
      act(() => {
        (document.activeElement as HTMLElement | null)?.blur();
      });
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(dock()).toBeInTheDocument();
    } finally {
      dialog.remove();
    }
  });

  test("leaves Escape to the left-hand menu", async () => {
    renderApp(client, { link: false });
    fireEvent.click(await screen.findByRole("button", { name: "Open the assistant" }));
    await waitFor(() => {
      expect(dockBox()).toBeEnabled();
    });
    const menu = document.createElement("nav");
    menu.id = "app-sidebar";
    const entry = document.createElement("a");
    entry.href = "/nodes";
    menu.appendChild(entry);
    document.body.appendChild(menu);
    try {
      entry.focus();
      fireEvent.keyDown(entry, { key: "Escape" });
      expect(dock()).toBeInTheDocument();
    } finally {
      menu.remove();
    }
  });

  test("moves along the bottom, by its handle, and remembers where", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("40rem"),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    localStorage.removeItem("oc3.assistant.dock.right");
    try {
      renderApp(client, { link: false });
      fireEvent.click(await screen.findByRole("button", { name: "Open the assistant" }));
      const handle = within(dock()).getByRole("button", { name: /^Move the assistant/ });
      fireEvent.keyDown(handle, { key: "ArrowLeft" });
      fireEvent.keyDown(handle, { key: "ArrowLeft" });
      expect(dock().style.right).toBe("80px");
      expect(localStorage.getItem("oc3.assistant.dock.right")).toBe("80");
      fireEvent.keyDown(handle, { key: "ArrowRight" });
      expect(dock().style.right).toBe("48px");
      fireEvent.click(screen.getByRole("button", { name: "Fold the assistant" }));
      await waitFor(() => {
        expect(screen.queryByRole("complementary")).toBeNull();
      });
      fireEvent.click(screen.getByRole("button", { name: "Open the assistant" }));
      await waitFor(() => {
        expect(dock().style.right).toBe("48px");
      });
      fireEvent.keyDown(within(dock()).getByRole("button", { name: /^Move the assistant/ }), {
        key: "Home",
      });
      expect(dock().style.right).toBe("");
      expect(localStorage.getItem("oc3.assistant.dock.right")).toBeNull();
    } finally {
      localStorage.removeItem("oc3.assistant.dock.right");
    }
  });

  test("has no handle on a narrow window, where it takes the width", async () => {
    renderApp(client, { link: false });
    fireEvent.click(await screen.findByRole("button", { name: "Open the assistant" }));
    await waitFor(() => {
      expect(dockBox()).toBeEnabled();
    });
    expect(within(dock()).queryByRole("button", { name: /^Move the assistant/ })).toBeNull();
  });

  test("keeps its button greyed on the page of the assistant", async () => {
    renderApp(client, { link: false, path: "/ai" });
    expect(
      await screen.findByRole("button", { name: "The assistant is on this page" }),
    ).toBeDisabled();
  });

  test("keeps its button greyed while the user cannot use the assistant", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        Response.json({ enabled: true, available: false, reason: "password_sign_in" }),
      ),
    );
    renderApp(client, { link: false });
    const button = await screen.findByRole("button", {
      name: "The assistant is not available: see its page",
    });
    expect(button).toBeDisabled();
    fireEvent.keyDown(document.body, { key: "a" });
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  test("shows no button where oc3 names no agent", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(Response.json({ enabled: false, available: false, reason: "disabled" })),
    );
    renderApp(client, { link: false });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(screen.queryByRole("button", { name: /assistant/i })).toBeNull();
  });

  test("is there, folded, on every page, reading nothing of the chat", async () => {
    renderApp(client, { link: false });
    fireEvent.click(await screen.findByRole("button", { name: "Open the assistant" }));
    expect(dock()).toBeInTheDocument();
    fireEvent.click(within(dock()).getByRole("button", { name: "Fold" }));
    expect(await screen.findByRole("button", { name: "Open the assistant" })).toBeInTheDocument();
  });

  test("reads only the status of the assistant until it opens", async () => {
    renderApp(client, { link: false });
    await screen.findByRole("button", { name: "Open the assistant" });
    const paths = fetchMock.mock.calls.map(
      ([input]) =>
        new URL(input instanceof Request ? input.url : String(input), window.location.href)
          .pathname,
    );
    expect(paths).toEqual(["/api/assistant/status"]);
    expect(client.listConversations).not.toHaveBeenCalled();
  });

  test("opened while the chat is read, takes the focus, then gives it to the message box", async () => {
    let listed: (conversations: { id: string; title: string }[]) => void = () => undefined;
    client.listConversations.mockImplementation(
      () =>
        new Promise((resolve) => {
          listed = resolve;
        }),
    );
    renderApp(client);
    fireEvent.click(await screen.findByRole("button", { name: "Open the assistant" }));
    expect(within(dock()).getByRole("heading", { name: "AI assistant" })).toHaveFocus();
    await act(async () => {
      listed([]);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(dockBox()).toHaveFocus();
    });
  });
});
