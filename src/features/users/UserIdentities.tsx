import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { components } from "@/lib/api/schema";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { useAuthInfo } from "@/lib/api/auth-info";
import { useImpersonation } from "@/lib/api/impersonation";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { DateTime } from "@/components/ui/DateTime";
import { TrashIcon } from "@/components/ui/icons";
import { useUserGroups } from "./use-user-groups";

type IdentityRow = components["schemas"]["UserIdentityRow"];

const INPUT = "h-8 w-full rounded-(--radius-control) border border-line bg-surface px-2";

/**
 * The identities of the provider linked to the account: an access token of one
 * of them signs in as the account. A browser sign-in links its identity by
 * itself; a service account of the provider, used by an automation, never signs
 * in that way and is linked here, by the `sub` claim of its tokens.
 *
 * Offered as the server accepts it: with an OpenID Connect provider, to a
 * UserManager (a Manager having it too), on a Manager's account to a Manager
 * only, and not while impersonating.
 */
export function UserIdentities({ userId, email }: { userId: string; email: string }) {
  const { t } = useTranslation();
  const id = useId();
  const queryClient = useQueryClient();
  const impersonation = useImpersonation();
  const issuer = useAuthInfo().data?.oidc.issuer ?? "";
  const mine = useUserGroups("self");
  const theirs = useUserGroups(userId);
  const callerIsManager = mine.data?.some((g) => g.role === "Manager") ?? false;
  const callerMay = callerIsManager || (mine.data?.some((g) => g.role === "UserManager") ?? false);
  const targetIsManager = theirs.data?.some((g) => g.role === "Manager") ?? false;
  const allowed =
    issuer !== "" &&
    callerMay &&
    impersonation === null &&
    theirs.isSuccess &&
    (!targetIsManager || callerIsManager);

  const key = ["user", userId, "identities"];
  const identities = useQuery({
    queryKey: key,
    enabled: allowed,
    queryFn: async () => {
      const { data, error } = await api.GET("/users/{user_id}/identities", {
        params: { path: { user_id: userId }, query: { limit: 0 } },
      });
      if (error !== undefined) throw new Error(problemText(error));
      const rows: IdentityRow[] = Array.isArray(data.data) ? data.data : [];
      return rows;
    },
  });

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: key });
    // A linked account has its password at the provider.
    await queryClient.invalidateQueries({ queryKey: ["user", userId, "oidc_linked"] });
  }

  const [subject, setSubject] = useState("");
  const link = useMutation({
    mutationFn: async (sub: string) => {
      const { error } = await api.POST("/users/{user_id}/identities", {
        params: { path: { user_id: userId } },
        body: { subject: sub },
      });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: async () => {
      setSubject("");
      await refresh();
    },
  });
  const unlink = useMutation({
    mutationFn: async (identityId: number) => {
      const { error } = await api.DELETE("/users/{user_id}/identities/{identity_id}", {
        params: { path: { user_id: userId, identity_id: String(identityId) } },
      });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: refresh,
  });

  if (!allowed) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    const sub = subject.trim();
    if (sub !== "") link.mutate(sub);
  }

  const rows = identities.data ?? [];
  return (
    <section className="border-t border-line pt-3" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="font-medium">
        {t("users.identities.title")}
      </h3>
      <p className="mt-1 text-ink-muted">{t("users.identities.hint", { issuer })}</p>
      {identities.isError && (
        <p role="alert" className="mt-2 text-state-down">
          ■ {identities.error.message}
        </p>
      )}
      {identities.isSuccess && rows.length === 0 && (
        <p className="mt-2 text-ink-muted">{t("users.identities.none")}</p>
      )}
      {rows.length > 0 && (
        <ul className="mt-2 space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="rounded-(--radius-control) border border-line p-2">
              <p className="font-mono break-all">{row.subject}</p>
              {row.issuer !== issuer && <p className="break-all text-ink-muted">{row.issuer}</p>}
              <p className="text-ink-muted">
                {row.last_login === undefined || row.last_login === "" ? (
                  t("users.identities.neverSignedIn")
                ) : (
                  <>
                    {t("users.identities.lastSignIn")} <DateTime value={row.last_login} />
                  </>
                )}
              </p>
              {row.id !== undefined && (
                <div className="mt-1">
                  <ConfirmButton
                    icon={<TrashIcon />}
                    label={t("users.identities.unlink")}
                    question={t("users.identities.unlinkQuestion", { subject: row.subject, email })}
                    confirmLabel={t("users.identities.unlinkConfirm")}
                    cancelLabel={t("detail.cancel")}
                    pendingLabel={t("users.identities.unlinking")}
                    pending={unlink.isPending && unlink.variables === row.id}
                    onConfirm={() => {
                      if (row.id !== undefined) unlink.mutate(row.id);
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {unlink.isError && (
        <p role="alert" className="mt-2 text-state-down">
          ■ {unlink.error.message}
        </p>
      )}
      <form onSubmit={submit} className="mt-3 space-y-2">
        <label htmlFor={`${id}-subject`} className="block text-ink-muted">
          {t("users.identities.subject")}
        </label>
        <input
          id={`${id}-subject`}
          value={subject}
          onChange={(event) => {
            setSubject(event.target.value);
          }}
          maxLength={255}
          spellCheck={false}
          autoComplete="off"
          className={`${INPUT} font-mono`}
        />
        <button
          type="submit"
          disabled={subject.trim() === "" || link.isPending}
          className="h-8 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60"
        >
          {t("users.identities.link")}
        </button>
        {link.isError && (
          <p role="alert" className="text-state-down">
            ■ {link.error.message}
          </p>
        )}
      </form>
    </section>
  );
}
