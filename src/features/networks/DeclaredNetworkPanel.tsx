import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { DetailContent, type DetailGroup } from "@/components/opensvc/DetailPanel";
import { RelatedTabsPanel } from "@/components/opensvc/RelatedTabsPanel";
import type { RelatedTab } from "@/components/opensvc/related-tabs";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { DateTime } from "@/components/ui/DateTime";
import { NetworkIcon, TrashIcon } from "@/components/ui/icons";
import { useTeams } from "@/features/groups/use-teams";
import { canWriteNetwork, toNetworkChanges } from "./network-access";
import {
  deleteNetwork,
  saveNetwork,
  useNetwork,
  useNetworkUser,
  useSegments,
  type NetworkChanges,
  type NetworkRow,
} from "./network-api";
import { NetworkAddresses } from "./NetworkAddresses";
import { NetworkSegments } from "./NetworkSegments";
import { networkLabel } from "./network-label";

/** A network as its detail shows it: its address and prefix together, edited at once. */
type NetworkView = NetworkRow & { cidr?: string };

const text = (prop: keyof NetworkView) => (row: NetworkView) => {
  const value = row[prop];
  return value === undefined || value === null || value === "" ? undefined : String(value);
};

const GROUPS: DetailGroup<NetworkView>[] = [
  {
    key: "identity",
    family: "network",
    fields: [
      { prop: "name", format: text("name"), editable: true },
      {
        prop: "cidr",
        format: text("cidr"),
        render: (row) => <code>{row.cidr}</code>,
        editable: true,
      },
      { prop: "gateway", format: text("gateway"), editable: true },
      { prop: "begin", format: text("begin") },
      { prop: "end", format: text("end") },
      { prop: "broadcast", format: text("broadcast") },
      { prop: "pvid", format: text("pvid"), editable: true, input: "number" },
      { prop: "prio", format: text("prio"), editable: true, input: "number" },
    ],
  },
  {
    key: "ownership",
    family: "team",
    fields: [
      {
        prop: "team_responsible",
        format: text("team_responsible"),
        editable: true,
        optionsKey: "teams",
      },
      { prop: "comment", format: text("comment"), editable: true },
    ],
  },
  {
    key: "record",
    family: "time",
    fields: [
      {
        prop: "updated",
        format: text("updated"),
        render: (row) => (row.updated ? <DateTime value={row.updated} /> : null),
      },
      { prop: "id", format: text("id") },
    ],
  },
];

const TABS: RelatedTab[] = [
  {
    key: "segments",
    labelKey: "networks.declared.tabs.segments",
    icon: <NetworkIcon className="h-3.5 w-3.5 text-icon-network" />,
    useSummary: (id) => ({ count: useSegments(id).data?.length }),
    render: (id) => <NetworkSegments netId={id} />,
  },
  {
    key: "ips",
    labelKey: "networks.declared.tabs.ips",
    icon: <NetworkIcon className="h-3.5 w-3.5 text-icon-network" />,
    useSummary: () => ({ count: undefined }),
    hideCount: true,
    render: (id) => <NetworkAddresses netId={id} />,
  },
];

/**
 * A declared network: its properties, changed in place by the NetworkManagers of
 * its team, who also delete it; its segments with their responsible groups; and
 * its addresses, with the nodes reporting them. The open tab lives in the URL
 * (`tab`), held by the view.
 */
export function DeclaredNetworkPanel({
  netId,
  label,
  onClose,
  onDeleted,
  tab,
  onTabChange,
}: {
  netId: string | undefined;
  label: string;
  onClose: () => void;
  onDeleted: () => void;
  tab: string | undefined;
  onTabChange: (tab: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: network, isPending, isError, error } = useNetwork(netId);
  const user = useNetworkUser();
  const editable =
    user !== undefined && network != null && canWriteNetwork(user, network.team_responsible);
  const teams = useTeams();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["network", netId] });
    await queryClient.invalidateQueries({ queryKey: ["networks"] });
    // The node addresses show the name and the range of their network.
    await queryClient.invalidateQueries({ queryKey: ["ips"] });
  };
  const save = useMutation({
    mutationFn: async (changes: Record<string, string | number | boolean>) => {
      if (netId === undefined) return;
      let body: NetworkChanges;
      try {
        body = toNetworkChanges(changes);
      } catch (reason) {
        throw new Error(t(reason instanceof Error ? reason.message : String(reason)));
      }
      await saveNetwork(netId, body);
    },
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async () => {
      if (netId !== undefined) await deleteNetwork(netId);
    },
    onSuccess: async () => {
      onDeleted();
      await queryClient.invalidateQueries({ queryKey: ["networks"] });
      await queryClient.invalidateQueries({ queryKey: ["ips"] });
      queryClient.removeQueries({ queryKey: ["network", netId] });
    },
  });
  const open = netId !== undefined;
  const view: NetworkView | null | undefined =
    network == null
      ? network
      : { ...network, cidr: `${network.network ?? ""}/${String(network.netmask ?? "")}` };
  const title =
    network == null
      ? label === ""
        ? t("networks.declared.detail.title")
        : label
      : network.name !== undefined && network.name !== ""
        ? network.name
        : networkLabel(network);

  return (
    <RelatedTabsPanel
      open={open}
      title={title}
      kind="declaredNetwork"
      onClose={onClose}
      objectId={netId}
      tabs={TABS}
      tab={tab}
      onTabChange={onTabChange}
      propertiesFamily="network"
      label={t("networks.declared.detail.tabs")}
    >
      <DetailContent
        groups={GROUPS}
        row={view}
        labelPrefix="networks.declared.fields"
        groupPrefix="networks.declared.detail.groups"
        isPending={open && isPending}
        errorMessage={isError ? error.message : null}
        onSave={editable ? (changes) => save.mutateAsync(changes) : undefined}
        editHint={editable ? t("networks.declared.detail.editHint") : ""}
        options={{ teams: teams.data ?? [] }}
        actions={
          editable ? (
            <div>
              <ConfirmButton
                icon={<TrashIcon />}
                label={t("detail.delete")}
                question={t("networks.declared.delete.question", { network: title })}
                details={
                  <p className="text-ink-muted">{t("networks.declared.delete.consequence")}</p>
                }
                confirmLabel={t("detail.deleteConfirm")}
                cancelLabel={t("detail.cancel")}
                pendingLabel={t("detail.deleting")}
                pending={remove.isPending}
                onConfirm={() => {
                  remove.mutate();
                }}
              />
              {remove.isError && (
                <p role="alert" className="mt-2 text-state-down">
                  ■ {remove.error.message}
                </p>
              )}
            </div>
          ) : undefined
        }
      />
    </RelatedTabsPanel>
  );
}
