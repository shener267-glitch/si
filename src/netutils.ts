import { deviceById, neighborsOf } from "./state";
import type { ClientConfig, Device, GameState, RouterConfig } from "./types";

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

/** PC/Server devices reachable from a router without crossing another router/ONU/Internet. */
export function domainClientsOfRouter(state: GameState, routerId: string): Device[] {
  const visited = new Set<string>([routerId]);
  const queue: string[] = [routerId];
  const clients: Device[] = [];
  while (queue.length) {
    const currentId = queue.shift()!;
    for (const neighbor of neighborsOf(state, currentId)) {
      if (visited.has(neighbor.id)) continue;
      visited.add(neighbor.id);
      if (neighbor.type === "router" || neighbor.type === "onu" || neighbor.type === "internet") {
        continue;
      }
      if (neighbor.type === "pc" || neighbor.type === "server") clients.push(neighbor);
      queue.push(neighbor.id);
    }
  }
  return clients;
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
    (d) => (d.type === "pc" || d.type === "server") && d.x !== null
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
    const domainClients = domainClientsOfRouter(state, router.id);
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
    const domainClients = domainClientsOfRouter(state, router.id);
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
