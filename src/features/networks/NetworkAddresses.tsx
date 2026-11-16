import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CrossLink } from "@/components/opensvc/CrossLink";
import { RelatedTable, type RelatedColumn } from "@/components/opensvc/RelatedTable";
import { COMP_BUTTON } from "@/components/opensvc/comp-changes";
import { IpsError, useNetworkIps, type NetworkIpRow } from "./network-api";
import { IPS_PAGE_SIZE, pageBounds } from "./ips-page";

/**
 * The addresses of a declared network the user may allocate, as the historical
 * "network ips" view: those of the segments their groups are responsible for, all
 * of them for a manager, or the whole network when it has no segment. Each says
 * its segment and the nodes reporting it; "free only" keeps those no node reports.
 */
export function NetworkAddresses({ netId }: { netId: string }) {
  const { t, i18n } = useTranslation();
  const [free, setFree] = useState(false);
  const [offset, setOffset] = useState(0);
  const ips = useNetworkIps(netId, free, offset, IPS_PAGE_SIZE);
  const format = (value: number) => value.toLocaleString(i18n.language);

  const columns: RelatedColumn<NetworkIpRow>[] = [
    {
      key: "ip",
      label: t("networks.declared.ips.ip"),
      render: (row) => <code>{row.ip}</code>,
    },
    {
      key: "seg_type",
      label: t("networks.declared.ips.segment"),
      render: (row) =>
        row.seg_type === undefined || row.seg_type === ""
          ? t("networks.declared.ips.noSegment")
          : t(`networks.segment.types.${row.seg_type}`, { defaultValue: row.seg_type }),
    },
    {
      key: "nodes",
      label: t("networks.declared.ips.nodes"),
      grow: true,
      wrap: true,
      render: (row) =>
        row.nodes.length === 0 ? (
          <span className="text-ink-muted">{t("networks.declared.ips.free")}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {row.nodes.map((node) => (
              <CrossLink key={node.node_id} kind="node" id={node.node_id}>
                {node.nodename === "" ? node.node_id : node.nodename}
              </CrossLink>
            ))}
          </span>
        ),
    },
  ];

  if (ips.isError) {
    const reason = ips.error instanceof IpsError ? ips.error.reason : "other";
    return (
      <div role="alert" className="flex flex-col gap-1">
        {reason !== "other" && (
          <p className="text-state-warn">▲ {t(`networks.declared.ips.refused.${reason}`)}</p>
        )}
        <p className="text-ink-muted">{ips.error.message}</p>
      </div>
    );
  }

  const rows = ips.data?.rows ?? [];
  const count = ips.data?.count ?? 0;
  const bounds = pageBounds(offset, rows.length, count);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink-muted">{t("networks.declared.ips.intro")}</p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={free}
            onChange={(event) => {
              setFree(event.target.checked);
              setOffset(0);
            }}
          />
          {t("networks.declared.ips.freeOnly")}
        </label>
        <span className="flex-1" />
        {ips.data !== undefined && (
          <span className="text-ink-muted" aria-live="polite">
            {t("networks.declared.ips.range", {
              count,
              from: format(bounds.from),
              to: format(bounds.to),
              total: format(count),
            })}
          </span>
        )}
        <button
          type="button"
          disabled={!bounds.hasPrevious || ips.isFetching}
          onClick={() => {
            setOffset(Math.max(offset - IPS_PAGE_SIZE, 0));
          }}
          className={COMP_BUTTON}
        >
          {t("networks.declared.ips.previous")}
        </button>
        <button
          type="button"
          disabled={!bounds.hasNext || ips.isFetching}
          onClick={() => {
            setOffset(offset + IPS_PAGE_SIZE);
          }}
          className={COMP_BUTTON}
        >
          {t("networks.declared.ips.next")}
        </button>
      </div>
      <RelatedTable
        columns={columns}
        groups={[{ key: "all", label: "", rows }]}
        rowKey={(row) => row.ip}
        isPending={ips.isPending}
        errorMessage={null}
        empty={free ? t("networks.declared.ips.noneFree") : t("networks.declared.ips.none")}
        caption={t("networks.declared.tabs.ips")}
      />
    </div>
  );
}
