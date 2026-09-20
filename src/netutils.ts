import { isVlanCapable } from "./devices";
import { connectionsOf, deviceById, neighborsOf } from "./state";
import { DEFAULT_VLAN_ID, isComputerType } from "./types";
import type { ClientConfig, Connection, Device, GameState, Port, RouterConfig } from "./types";

export function ipToInt(ip: string | undefined): number | null {
  if (!ip) return null;
  const parts = ip.trim().split(".");
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n < 0 || n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

export function intToIp(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".");
}

export function isValidIp(ip: string | undefined): boolean {
  return ipToInt(ip) !== null;
}

export function sameSubnet(ipA: string, ipB: string, mask: string): boolean {
  const a = ipToInt(ipA);
  const b = ipToInt(ipB);
  const m = ipToInt(mask);
  if (a === null || b === null || m === null) return false;
  return (a & m) === (b & m);
}

/** BFS from a client, stopping at (but recording) the first router boundary. */
export function findL2Domain(
  state: GameState,
  startId: string
): { router: Device | null; memberIds: Set<string> } {
  const start = deviceById(state, startId);
  if (!start) return { router: null, memberIds: new Set() };
  const memberIds = new Set<string>([startId]);
  const visited = new Set<string>([startId]);
  let router: Device | null = null;
  const queue: Device[] = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const neighbor of neighborsOf(state, current.id)) {
      if (visited.has(neighbor.id)) continue;
      visited.add(neighbor.id);
      if (neighbor.type === "router") {
        if (!router) router = neighbor;
        continue;
      }
      if (neighbor.type === "onu" || neighbor.type === "internet") {
        continue;
      }
      memberIds.add(neighbor.id);
      queue.push(neighbor);
    }
  }
  return { router, memberIds };
}

/**
 * Applies a switch port's VLAN filter to a frame carrying `vlan` (null = not yet
 * constrained by any switch). Returns the VLAN the frame continues with, or "blocked"
 * if this port's config doesn't allow it through (design doc v6 §5/§6). Ports on any
 * non-switch device are VLAN-transparent - only switches enforce membership.
 */
function applyPortVlanFilter(device: Device, port: Port, vlan: number | null): number | "blocked" | null {
  if (!isVlanCapable(device.type)) return vlan;
  if (port.vlanMode === "trunk") {
    if (vlan === null) return "blocked";
    return (port.trunkVlans ?? []).includes(vlan) ? vlan : "blocked";
  }
  const accessVlan = port.accessVlan ?? DEFAULT_VLAN_ID;
  if (vlan === null) return accessVlan;
  return vlan === accessVlan ? vlan : "blocked";
}

function portOnDevice(device: Device, conn: Connection): Port | undefined {
  const portId = conn.fromDevice === device.id ? conn.fromPort : conn.toPort;
  return device.ports.find((p) => p.id === portId);
}

/**
 * VLAN-aware counterpart to `findL2Domain`: BFS from a device, but a hop across a
 * switch port only continues if that port's access VLAN / trunk VLAN list allows the
 * VLAN currently in play (design doc v6 §3-§6). With every port left at its default
 * (access, VLAN 1), this returns exactly what `findL2Domain` would.
 */
export function findVlanDomain(
  state: GameState,
  startId: string
): { router: Device | null; memberIds: Set<string> } {
  const start = deviceById(state, startId);
  if (!start) return { router: null, memberIds: new Set() };
  const memberIds = new Set<string>([startId]);
  const visited = new Set<string>([`${startId}:null`]);
  let router: Device | null = null;
  const queue: Array<{ device: Device; vlan: number | null }> = [{ device: start, vlan: null }];
  while (queue.length) {
    const { device: current, vlan } = queue.shift()!;
    for (const conn of connectionsOf(state, current.id)) {
      const otherId = conn.fromDevice === current.id ? conn.toDevice : conn.fromDevice;
      const neighbor = deviceById(state, otherId);
      const exitPort = portOnDevice(current, conn);
      if (!neighbor || !exitPort) continue;
      const vlanAfterExit = applyPortVlanFilter(current, exitPort, vlan);
      if (vlanAfterExit === "blocked") continue;
      const entryPort = portOnDevice(neighbor, conn);
      if (!entryPort) continue;
      const vlanAfterEntry = applyPortVlanFilter(neighbor, entryPort, vlanAfterExit);
      if (vlanAfterEntry === "blocked") continue;
      const key = `${neighbor.id}:${vlanAfterEntry}`;
      if (visited.has(key)) continue;
      visited.add(key);
      if (neighbor.type === "router") {
        if (!router) router = neighbor;
        continue;
      }
      if (neighbor.type === "onu" || neighbor.type === "internet") continue;
      memberIds.add(neighbor.id);
      queue.push({ device: neighbor, vlan: vlanAfterEntry });
    }
  }
  return { router, memberIds };
}

/** VLAN-aware counterpart to `domainClientsOfRouter` - only clients whose VLAN path
 * back to the router isn't blocked by an access/trunk mismatch are included, so DHCP
 * and duplicate-IP checks respect VLAN isolation (design doc v6 §5/§11). */
