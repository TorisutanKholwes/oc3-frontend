/**
 * What the user may change on a declared network, as the collector decides it.
 * The menu and the buttons follow it; the server checks again and has the last
 * word.
 */

import type { NetworkChanges } from "./network-api";

/** The privileges and the organisational groups of the user. */
export interface NetworkUser {
  privileges: ReadonlySet<string>;
  groups: ReadonlySet<string>;
}

const isManager = (user: NetworkUser) => user.privileges.has("Manager");

/** A member of the team responsible for the network, or a manager. */
function ownsNetwork(user: NetworkUser, teamResponsible: string | undefined): boolean {
  return (
    isManager(user) ||
    (teamResponsible !== undefined && teamResponsible !== "" && user.groups.has(teamResponsible))
  );
}

/**
 * Changing or deleting the network, declaring and deleting its segments: the
 * NetworkManager privilege, and the team responsible for the network unless a
 * manager.
 */
export function canWriteNetwork(user: NetworkUser, teamResponsible: string | undefined): boolean {
  return (
    (isManager(user) || user.privileges.has("NetworkManager")) && ownsNetwork(user, teamResponsible)
  );
}

/**
 * Changing the type or the range of a segment: the NetworkManager privilege, and
 * the team of the network or a group responsible for the segment.
 */
export function canWriteSegment(
  user: NetworkUser,
  teamResponsible: string | undefined,
  responsibles: readonly string[],
): boolean {
  return (
    (isManager(user) || user.privileges.has("NetworkManager")) &&
    canManageResponsibles(user, teamResponsible, responsibles)
  );
}

/**
 * Attaching and detaching the responsible groups of a segment: the team of the
 * network, a group responsible for the segment, or a manager; no privilege.
 */
export function canManageResponsibles(
  user: NetworkUser,
  teamResponsible: string | undefined,
  responsibles: readonly string[],
): boolean {
  return ownsNetwork(user, teamResponsible) || responsibles.some((role) => user.groups.has(role));
}

/**
 * A network typed as "address/prefix", as its detail shows it: the address and
 * the prefix length, or null for anything else. The server checks the address is
 * the network's.
 */
export function parseCidr(value: string): { network: string; netmask: number } | null {
  const match = /^\s*(\d{1,3}(?:\.\d{1,3}){3})\s*\/\s*(\d{1,2})\s*$/.exec(value);
  if (match === null) return null;
  const [, network, prefix] = match;
  const netmask = Number(prefix);
  if (network === undefined || netmask > 32) return null;
  if (network.split(".").some((byte) => Number(byte) > 255)) return null;
  return { network, netmask };
}

/**
 * The body of a change of the detail: the address and the prefix split from the
 * `cidr` field. Throws, with the key of the message, when it is not one.
 */
export function toNetworkChanges(changes: Record<string, string | number | boolean>) {
  const body: NetworkChanges = {};
  for (const [prop, value] of Object.entries(changes)) {
    if (prop === "cidr") {
      const parsed = parseCidr(String(value));
      if (parsed === null) throw new Error("networks.declared.detail.cidrInvalid");
      body.network = parsed.network;
      body.netmask = parsed.netmask;
    } else if (prop === "pvid" || prop === "prio") {
      body[prop] = Number(value);
    } else if (
      prop === "name" ||
      prop === "gateway" ||
      prop === "comment" ||
      prop === "team_responsible"
    ) {
      body[prop] = String(value).trim();
    }
  }
  return body;
}
