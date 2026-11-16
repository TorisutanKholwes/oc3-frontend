import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import i18n from "@/i18n";
import { UserIdentities } from "./UserIdentities";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const ISSUER = "https://idp.example.com/application/o/oc3/";

describe("the identities of a user", () => {
  let callerRoles: string[];
  let targetRoles: string[];
  let oidc: boolean;
  let posted: { path: string; body: unknown }[];
  let deleted: string[];

  beforeEach(() => {
    void i18n.changeLanguage("en");
    callerRoles = ["UserManager"];
    targetRoles = [];
    oidc = true;
    posted = [];
    deleted = [];
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async (input) => {
        const request = input instanceof Request ? input : new Request(String(input));
        const path = new URL(request.url).pathname.replace(/^\/api/, "");
        if (request.method === "POST") {
          posted.push({ path, body: await request.json() });
          return json({ data: [] });
        }
        if (request.method === "DELETE") {
          deleted.push(path);
          return json({ info: "unlinked" });
        }
        switch (path) {
          case "/auth/info":
            return json({
              basic: true,
              oidc: { enabled: oidc, ready: oidc, issuer: oidc ? ISSUER : "" },
            });
          case "/users/self/groups":
            return json({
              data: callerRoles.map((role, i) => ({ id: i + 1, role, privilege: "T" })),
            });
          case "/users/7/groups":
            return json({
              data: targetRoles.map((role, i) => ({ id: i + 10, role, privilege: "T" })),
            });
          case "/users/7/identities":
            return json({
              data: [
                {
                  id: 3,
                  user_id: 7,
                  issuer: ISSUER,
                  subject: "e80d0616",
                  created: "2026-11-16 14:00:00",
                },
              ],
            });
        }
        return json({ text: "not found" }, 404);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderIdentities() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <UserIdentities userId="7" email="robot@example.com" />
      </QueryClientProvider>,
    );
  }

  test("lists the identities and links one by its subject", async () => {
    renderIdentities();
    expect(await screen.findByText("e80d0616")).toBeInTheDocument();
    expect(screen.getByText("Never signed in through the browser.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Subject (sub claim) of the identity to link"), {
      target: { value: " abc123 " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Link the identity" }));
    await waitFor(() => {
      expect(posted).toEqual([{ path: "/users/7/identities", body: { subject: "abc123" } }]);
    });
  });

  test("unlinks an identity once confirmed", async () => {
    renderIdentities();
    await screen.findByText("e80d0616");
    fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
    expect(deleted).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Unlink" }));
    await waitFor(() => {
      expect(deleted).toEqual(["/users/7/identities/3"]);
    });
  });

  test("is not offered to a UserManager on the account of a Manager", async () => {
    targetRoles = ["Manager"];
    renderIdentities();
    await waitFor(() => {
      expect(screen.queryByText("Identity provider")).not.toBeInTheDocument();
    });
    // the account's teams are read before deciding
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Identity provider")).not.toBeInTheDocument();
  });

  test("is not offered without an identity provider", async () => {
    oidc = false;
    renderIdentities();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByText("Identity provider")).not.toBeInTheDocument();
  });
});
