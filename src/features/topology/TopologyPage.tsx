import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { TopologyIcon } from "@/components/ui/icons";
import { formatLayers, parseAppIds, parseIds, parseLayers } from "./layers";
import { TopologyView } from "./TopologyView";

/**
 * The topology of the nodes, services and applications the URL names
 * (`node_ids`, `svc_ids`, `app_ids`), with its layers (`display`): what the
 * actions menus of the nodes and services lists open for their selection, and
 * a link to share.
 */
export function TopologyPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/topology" });
  const navigate = useNavigate({ from: "/topology" });
  const nodeIds = parseIds(search.node_ids);
  const svcIds = parseIds(search.svc_ids);
  const appIds = parseAppIds(search.app_ids);
  const layers = parseLayers(search.display);
  const parts = [
    nodeIds.length > 0 ? t("topology.start.nodes", { count: nodeIds.length }) : null,
    svcIds.length > 0 ? t("topology.start.services", { count: svcIds.length }) : null,
    appIds.length > 0 ? t("topology.start.apps", { count: appIds.length }) : null,
  ].filter((part) => part !== null);

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h1 className="flex items-center gap-2 text-title font-semibold">
          <TopologyIcon className="h-5 w-5 text-icon-node" />
          {t("topology.title")}
        </h1>
        {parts.length > 0 && (
          <p className="text-ink-muted">{t("topology.start.from", { what: parts.join(", ") })}</p>
        )}
      </div>
      <TopologyView
        start={{ nodeIds, svcIds, appIds }}
        layers={layers}
        onLayersChange={(next) => {
          void navigate({
            search: (previous) => ({ ...previous, display: formatLayers(next) }),
          });
        }}
        wheel="always"
        frameClassName="h-[calc(100vh-14rem)] min-h-96"
      />
    </section>
  );
}
