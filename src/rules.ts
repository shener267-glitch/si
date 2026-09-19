import type { Device, Port } from "./types";

// V2 principle: don't restrict by device type. Any two wired ports (WAN/LAN/ETHERNET)
// can be cabled together; WIFI only pairs with WIFI. Whether it actually produces
// working communication is decided by the diagnostics engine, not by this check.
const WIRED = new Set(["WAN", "LAN", "ETHERNET"]);

export interface ConnectionCheck {
  ok: boolean;
  reason?: string;
}

export function portsPhysicallyCompatible(a: Port, b: Port): boolean {
  if (a.type === "WIFI" || b.type === "WIFI") {
    return a.type === "WIFI" && b.type === "WIFI";
  }
  return WIRED.has(a.type) && WIRED.has(b.type);
}

export function hasFreeCapacity(port: Port, usedCount: number): boolean {
  if (port.status === "down") return false;
  if (port.capacity === null) return true; // unlimited
  const cap = port.capacity ?? 1;
  return usedCount < cap;
}

export function validatePhysicalConnection(
  a: Device,
  b: Device,
  usageOf: (deviceId: string, portId: string) => number
): ConnectionCheck & { fromPort?: Port; toPort?: Port } {
  if (a.id === b.id) {
    return { ok: false, reason: "同じ機器同士は接続できません。" };
  }
  if (a.x === null || b.x === null) {
    return { ok: false, reason: "先に機器をオフィスに配置してください。" };
  }
  // Try every free port on A against every free port on B for compatibility.
  for (const portA of a.ports) {
    if (!hasFreeCapacity(portA, usageOf(a.id, portA.id))) continue;
    for (const portB of b.ports) {
      if (!hasFreeCapacity(portB, usageOf(b.id, portB.id))) continue;
      if (portsPhysicallyCompatible(portA, portB)) {
        return { ok: true, fromPort: portA, toPort: portB };
      }
    }
  }
  // Nothing worked: figure out the most helpful reason.
  const aHasFree = a.ports.some((p) => hasFreeCapacity(p, usageOf(a.id, p.id)));
  const bHasFree = b.ports.some((p) => hasFreeCapacity(p, usageOf(b.id, p.id)));
  if (!aHasFree) return { ok: false, reason: `${a.name}に空いているポートがありません。` };
  if (!bHasFree) return { ok: false, reason: `${b.name}に空いているポートがありません。` };
  return {
    ok: false,
    reason: `${a.name}と${b.name}には互換性のあるポート（有線同士/無線同士）がありません。`,
  };
}
