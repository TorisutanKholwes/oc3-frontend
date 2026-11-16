import { describe, expect, it } from "vitest";
import {
  canManageResponsibles,
  canWriteNetwork,
  canWriteSegment,
  parseCidr,
  toNetworkChanges,
  type NetworkUser,
} from "./network-access";

const user = (privileges: string[], groups: string[]): NetworkUser => ({
  privileges: new Set(privileges),
  groups: new Set(groups),
});

describe("canWriteNetwork", () => {
  it("takes the NetworkManager privilege and the team of the network", () => {
    expect(canWriteNetwork(user(["NetworkManager"], ["netops"]), "netops")).toBe(true);
    expect(canWriteNetwork(user(["NetworkManager"], ["dba"]), "netops")).toBe(false);
    expect(canWriteNetwork(user([], ["netops"]), "netops")).toBe(false);
  });

  it("lets a manager write any network", () => {
    expect(canWriteNetwork(user(["Manager"], []), "netops")).toBe(true);
  });

  it("does not take an empty team for a membership", () => {
    expect(canWriteNetwork(user(["NetworkManager"], [""]), "")).toBe(false);
  });
});

describe("canWriteSegment", () => {
  it("takes the privilege and the team or a responsible group", () => {
    expect(canWriteSegment(user(["NetworkManager"], ["dba"]), "netops", ["dba"])).toBe(true);
    expect(canWriteSegment(user(["NetworkManager"], ["netops"]), "netops", [])).toBe(true);
    expect(canWriteSegment(user([], ["dba"]), "netops", ["dba"])).toBe(false);
    expect(canWriteSegment(user(["NetworkManager"], ["web"]), "netops", ["dba"])).toBe(false);
  });
});

describe("canManageResponsibles", () => {
  it("needs no privilege, only the team or a responsible group", () => {
    expect(canManageResponsibles(user([], ["dba"]), "netops", ["dba"])).toBe(true);
    expect(canManageResponsibles(user([], ["netops"]), "netops", [])).toBe(true);
    expect(canManageResponsibles(user([], ["web"]), "netops", ["dba"])).toBe(false);
    expect(canManageResponsibles(user(["Manager"], []), "netops", [])).toBe(true);
  });
});

describe("parseCidr", () => {
  it("splits an address and its prefix", () => {
    expect(parseCidr("10.1.0.0/16")).toEqual({ network: "10.1.0.0", netmask: 16 });
    expect(parseCidr(" 192.168.1.0 / 24 ")).toEqual({ network: "192.168.1.0", netmask: 24 });
  });

  it("refuses anything else", () => {
    expect(parseCidr("10.1.0.0")).toBeNull();
    expect(parseCidr("10.1.0.0/33")).toBeNull();
    expect(parseCidr("10.1.0.300/24")).toBeNull();
    expect(parseCidr("fe80::/64")).toBeNull();
  });
});

describe("toNetworkChanges", () => {
  it("sends the address and the prefix of the network field", () => {
    expect(toNetworkChanges({ cidr: "10.2.0.0/24" })).toEqual({
      network: "10.2.0.0",
      netmask: 24,
    });
  });

  it("sends numbers for the VLAN and the priority", () => {
    expect(toNetworkChanges({ pvid: "120", prio: 3 })).toEqual({ pvid: 120, prio: 3 });
  });

  it("sends an emptied gateway, which unsets it", () => {
    expect(toNetworkChanges({ gateway: " " })).toEqual({ gateway: "" });
  });

  it("refuses a network that is not address/prefix", () => {
    expect(() => toNetworkChanges({ cidr: "10.2.0.0" })).toThrow(
      "networks.declared.detail.cidrInvalid",
    );
  });

  it("leaves out what is not a property of a network", () => {
    expect(toNetworkChanges({ broadcast: "10.0.0.255", name: "lan" })).toEqual({ name: "lan" });
  });
});
