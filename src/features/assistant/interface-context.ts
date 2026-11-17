import { isPeekStep } from "@/components/opensvc/panel-trail";
import { NAV_CATEGORIES, NAV_TOP } from "@/app/layout/navigation";
import { currentIndex, parseTrail } from "@/lib/peek-trail";
import type { CheckedRows } from "./checked-rows";

/**
 * The context of the interface a prompt goes with (AG-UI `context`): what the page
 * under the dock shows, so that a question such as "why is it down?" needs no name.
 * The vocabulary is the agent's (its `docs/webapp.md`), the same as the webapp of a
 * cluster writes.
 *
 * Read from the URL, as `list-search.ts` keeps it: the page, the row open in its
 * panel or the record looked at over it, and their tab. Never the text of a record,
 * an alert or a log line: other people wrote it, and the agent must not take it as
 * the user's word. The URL may come from a link someone else wrote, too: only
 * values shaped as what they name go, a page of the menu, an id of the shape of its
 * kind (a uuid, a number, a short name) or the name of a tab, and the others are
 * left out.
 *
 * With them, what the user did or set in their session, never the content of a
 * record: the rows they ticked in the list on display (`checked-rows.ts`), which a
 * link cannot tick, and their time zone and clock, for "an hour ago" or "at 2 pm".
 *
 * On the page of the assistant nothing is under the conversation: the session only.
 */
export interface InterfaceEntry {
  description: string;
  value: string;
}

/** The bounds of the agent: past them, it refuses the run (`invalid_context`). */
export const MAX_CONTEXT_ENTRIES = 8;
const MAX_DESCRIPTION_BYTES = 128;
const MAX_VALUE_BYTES = 2048;
const MAX_CONTEXT_BYTES = 4096;

