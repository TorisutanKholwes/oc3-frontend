import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { problemText } from "@/lib/api/problem";
import { ChangeOutcomeLine } from "@/components/opensvc/CompEditorParts";
import { COMP_BUTTON, useChanges } from "@/components/opensvc/comp-changes";
import { Combobox } from "@/components/ui/Combobox";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { PencilIcon, TrashIcon } from "@/components/ui/icons";
import { useTeams } from "@/features/groups/use-teams";
import { canManageResponsibles, canWriteNetwork, canWriteSegment } from "./network-access";
import {
  changeResponsible,
  deleteSegment,
  saveSegment,
  useNetwork,
  useNetworkUser,
  useResponsibles,
  useSegments,
  type NetworkRow,
  type SegmentRow,
} from "./network-api";
import { SegmentForm, type SegmentDraft } from "./SegmentForm";
import { rangeSize } from "./segment-range";

/**
 * The groups responsible for a segment, whose members allocate its addresses:
 * badges, with a cross to detach one and a picker of the organisational groups to
 * attach another, for whoever may.
 */
function SegmentResponsibles({
  netId,
  segId,
  network,
}: {
  netId: string;
  segId: string;
  network: NetworkRow;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useNetworkUser();
  const responsibles = useResponsibles(netId, segId);
  const roles = (responsibles.data ?? []).flatMap((row) =>
    row.role === undefined ? [] : [row.role],
  );
  const editable =
    user !== undefined &&
    responsibles.data !== undefined &&
    canManageResponsibles(user, network.team_responsible, roles);
  const teams = useTeams();
  const { outcome, busy, change, dismiss } = useChanges(async () => {
    await queryClient.invalidateQueries({
      queryKey: ["network", netId, "segments", segId, "responsibles"],
    });
    // Another group responsible changes the addresses its members are shown.
    await queryClient.invalidateQueries({ queryKey: ["network", netId, "ips"] });
  });
  const own = new Set(roles);

  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="font-medium text-ink-muted">{t("networks.declared.responsibles.title")}</h4>
      <ChangeOutcomeLine outcome={outcome} onDismiss={dismiss} />
      {responsibles.isPending ? (
        <p className="text-ink-muted">{t("detail.loading")}</p>
      ) : responsibles.isError ? (
        <p role="alert" className="text-state-down">
          ■ {responsibles.error.message}
        </p>
      ) : responsibles.data.length === 0 ? (
        <p className="text-ink-muted">{t("networks.declared.responsibles.none")}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {responsibles.data.map((row) => {
            const role = row.role ?? String(row.group_id);
            return (
              <li
                key={row.group_id}
                title={row.description}
                className="flex items-center gap-1 rounded-(--radius-control) border border-line px-2 py-0.5"
              >
                {role}
                {editable && (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={t("networks.declared.responsibles.remove", { group: role })}
                    title={t("networks.declared.responsibles.remove", { group: role })}
                    onClick={() => {
                      void change(
                        t("networks.declared.responsibles.removed", { group: role }),
                        () => changeResponsible(netId, segId, String(row.group_id ?? role), false),
                      );
                    }}
                    className="text-ink-muted hover:text-state-down"
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editable && (
        <Combobox
          options={(teams.data ?? [])
            .filter((role) => !own.has(role))
            .map((role) => ({ value: role, label: role }))}
          value=""
          onChange={(role) => {
            void change(t("networks.declared.responsibles.added", { group: role }), () =>
              changeResponsible(netId, segId, role, true),
            );
          }}
          label={t("networks.declared.responsibles.add")}
          placeholder={t("networks.declared.responsibles.add")}
          emptyText={t("networks.declared.responsibles.noMatch")}
          disabled={busy}
          className="w-full max-w-xs"
        />
      )}
    </div>
  );
}

/** A segment: its range and type, changed in place; its responsible groups. */
function SegmentCard({
  netId,
  segment,
  network,
}: {
  netId: string;
  segment: SegmentRow;
  network: NetworkRow;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const user = useNetworkUser();
  const segId = String(segment.id ?? "");
  const responsibles = useResponsibles(netId, segId);
  const roles = (responsibles.data ?? []).flatMap((row) =>
    row.role === undefined ? [] : [row.role],
  );
  const [editing, setEditing] = useState(false);
  const canEdit = user !== undefined && canWriteSegment(user, network.team_responsible, roles);
  const canDelete = user !== undefined && canWriteNetwork(user, network.team_responsible);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["network", netId] });
  };
  const save = useMutation({
    mutationFn: (draft: SegmentDraft) => saveSegment(netId, segId, draft),
    onSuccess: async () => {
      setEditing(false);
      await invalidate();
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await deleteSegment(netId, segId);
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: invalidate,
  });
  const size = rangeSize(segment.seg_begin ?? "", segment.seg_end ?? "");
  const range = `${segment.seg_begin ?? ""} – ${segment.seg_end ?? ""}`;

  return (
    <li className="flex flex-col gap-2 rounded-(--radius-control) border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-semibold">{range}</code>
        <span className="rounded-(--radius-control) bg-surface-sunken px-1.5 text-ink-muted">
          {t(`networks.segment.types.${segment.seg_type ?? "static"}`)}
        </span>
        {size !== null && (
          <span className="text-ink-muted">
            {t("networks.declared.segments.size", {
              count: size,
              formatted: size.toLocaleString(i18n.language),
            })}
          </span>
        )}
        <span className="flex-1" />
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              save.reset();
              setEditing(true);
            }}
            className={COMP_BUTTON}
          >
            <PencilIcon />
            {t("networks.declared.segments.edit")}
          </button>
        )}
        {canDelete && (
          <ConfirmButton
            icon={<TrashIcon />}
            label={t("detail.delete")}
            question={t("networks.declared.segments.deleteQuestion", { range })}
            confirmLabel={t("detail.deleteConfirm")}
            cancelLabel={t("detail.cancel")}
            pendingLabel={t("detail.deleting")}
            pending={remove.isPending}
            onConfirm={() => {
              remove.mutate();
            }}
          />
        )}
      </div>
      {remove.isError && (
        <p role="alert" className="text-state-down">
          ■ {remove.error.message}
        </p>
      )}
      {editing && (
        <SegmentForm
          idPrefix={`segment-${segId}`}
          network={network}
          initial={{
            seg_type: segment.seg_type ?? "static",
            seg_begin: segment.seg_begin ?? "",
            seg_end: segment.seg_end ?? "",
          }}
          submitLabel={t("networks.declared.segments.save")}
          submittingLabel={t("networks.declared.segments.saving")}
          pending={save.isPending}
          errorMessage={save.isError ? save.error.message : null}
          onEdit={() => {
            save.reset();
          }}
          onSubmit={(draft) => {
            save.mutate(draft);
          }}
          onCancel={() => {
            setEditing(false);
          }}
        />
      )}
      <SegmentResponsibles netId={netId} segId={segId} network={network} />
    </li>
  );
}

/**
 * The segments of a declared network: address ranges whose responsible groups
 * allocate the addresses. Declared, changed and deleted here by the team of the
 * network; the responsible groups of each are managed by them and by the groups
 * already responsible.
 */
export function NetworkSegments({ netId }: { netId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useNetworkUser();
  const network = useNetwork(netId);
  const segments = useSegments(netId);
  const [creating, setCreating] = useState(false);
  // A new form after each creation: its fields start empty again.
  const [formKey, setFormKey] = useState(0);
  const canCreate =
    user !== undefined &&
    network.data != null &&
    canWriteNetwork(user, network.data.team_responsible);

  const create = useMutation({
    mutationFn: async (draft: SegmentDraft) => {
      const { error } = await api.POST("/networks/{net_id}/segments", {
        params: { path: { net_id: netId } },
        body: draft,
      });
      if (error !== undefined) throw new Error(problemText(error));
    },
    onSuccess: async () => {
      setCreating(false);
      setFormKey((key) => key + 1);
      await queryClient.invalidateQueries({ queryKey: ["network", netId] });
    },
  });

  if (network.isPending || segments.isPending)
    return <p className="text-ink-muted">{t("detail.loading")}</p>;
  if (network.isError || segments.isError)
    return (
      <p role="alert" className="text-state-down">
        ■ {(network.error ?? segments.error)?.message}
      </p>
    );
  const declared = network.data;
  if (declared === null) return <p className="text-ink-muted">{t("detail.missing")}</p>;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-muted">{t("networks.declared.segments.intro")}</p>
      {canCreate &&
        (creating ? (
          <div className="rounded-(--radius-control) border border-line p-3">
            <h4 className="mb-2 font-semibold">{t("networks.segment.title")}</h4>
            <p className="mb-3 text-ink-muted">
              {t("networks.segment.networkRange")}{" "}
              <code>
                {declared.begin} – {declared.end}
              </code>
            </p>
            <SegmentForm
              key={formKey}
              idPrefix="new-segment"
              network={declared}
              submitLabel={t("networks.segment.submit")}
              submittingLabel={t("networks.segment.submitting")}
              pending={create.isPending}
              errorMessage={create.isError ? create.error.message : null}
              onEdit={() => {
                create.reset();
              }}
              onSubmit={(draft) => {
                create.mutate(draft);
              }}
              onCancel={() => {
                setCreating(false);
              }}
            />
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={() => {
                create.reset();
                setCreating(true);
              }}
              className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
            >
              {t("networks.segment.open")}
            </button>
          </div>
        ))}
      {segments.data.length === 0 ? (
        <p className="text-ink-muted">{t("networks.declared.segments.none")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {segments.data.map((segment) => (
            <SegmentCard key={segment.id} netId={netId} segment={segment} network={declared} />
          ))}
        </ul>
      )}
    </div>
  );
}
