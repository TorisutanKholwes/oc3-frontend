import { useId, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { TrashIcon } from "@/components/ui/icons";
import {
  AUTHORIZATIONS_KEY,
  SECURE_PATTERNS_KEY,
  createAuthorization,
  createSecurePattern,
  deleteAuthorization,
  deleteSecurePattern,
  nameOrId,
  useAuthorizationFiltersets,
  useAuthorizationTeams,
  useAuthorizations,
  useSecurePatterns,
} from "./sysreport-access-api";

const INPUT = "h-7 w-full rounded-(--radius-control) border border-line bg-surface px-2 font-mono";
const SUBMIT =
  "h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-60";
const CELL = "px-3 py-1.5";

/** The state of a list read: loading, failed, empty, or its table. */
function ListState({
  query,
  empty,
  children,
}: {
  query: { isPending: boolean; isError: boolean; error: Error | null; data?: unknown[] };
  empty: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (query.isPending) return <p className="text-ink-muted">{t("list.loading")}</p>;
  if (query.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {query.error?.message}
      </p>
    );
  if (query.data === undefined || query.data.length === 0)
    return <p className="text-ink-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-(--radius-panel) border border-line bg-surface-raised">
      {children}
    </div>
  );
}

function HeaderRow({ keys }: { keys: string[] }) {
  const { t } = useTranslation();
  return (
    <thead>
      <tr className="border-b border-line text-left text-ink-muted">
        {keys.map((key) => (
          <th key={key} scope="col" className={`${CELL} font-medium whitespace-nowrap`}>
            {key === "" ? (
              <span className="sr-only">{t("sysreportAccess.actions")}</span>
            ) : (
              t(`sysreportAccess.fields.${key}`)
            )}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/** Deletes a row after a confirmation, saying why it failed. */
function DeleteCell({
  question,
  onDelete,
  invalidate,
}: {
  question: string;
  onDelete: () => Promise<void>;
  invalidate: readonly string[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: onDelete,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: invalidate });
    },
  });
  return (
    <td className={`${CELL} text-right whitespace-nowrap`}>
      <ConfirmButton
        inline
        label={t("sysreportAccess.delete")}
        question={question}
        confirmLabel={t("sysreportAccess.deleteConfirm")}
        cancelLabel={t("designer.cancel")}
        pendingLabel={t("sysreportAccess.deleting")}
        pending={remove.isPending}
        icon={<TrashIcon className="h-3.5 w-3.5" />}
        onConfirm={() => {
          remove.mutate();
        }}
      />
      {remove.isError && (
        <p role="alert" className="mt-1 text-left text-state-down">
          ■ {remove.error.message}
        </p>
      )}
    </td>
  );
}

/** The secure patterns: the files only the managers and the node responsibles see. */
function SecurePatterns() {
  const { t } = useTranslation();
  const id = useId();
  const queryClient = useQueryClient();
  const patterns = useSecurePatterns();
  const [pattern, setPattern] = useState("");
  const create = useMutation({
    mutationFn: () => createSecurePattern(pattern),
    onSuccess: async () => {
      setPattern("");
      await queryClient.invalidateQueries({ queryKey: SECURE_PATTERNS_KEY });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <section aria-labelledby={`${id}-title`} className="mb-6 max-w-4xl">
      <h2 id={`${id}-title`} className="mb-1 font-semibold">
        {t("sysreportAccess.secure.title")}
      </h2>
      <p className="mb-3 text-ink-muted">{t("sysreportAccess.secure.intro")}</p>
      <form onSubmit={onSubmit} className="mb-3 flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1">
          <label htmlFor={`${id}-pattern`} className="mb-1 block font-medium">
            {t("sysreportAccess.fields.pattern")}
          </label>
          <input
            id={`${id}-pattern`}
            value={pattern}
            onChange={(event) => {
              setPattern(event.target.value);
            }}
            placeholder=".*/etc/shadow"
            className={INPUT}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          disabled={create.isPending || pattern.trim() === ""}
          className={SUBMIT}
        >
          {create.isPending ? t("sysreportAccess.adding") : t("sysreportAccess.add")}
        </button>
      </form>
      {create.isError && (
        <p role="alert" className="mb-3 text-state-down">
          ■ {create.error.message}
        </p>
      )}
      <ListState query={patterns} empty={t("sysreportAccess.secure.empty")}>
        <table className="w-full border-collapse text-data">
          <caption className="sr-only">{t("sysreportAccess.secure.title")}</caption>
          <HeaderRow keys={["pattern", ""]} />
          <tbody>
            {(patterns.data ?? []).map((row) => (
              <tr key={row.id} className="border-b border-line/60 align-top last:border-b-0">
                <td className={CELL}>
                  <code className="whitespace-pre">{row.pattern}</code>
                </td>
                <DeleteCell
                  question={t("sysreportAccess.secure.deleteQuestion", { pattern: row.pattern })}
                  onDelete={() => deleteSecurePattern(row.id ?? 0)}
                  invalidate={SECURE_PATTERNS_KEY}
                />
              </tr>
            ))}
          </tbody>
        </table>
      </ListState>
    </section>
  );
}

/** The authorizations: a team sees the sensitive files of the nodes of a filterset. */
function Authorizations() {
  const { t } = useTranslation();
  const id = useId();
  const queryClient = useQueryClient();
  const authorizations = useAuthorizations();
  const teams = useAuthorizationTeams();
  const filtersets = useAuthorizationFiltersets();
  const [groupId, setGroupId] = useState("");
  const [fsetId, setFsetId] = useState("");
  const [pattern, setPattern] = useState("");
  const create = useMutation({
    mutationFn: () => createAuthorization(Number(groupId), Number(fsetId), pattern),
    onSuccess: async () => {
      setPattern("");
      await queryClient.invalidateQueries({ queryKey: AUTHORIZATIONS_KEY });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <section aria-labelledby={`${id}-title`} className="mb-6 max-w-4xl">
      <h2 id={`${id}-title`} className="mb-1 font-semibold">
        {t("sysreportAccess.allow.title")}
      </h2>
      <p className="mb-3 text-ink-muted">{t("sysreportAccess.allow.intro")}</p>
      <form onSubmit={onSubmit} className="mb-3 flex flex-wrap items-end gap-2">
        <div className="w-48">
          <label htmlFor={`${id}-team`} className="mb-1 block font-medium">
            {t("sysreportAccess.fields.group_name")}
          </label>
          <Combobox
            id={`${id}-team`}
            options={(teams.data ?? []).map((g) => ({ value: String(g.id), label: g.name }))}
            value={groupId}
            onChange={setGroupId}
            label={t("sysreportAccess.fields.group_name")}
            placeholder={t("sysreportAccess.allow.pickTeam")}
            emptyText={t("compEditor.noMatch")}
            className="w-full"
          />
        </div>
        <div className="w-48">
          <label htmlFor={`${id}-fset`} className="mb-1 block font-medium">
            {t("sysreportAccess.fields.fset_name")}
          </label>
          <Combobox
            id={`${id}-fset`}
            options={(filtersets.data ?? []).map((f) => ({ value: String(f.id), label: f.name }))}
            value={fsetId}
            onChange={setFsetId}
            label={t("sysreportAccess.fields.fset_name")}
            placeholder={t("sysreportAccess.allow.pickFilterset")}
            emptyText={t("compEditor.noMatch")}
            className="w-full"
          />
        </div>
        <div className="min-w-48 flex-1">
          <label htmlFor={`${id}-pattern`} className="mb-1 block font-medium">
            {t("sysreportAccess.fields.pattern")}
          </label>
          <input
            id={`${id}-pattern`}
            value={pattern}
            onChange={(event) => {
              setPattern(event.target.value);
            }}
            placeholder="/etc/.*"
            className={INPUT}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <button
          type="submit"
          disabled={create.isPending || groupId === "" || fsetId === "" || pattern.trim() === ""}
          className={SUBMIT}
        >
          {create.isPending ? t("sysreportAccess.adding") : t("sysreportAccess.add")}
        </button>
      </form>
      {create.isError && (
        <p role="alert" className="mb-3 text-state-down">
          ■ {create.error.message}
        </p>
      )}
      <ListState query={authorizations} empty={t("sysreportAccess.allow.empty")}>
        <table className="w-full border-collapse text-data">
          <caption className="sr-only">{t("sysreportAccess.allow.title")}</caption>
          <HeaderRow keys={["group_name", "fset_name", "pattern", ""]} />
          <tbody>
            {(authorizations.data ?? []).map((row) => {
              const team = nameOrId(row.group_name, row.group_id);
              const fset = nameOrId(row.fset_name, row.fset_id);
              return (
                <tr key={row.id} className="border-b border-line/60 align-top last:border-b-0">
                  <td className={CELL}>{team}</td>
                  <td className={CELL}>{fset}</td>
                  <td className={CELL}>
                    <code className="whitespace-pre">{row.pattern}</code>
                  </td>
                  <DeleteCell
                    question={t("sysreportAccess.allow.deleteQuestion", {
                      team,
                      filterset: fset,
                      pattern: row.pattern,
                    })}
                    onDelete={() => deleteAuthorization(row.id ?? 0)}
                    invalidate={AUTHORIZATIONS_KEY}
                  />
                </tr>
              );
            })}
          </tbody>
        </table>
      </ListState>
    </section>
  );
}

/**
 * Who sees the sensitive files of the sysreports: the secure patterns say which
 * files are sensitive, the authorizations which teams see them on which nodes, the
 * managers and the node responsibles seeing them all. Manager only, as the api's
 * writes.
 */
export function SysreportAccessPage() {
  const { t } = useTranslation();
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="sysreportAccess" className="h-5 w-5" />
          {t("sysreportAccess.title")}
        </h1>
      </div>
      <p className="mb-4 max-w-3xl text-ink-muted">{t("sysreportAccess.intro")}</p>
      <SecurePatterns />
      <Authorizations />
    </section>
  );
}