/**
 * The shapes of the ids of the collector, an address reading only what is shaped
 * as one: a sentence written with dashes or dots, from a link someone else wrote,
 * is no id. Nodes, services and clusters by uuid (`char(36)`), most records by
 * number, an instance by its service and node (`instance-id.ts`), and the others,
 * such as an app or a disk, by a short name.
 */
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const SHAPES = {
  uuid: new RegExp(`^${UUID}$`),
  number: /^[0-9]{1,20}$/,
  instance: new RegExp(`^${UUID}@${UUID}(@[A-Za-z0-9][A-Za-z0-9._-]{0,63})?$`),
  name: /^[A-Za-z0-9][A-Za-z0-9._:@#/+-]{0,63}$/,
} as const;
type Shape = keyof typeof SHAPES;

/** What the rows of a list are, by the path of its page: one, several, and the shape of their ids. */
const LISTS: Readonly<Record<string, readonly [string, string, Shape]>> = {
  "/": ["alert", "alerts", "number"],
  "/nodes": ["node", "nodes", "uuid"],
  "/services": ["service", "services", "uuid"],
  "/instances": ["instance", "instances", "instance"],
  "/resources": ["resource", "resources", "number"],
  "/apps": ["app", "apps", "name"],
  "/networks": ["network", "networks", "number"],
  "/checks": ["check", "checks", "number"],
  "/service-actions": ["service action", "service actions", "number"],
  "/clusters": ["cluster", "clusters", "uuid"],
  "/disks": ["disk", "disks", "name"],
  "/arrays": ["array", "arrays", "name"],
  "/tags": ["tag", "tags", "name"],
  "/groups": ["group", "groups", "number"],
  "/users": ["user", "users", "number"],
  "/packages": ["package", "packages", "name"],
};

/** The shape of the id of a record looked at over a page, by its kind. */
const PEEK_SHAPES: Readonly<Record<string, Shape>> = {
  node: "uuid",
  service: "uuid",
  cluster: "uuid",
  instance: "instance",
};

/** What the rows of the list at `pathname` are, plural: `rows` for a list of no known kind. */
export const checkedKind = (pathname: string): string => LISTS[pathname]?.[1] ?? "rows";

const bytes = (text: string) => new TextEncoder().encode(text).length;

/**
 * The pages of the menu, the only ones named: an address out of it, such as one a
 * link made up, names no page.
 */
const PAGES: ReadonlySet<string> = new Set(
  [...NAV_TOP, ...NAV_CATEGORIES.flatMap((category) => category.entries)].map((entry) => entry.to),
);
/** The id of a ticked row, which the page holds: any id the collector gives. */
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:@#/+-]{0,255}$/;
/** The name of a tab, or of the category of a tab made of several lists. */
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** An IANA time zone, such as `Europe/Paris`. */
const TIME_ZONE = /^[A-Za-z0-9_+/-]{1,64}$/;

const identifier = (value: string | undefined): value is string =>
  value !== undefined && IDENTIFIER.test(value);
const shaped = (shape: Shape, value: string | undefined): value is string =>
  value !== undefined && SHAPES[shape].test(value);
const name = (value: string | undefined): value is string =>
  value !== undefined && NAME.test(value);

/** What the user did or set in their session, besides the page. */
export interface InterfaceSession {
  /** Their clock, when the question is asked. */
  now?: Date;
  /** Their time zone, as the browser tells it. */
  timeZone?: string;
  /** The rows ticked in the list on display. */
  checked?: CheckedRows | null;
  /** The filterset of the session, `null` for none, `undefined` while not read. */
  sessionFilterset?: string | null;
}

/** `date` in ISO 8601, to the second, at the offset of the browser: 2026-11-16T15:40:12+01:00. */
export function localTime(date: Date): string {
  const pad = (value: number) => String(Math.trunc(Math.abs(value))).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  return (
    `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${offset < 0 ? "-" : "+"}${pad(offset / 60)}:${pad(offset % 60)}`
  );
}

/**
 * The rows ticked, all of them or none: a list cut to the bounds would have an
 * action asked of "these" run on a part of them. Past the bounds, or with an id not
 * shaped as one, every row of the list goes as that criterion, when the criterion
 * is known whole (`criterion`: its filters and the filterset of the session read),
 * else their count alone, for the assistant to ask which.
 */
function checkedEntries(checked: CheckedRows, criterion: boolean): InterfaceEntry[] {
  const count = { description: `checked ${checked.kind} count`, value: String(checked.ids.length) };
  const list = checked.ids.join(" ");
  if (
    checked.exact !== false &&
    bytes(list) <= MAX_VALUE_BYTES &&
    checked.ids.every((id) => identifier(id))
  )
    return [{ description: `checked ${checked.kind}`, value: list }, count];
  if (checked.all === true && criterion)
    return [{ description: `checked ${checked.kind}`, value: "all the rows of the list" }, count];
  return [count];
}

/** A prop of a column of a list, as `list-search.ts` keys its filter: `f.status`. */
const PROP = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;
/** The longest expression of a filter told: a longer one is no filter a user typed. */
const MAX_FILTER_CHARS = 128;

/**
 * A filter of a column in words, from the expression of the collector API that
 * `column-filters.ts` keeps: `dev` contains, `~^dev` matches, `in:a,b` is one of,
 * `eq:` `ne:` `gte:` `lte:` `gt:` `lt:` compare, `empty`, a leading `!` inverts.
 */
function describeFilter(prop: string, expression: string): string {
  const inverted = expression.startsWith("!") && !expression.startsWith("!=");
  const inner = inverted ? expression.slice(1) : expression;
  const not = inverted ? "not " : "";
  if (inner === "empty") return `${prop} is ${not}empty`;
  if (inner.startsWith("~"))
    return `${prop} ${inverted ? "does not match" : "matches"} /${inner.slice(1)}/`;
  if (inner.startsWith("in:"))
    return `${prop} is ${not}one of ${inner.slice(3).split(",").join(", ")}`;
  const comparisons: readonly (readonly [string, string])[] = [
    ["eq:", "is"],
    ["ne:", "is not"],
    ["gte:", ">="],
    ["lte:", "<="],
    ["gt:", ">"],
    ["lt:", "<"],
  ];
  for (const [prefix, word] of comparisons)
    if (inner.startsWith(prefix)) return `${prop} ${not}${word} ${inner.slice(prefix.length)}`;
  return `${prop} ${inverted ? "does not contain" : "contains"} ${inner}`;
}

/**
 * The filters of the columns of the list (`f.<prop>`), in words, `undefined` when
 * one cannot be told: a criterion told in part would name more rows than the list
 * shows. `null` for none.
 */
function listFilters(search: Readonly<Record<string, unknown>>): string | null | undefined {
  const told: string[] = [];
  for (const key of Object.keys(search).sort()) {
    if (!key.startsWith("f.")) continue;
    const prop = key.slice(2);
    const raw = search[key];
    const expression = typeof raw === "number" && Number.isFinite(raw) ? String(raw) : raw;
    if (typeof expression !== "string" || expression === "") continue;
    if (!PROP.test(prop) || expression.length > MAX_FILTER_CHARS || CONTROL.test(expression))
      return undefined;
    told.push(describeFilter(prop, expression));
  }
  if (told.length === 0) return null;
  const value = told.join("; ");
  return bytes(value) > MAX_VALUE_BYTES ? undefined : value;
}

/** The name of a filterset, as the collector gives it. */
// eslint-disable-next-line no-control-regex
const FILTERSET = /^[^\u0000-\u001f\u007f-\u009f]{1,128}$/;

function sessionEntries({ now, timeZone }: InterfaceSession): InterfaceEntry[] {
  const entries: InterfaceEntry[] = [];
  if (timeZone !== undefined && TIME_ZONE.test(timeZone))
    entries.push({ description: "time zone", value: timeZone });
  if (now !== undefined && !Number.isNaN(now.getTime()))
    entries.push({ description: "local time", value: localTime(now) });
  return entries;
}

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

/** An entry the agent takes: printable text within its bounds. */
function valid(entry: InterfaceEntry): boolean {
  return (
    entry.description.trim() !== "" &&
    bytes(entry.description) <= MAX_DESCRIPTION_BYTES &&
    bytes(entry.value) <= MAX_VALUE_BYTES &&
    !CONTROL.test(entry.description) &&
    !CONTROL.test(entry.value)
  );
}

/**
 * The entries an agent takes, in their order: an invalid entry is left out, and
 * those past the bounds of the whole, so that a prompt is never refused for them.
 */
export function boundContext(entries: readonly unknown[]): InterfaceEntry[] {
  const kept: InterfaceEntry[] = [];
  let total = 0;
  for (const raw of entries) {
    if (kept.length === MAX_CONTEXT_ENTRIES) break;
    if (typeof raw !== "object" || raw === null) continue;
    const { description, value } = raw as Partial<InterfaceEntry>;
    if (typeof description !== "string" || typeof value !== "string") continue;
    const entry = { description, value };
    if (!valid(entry)) continue;
    const size = bytes(description) + bytes(value);
    if (total + size > MAX_CONTEXT_BYTES) continue;
    total += size;
    kept.push(entry);
  }
  return kept;
}

/** The entries of the clock of the user, read again when a queued message goes. */
const CLOCK = new Set(["time zone", "local time"]);

/**
 * The context of a message queued, as it goes: the page and the rows of the time it
 * was asked, the clock of now, so that "an hour ago" counts from when it is sent.
 */
export function withClockOf(
  queued: readonly InterfaceEntry[],
  now: readonly InterfaceEntry[],
): InterfaceEntry[] {
  return boundContext([
    ...queued.filter((entry) => !CLOCK.has(entry.description)),
    ...now.filter((entry) => CLOCK.has(entry.description)),
  ]);
}

/**
 * The context of the page at `pathname`, with the parameters of its address as
 * the router parses them (`defaultParseSearch`: a value the router quotes, such as
 * a numeric id, comes back without its quotes), and of the session.
 */
export function interfaceContext(
  pathname: string,
  search: Readonly<Record<string, unknown>>,
  session: InterfaceSession = {},
): InterfaceEntry[] {
  if (pathname === "/ai" || pathname.startsWith("/ai/"))
    return boundContext(sessionEntries(session));
  // As `list-search.ts` reads them: a bare number typed in the address is its string.
  const read = (key: string) => {
    const value = search[key];
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  const entries: InterfaceEntry[] = [];
  if (PAGES.has(pathname)) entries.push({ description: "page", value: pathname });
  // One drawer at a time: the row panel wins over the record looked at, as
  // `PeekPanel` has it.
  const sel = read("sel");
  let open = false;
  if (sel !== undefined) {
    const list = LISTS[pathname];
    if (shaped(list?.[2] ?? "name", sel)) {
      entries.push({
        description: list === undefined ? "selected record" : `selected ${list[0]}`,
        value: sel,
      });
      open = true;
      const tab = read("tab");
      if (name(tab)) entries.push({ description: "open tab", value: tab });
    }
  } else {
    const trail = parseTrail(read("peek")).filter(isPeekStep);
    const shown = trail[currentIndex(trail, read("peekat"))];
    if (shown !== undefined && shaped(PEEK_SHAPES[shown.kind] ?? "name", shown.id)) {
      entries.push({ description: `open ${shown.kind}`, value: shown.id });
      open = true;
      const tab = read("peektab");
      if (name(tab)) entries.push({ description: "open tab", value: tab });
    }
  }
  // What the list shows: its filters, and the filterset of the session, which
  // narrows every list. Known whole, they make every row ticked a criterion.
  const filters = listFilters(search);
  if (typeof filters === "string") entries.push({ description: "list filters", value: filters });
  const filterset = session.sessionFilterset;
  const filtersetKnown =
    filterset === null || (typeof filterset === "string" && FILTERSET.test(filterset));
  if (typeof filterset === "string" && filtersetKnown)
    entries.push({ description: "session filterset", value: filterset });
  if (session.checked && session.checked.ids.length > 0)
    entries.push(...checkedEntries(session.checked, filters !== undefined && filtersetKnown));
  const diff = read("diff");
  if (open && name(diff)) entries.push({ description: "open view", value: diff });
  entries.push(...sessionEntries(session));
  return boundContext(entries);
}
