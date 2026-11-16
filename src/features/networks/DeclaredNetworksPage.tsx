import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api/client";
import { toPage } from "@/lib/api/page";
import { problemText } from "@/lib/api/problem";
import { hasPrivilege, useEffectivePrivileges } from "@/lib/api/effective-privileges";
import { CollectorList, type ListColumn } from "@/components/opensvc/CollectorList";
import type { ColumnFamily } from "@/components/opensvc/ColumnFamily";
import { ObjectIcon } from "@/components/opensvc/ObjectIcon";
import { DateTime } from "@/components/ui/DateTime";
import {
  resolveListSearch,
  resetsScroll,
  mergeSearch,
  visibleProps,
  type ResolvedListSearch,
} from "@/lib/list-search";
import { filterQuery, filtersKey, type ColumnFilters } from "@/lib/column-filters";
import { STATS_LIMIT, toValueStats, type ValueStats } from "@/lib/api/value-stats";
import { useViewPrefs, withSavedSearch } from "@/lib/user-prefs";
import { CreateNetworkPanel } from "./CreateNetworkPanel";
import { DeclaredNetworkPanel } from "./DeclaredNetworkPanel";
import type { NetworkRow } from "./network-api";
import { networkLabel } from "./network-label";

/** By name then address, as the API. */
const DEFAULT_SORT = ["name", "network"];

/** Every property of a declared network, in the order of the API. */
const NETWORK_PROPS = [
  "id",
  "name",
  "network",
  "netmask",
  "begin",
  "end",
  "broadcast",
  "gateway",
  "pvid",
  "prio",
  "team_responsible",
  "comment",
  "updated",
] as const satisfies readonly (keyof NetworkRow)[];

type NetworkProp = (typeof NETWORK_PROPS)[number];

const DEFAULT_COLS: string[] = [
  "name",
  "network",
  "netmask",
  "gateway",
  "pvid",
  "team_responsible",
  "comment",
];

const NUMERIC_PROPS: NetworkProp[] = ["id", "netmask", "pvid", "prio"];

const FAMILY: Partial<Record<NetworkProp, ColumnFamily>> = {
  team_responsible: "team",
  updated: "time",
};

const COLUMNS: ListColumn<NetworkRow>[] = NETWORK_PROPS.map((prop) => ({
  prop,
  labelKey: `networks.declared.fields.${prop}`,
  numeric: NUMERIC_PROPS.includes(prop),
  family: FAMILY[prop] ?? "network",
  render: (row: NetworkRow) => {
    const value = row[prop];
    if (prop === "updated" && typeof value === "string") return <DateTime value={value} />;
    return value;
  },
}));

const ALL_PROPS: string[] = [...NETWORK_PROPS];

/** The columns shown, the id and what names a network in the messages. */
function queryProps(cols: string[] | undefined): string {
  return [
    ...new Set([
      "id",
      "name",
      "network",
      "netmask",
      ...visibleProps(cols, DEFAULT_COLS, ALL_PROPS),
    ]),
  ].join(",");
}

async function networkStats(prop: string, filters: ColumnFilters): Promise<ValueStats> {
  const query = { props: prop, stats: "1", limit: STATS_LIMIT, filter: filterQuery(filters) };
  const response = await api.GET("/networks", { params: { query } });
  if (response.error !== undefined) throw new Error(problemText(response.error));
  return toValueStats(response.data.data, response.data.meta, prop);
}

async function fetchNetworks(search: ResolvedListSearch) {
  const { data, error } = await api.GET("/networks", {
    params: {
      query: {
        props: queryProps(search.cols),
        orderby: search.sort.join(","),
        offset: search.offset,
        limit: search.limit + 1,
        filter: filterQuery(search.filters),
      },
    },
  });
  if (error !== undefined) throw new Error(problemText(error));
  const all: NetworkRow[] = Array.isArray(data.data) ? data.data : [];
  return toPage(all, data.meta, search.limit);
}

function useNetworks(search: ResolvedListSearch) {
  return useQuery({
    queryKey: [
      "networks",
      "list",
      search.sort,
      search.offset,
      search.limit,
      search.cols,
      filtersKey(search.filters),
    ],
    placeholderData: keepPreviousData,
    queryFn: () => fetchNetworks(search),
  });
}

