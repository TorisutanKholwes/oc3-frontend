import { useTranslation } from "react-i18next";
import { LAYER_GROUPS, type TopologyLayer } from "./layers";

/**
 * The layers of a topology to draw, a checkbox each, grouped as objects, storage
 * and locations. The choice applies with the Redraw button, as in the historical
 * collector: a drawing of a thousand objects is not redone at each tick.
 */
export function LayerPicker({
  value,
  onChange,
  onApply,
  busy,
}: {
  value: readonly TopologyLayer[];
  onChange: (layers: TopologyLayer[]) => void;
  onApply: () => void;
  busy?: boolean;
}) {
  const { t } = useTranslation();
  const toggle = (layer: TopologyLayer, checked: boolean) => {
    onChange(checked ? [...value, layer] : value.filter((l) => l !== layer));
  };
  return (
    <form
      className="flex flex-wrap items-end gap-x-5 gap-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        onApply();
      }}
    >
      {LAYER_GROUPS.map((group) => (
        <fieldset key={group.key} className="min-w-0">
          <legend className="mb-0.5 text-data font-medium text-ink-muted">
            {t(`topology.groups.${group.key}`)}
          </legend>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {group.layers.map((layer) => (
              <label key={layer} className="inline-flex items-center gap-1 whitespace-nowrap">
                <input
                  type="checkbox"
                  className="accent-(--accent)"
                  checked={value.includes(layer)}
                  onChange={(event) => {
                    toggle(layer, event.target.checked);
                  }}
                />
                {t(`topology.layers.${layer}`)}
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button
        type="submit"
        disabled={value.length === 0 || busy === true}
        title={value.length === 0 ? t("topology.noLayer") : undefined}
        className="h-7 rounded-(--radius-control) bg-accent px-3 font-medium text-accent-ink disabled:opacity-50"
      >
        {t("topology.redraw")}
      </button>
    </form>
  );
}
