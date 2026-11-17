import { useEffect } from "react";

/**
 * The rows ticked in the list on display, for the context of a question to the
 * assistant (`interface-context.ts`): "why are these in warn?" names nothing. Held
 * by the page, never by its address: a link cannot tick a row.
 */
export interface CheckedRows {
  /** What the rows are, plural: `nodes`, `services`, `rows` for a list of no known kind. */
  kind: string;
  /** The ids of the rows, in the order of the list on display, then of the other pages. */
  ids: readonly string[];
  /** False when a row has no id, ticked by its position: their count alone goes then. */
  exact?: boolean;
  /**
   * Every row of the list, on all its pages, as its filters and the filterset of
   * the session select them: a criterion, told as such when the ids do not fit.
   */
  all?: boolean;
}

/**
 * The rows of the list on display. One list a page: the list that mounts last
 * tells its rows, or none, in place of any other; a page with two lists would have
 * to tell them apart here first.
 */
let checked: CheckedRows | null = null;

/** The rows ticked in the list on display, `null` when none. */
export const checkedRows = (): CheckedRows | null => checked;

/**
 * Tells the rows a list ticks, `ids` the ids of its selection, `exact` false when
 * one is a position rather than an id, `all` true when they are every row of the
 * list: none once it is cleared or the list leaves the page.
 */
export function useShareCheckedRows(
  kind: string,
  ids: readonly string[],
  exact = true,
  all = false,
): void {
  useEffect(() => {
    const shared = ids.length === 0 ? null : { kind, ids, exact, all };
    checked = shared;
    return () => {
      if (checked === shared) checked = null;
    };
  }, [kind, ids, exact, all]);
}
