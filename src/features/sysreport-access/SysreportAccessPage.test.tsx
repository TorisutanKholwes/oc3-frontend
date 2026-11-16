import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { SysreportAccessPage } from "./SysreportAccessPage";
import { nameOrId, organizationalTeams } from "./sysreport-access-api";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("the teams an authorization may name", () => {
  test("are the organizational ones, without Everybody nor the private teams", () => {
    expect(
      organizationalTeams([
        { id: 1, role: "Manager", privilege: "T" },
        { id: 2, role: "Ops", privilege: "F" },
        { id: 3, role: "Everybody", privilege: "F" },
        { id: 4, role: "user_12", privilege: "F" },
        { id: 5, role: "Dba" },
        { role: "noid" },
      ]),
    ).toEqual([
      { id: 2, name: "Ops" },
      { id: 5, name: "Dba" },
    ]);
  });

  test("a group or filterset gone reads as its id", () => {
    expect(nameOrId("Ops", 2)).toBe("Ops");
    expect(nameOrId("", 2)).toBe("#2");
    expect(nameOrId(undefined, 7)).toBe("#7");
  });
});

describe("the sysreport access page", () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
  let posted: { path: string; body: unknown }[];
  let deleted: string[];

  beforeEach(() => {
    void i18n.changeLanguage("en");
    posted = [];
    deleted = [];
    fetchMock = vi.fn<typeof fetch>(async (input) => {
      const request = input instanceof Request ? input : new Request(String(input));
      const path = new URL(request.url).pathname.replace(/^\/api/, "");
      if (request.method === "POST") {
        const body: unknown = await request.json();
        posted.push({ path, body });
        if (path === "/sysreport/secure_patterns")
          return json({ text: "secure pattern already exists: 1" }, 409);
        return json({ data: [] });
      }
      if (request.method === "DELETE") {
        deleted.push(path);
        return json({ info: "deleted" });
      }
      switch (path) {
        case "/sysreport/secure_patterns":
          return json({ data: [{ id: 1, pattern: ".*/etc/shadow" }] });
        case "/sysreport/authorizations":
          return json({
            data: [
              {
                id: 3,
                group_id: 2,
                group_name: "Ops",
                fset_id: 10,
                fset_name: "linux",
                pattern: "/etc/.*",
              },
            ],
          });
        case "/groups":
          return json({ data: [{ id: 2, role: "Ops", privilege: "F" }] });
        case "/filtersets":
          return json({ data: [{ id: 10, fset_name: "linux" }] });
      }
      return json({ text: "not found" }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderPage() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <SysreportAccessPage />
      </QueryClientProvider>,
    );
  }

  test("lists the secure patterns and the authorizations", async () => {
    renderPage();
    const patterns = await screen.findByRole("table", { name: "Secure patterns" });
    expect(within(patterns).getByText(".*/etc/shadow")).toBeInTheDocument();
    const allows = await screen.findByRole("table", { name: "Authorizations" });
    expect(within(allows).getByText("Ops")).toBeInTheDocument();
    expect(within(allows).getByText("linux")).toBeInTheDocument();
    expect(within(allows).getByText("/etc/.*")).toBeInTheDocument();
  });

  test("says why a secure pattern is refused", async () => {
    renderPage();
    const section = (await screen.findByRole("heading", { name: "Secure patterns" })).closest(
      "section",
    );
    if (section === null) throw new Error("no section");
    fireEvent.change(within(section).getByLabelText("Pattern"), {
      target: { value: ".*/etc/shadow" },
    });
    fireEvent.click(within(section).getByRole("button", { name: "Add" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent(
      "secure pattern already exists: 1",
    );
    expect(posted).toEqual([
      { path: "/sysreport/secure_patterns", body: { pattern: ".*/etc/shadow" } },
    ]);
  });

  test("deletes an authorization once confirmed", async () => {
    renderPage();
    const allows = await screen.findByRole("table", { name: "Authorizations" });
    fireEvent.click(within(allows).getByRole("button", { name: "Delete" }));
    expect(deleted).toEqual([]);
    // Armed, the button asks the question, its confirmation in place of it.
    expect(
      within(allows).getByText(/Delete the authorization of Ops on linux/),
    ).toBeInTheDocument();
    fireEvent.click(within(allows).getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(deleted).toEqual(["/sysreport/authorizations/3"]);
    });
  });
});