/**
 * The declared networks, as the historical "Networks" view: the IPv4 ranges the
 * node addresses fall in, with their gateway, VLAN and responsible team. A row
 * opens the network: its properties, its segments and their responsible groups,
 * and its addresses. A NetworkManager declares a network here; those of its team
 * change and delete it. The addresses the nodes report have their own view.
 */
export function DeclaredNetworksPage() {
  const { t } = useTranslation();
  const prefs = useViewPrefs("declaredNetworks");
  const search = resolveListSearch(
    withSavedSearch(useSearch({ from: "/networks/declared" }), prefs),
    DEFAULT_SORT,
  );
  const navigate = useNavigate({ from: "/networks/declared" });
  const { data, isPending, isError, error, isFetching } = useNetworks(search);
  const privileges = useEffectivePrivileges();
  const canCreate =
    privileges.data !== undefined && hasPrivilege(privileges.data, ["NetworkManager"]);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function allIds(): Promise<string[]> {
    const { data, error } = await api.GET("/networks", {
      params: { query: { props: "id", limit: 0, filter: filterQuery(search.filters) } },
    });
    if (error !== undefined) throw new Error(problemText(error));
    const rows: NetworkRow[] = Array.isArray(data.data) ? data.data : [];
    return rows.flatMap((row) => (row.id === undefined ? [] : [String(row.id)]));
  }

  function update(next: Partial<ResolvedListSearch>) {
    // Choosing a row ends a creation in progress: the two drawers share the right edge.
    if (next.sel !== undefined) setCreating(false);
    prefs.saveSearch(next);
    void navigate({
      search: (previous) => mergeSearch(previous, next),
      resetScroll: resetsScroll(next),
    });
  }

  const selected = data?.rows.find((row) => String(row.id) === search.sel);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <ObjectIcon kind="declaredNetwork" className="h-5 w-5" />
          {t("networks.declared.title")}
        </h1>
        {canCreate && (
          <button
            type="button"
            onClick={() => {
              update({ sel: undefined, tab: undefined });
              setCreating(true);
            }}
            className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink"
          >
            {t("networks.create.open")}
          </button>
        )}
        {notice !== null && (
          <span role="status" className="text-ink-muted">
            ● {notice}
          </span>
        )}
      </div>
      <p className="mb-3 max-w-3xl text-ink-muted">
        {t("networks.declared.intro")}{" "}
        <Link to="/networks" className="underline underline-offset-2">
          {t("networks.declared.addressesLink")}
        </Link>
      </p>

      <CollectorList
        viewPrefs={prefs}
        columns={COLUMNS}
        defaultCols={DEFAULT_COLS}
        rows={data?.rows ?? []}
        rowId={(row) => (row.id === undefined ? undefined : String(row.id))}
        search={search}
        onChange={update}
        isPending={isPending}
        isFetching={isFetching}
        errorMessage={isError ? error.message : null}
        hasMore={data?.hasMore ?? false}
        exportPage={(page) => fetchNetworks({ ...search, ...page })}
        total={data?.total}
        selectAllMatching={allIds}
        valueStats={networkStats}
        filterable
      />

      <CreateNetworkPanel
        open={creating}
        onClose={() => {
          setCreating(false);
        }}
        onCreated={(network) => {
          setNotice(
            t("networks.create.done", {
              name:
                network.name === "" || network.name === undefined
                  ? networkLabel(network)
                  : network.name,
              range: `${network.begin ?? ""} – ${network.end ?? ""}`,
            }),
          );
          // The new network opens, for its segments to be declared.
          if (network.id !== undefined) update({ sel: String(network.id), tab: "segments" });
        }}
      />

      <DeclaredNetworkPanel
        netId={creating ? undefined : search.sel}
        label={selected === undefined ? "" : networkLabel(selected)}
        onClose={() => {
          update({ sel: undefined, tab: undefined });
        }}
        onDeleted={() => {
          setNotice(
            t("networks.declared.delete.done", {
              network: selected === undefined ? (search.sel ?? "") : networkLabel(selected),
            }),
          );
          update({ sel: undefined, tab: undefined });
        }}
        tab={search.tab}
        onTabChange={(tab) => {
          update({ tab });
        }}
      />
    </section>
  );
}