export function vlanDomainClientsOfRouter(state: GameState, routerId: string): Device[] {
  const { memberIds } = findVlanDomain(state, routerId);
  return state.devices.filter(
    (d) => memberIds.has(d.id) && (isComputerType(d.type) || d.type === "server")
  );
}

/** Does the router have a physical path (through ONU or otherwise) to the fixed Internet node? */
export function routerReachesInternet(state: GameState, routerId: string, internetId: string): boolean {
  const visited = new Set<string>([routerId]);
  const queue: string[] = [routerId];
  while (queue.length) {
    const currentId = queue.shift()!;
    if (currentId === internetId) return true;
    for (const neighbor of neighborsOf(state, currentId)) {
      if (visited.has(neighbor.id)) continue;
      visited.add(neighbor.id);
      queue.push(neighbor.id);
    }
  }
  return false;
}

/** Shortest hop-by-hop path between two devices (BFS), or null if unreachable. */
export function shortestPathDevices(
  state: GameState,
  fromId: string,
  toId: string
): Device[] | null {
  const start = deviceById(state, fromId);
  if (!start) return null;
  if (fromId === toId) return [start];
  const visited = new Set<string>([fromId]);
  const queue: Device[][] = [[start]];
  while (queue.length) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    for (const neighbor of neighborsOf(state, last.id)) {
      if (visited.has(neighbor.id)) continue;
      visited.add(neighbor.id);
      const nextPath = [...path, neighbor];
      if (neighbor.id === toId) return nextPath;
      queue.push(nextPath);
    }
  }
  return null;
}

export function findConnectionBetween(
  state: GameState,
  aId: string,
  bId: string
): Connection | undefined {
  return state.connections.find(
    (c) =>
      (c.fromDevice === aId && c.toDevice === bId) || (c.fromDevice === bId && c.toDevice === aId)
  );
}

export interface ResolvedConfig {
  ip?: string;
  subnetMask?: string;
  gateway?: string;
  dns?: string;
  dhcpFailed?: boolean;
  duplicateOf?: string;
}

export function resolveAllConfigs(state: GameState): Map<string, ResolvedConfig> {
  const result = new Map<string, ResolvedConfig>();
  const clients = state.devices.filter(
    (d) => (isComputerType(d.type) || d.type === "server") && d.x !== null
  );
  const routers = state.devices.filter((d) => d.type === "router" && d.x !== null);

  for (const client of clients) {
    const cfg = client.networkConfig as ClientConfig | undefined;
    if (!cfg || cfg.dhcpEnabled) {
      result.set(client.id, {});
    } else {
      result.set(client.id, {
        ip: cfg.ip,
        subnetMask: cfg.subnetMask,
        gateway: cfg.gateway,
        dns: cfg.dns,
      });
    }
  }

  for (const router of routers) {
    const rc = router.networkConfig as RouterConfig;
    if (!rc.dhcpEnabled) continue;
    const domainClients = vlanDomainClientsOfRouter(state, router.id);
    const usedIps = new Set<string>();
    for (const c of domainClients) {
      const ip = result.get(c.id)?.ip;
      if (ip) usedIps.add(ip);
    }
    const startInt = ipToInt(rc.dhcpStart);
    const endInt = ipToInt(rc.dhcpEnd);
    if (startInt === null || endInt === null) continue;
    let cursor = startInt;
    for (const client of domainClients) {
      const cfg = client.networkConfig as ClientConfig | undefined;
      if (!cfg?.dhcpEnabled) continue;
      let assigned: string | null = null;
      while (cursor <= endInt) {
        const candidate = intToIp(cursor);
        cursor++;
        if (!usedIps.has(candidate)) {
          assigned = candidate;
          break;
        }
      }
      if (assigned) {
        usedIps.add(assigned);
        result.set(client.id, {
          ip: assigned,
          subnetMask: rc.subnetMask,
          gateway: rc.lanIp,
          dns: rc.lanIp,
        });
      } else {
        result.set(client.id, { dhcpFailed: true });
      }
    }
  }

  for (const client of clients) {
    const cfg = client.networkConfig as ClientConfig | undefined;
    const current = result.get(client.id);
    if (cfg?.dhcpEnabled && !current?.ip) {
      result.set(client.id, { ...(current ?? {}), dhcpFailed: true });
    }
  }

  for (const router of routers) {
    const domainClients = vlanDomainClientsOfRouter(state, router.id);
    const byIp = new Map<string, Device[]>();
    for (const c of domainClients) {
      const ip = result.get(c.id)?.ip;
      if (!ip) continue;
      const list = byIp.get(ip) ?? [];
      list.push(c);
      byIp.set(ip, list);
    }
    for (const group of byIp.values()) {
      if (group.length <= 1) continue;
      for (const c of group) {
        const others = group
          .filter((g) => g.id !== c.id)
          .map((g) => g.name)
          .join("、");
        const existing = result.get(c.id) ?? {};
        result.set(c.id, { ...existing, duplicateOf: others });
      }
    }
  }

  return result;
}
