import type { Device, DeviceType } from "./types";

// Unordered pairs of device types that are allowed to be cabled together in v0.1.
const VALID_PAIRS: Array<[DeviceType, DeviceType]> = [
  ["pc", "switch4"],
  ["pc", "switch8"],
  ["pc", "wifi"],
  ["wifi", "switch4"],
  ["wifi", "switch8"],
  ["switch4", "switch4"],
  ["switch4", "switch8"],
  ["switch8", "switch8"],
  ["switch4", "router"],
  ["switch8", "router"],
  ["server", "switch4"],
  ["server", "switch8"],
  ["router", "internet"],
];

function pairKey(a: DeviceType, b: DeviceType): string {
  return [a, b].sort().join("-");
}

const VALID_SET = new Set(VALID_PAIRS.map(([a, b]) => pairKey(a, b)));

export interface ConnectionCheck {
  ok: boolean;
  reason?: string;
}

function specificReason(a: DeviceType, b: DeviceType): string | undefined {
  const key = pairKey(a, b);
  if (key === pairKey("pc", "pc")) {
    return "PC同士を接続してもインターネットには繋がりません。";
  }
  if (key === pairKey("pc", "router")) {
    return "PCはルーターに直接接続できません。スイッチかWi-Fiを使いましょう。";
  }
  if (key === pairKey("pc", "internet")) {
    return "PCをインターネットに直接接続することはできません。";
  }
  if (key === pairKey("router", "router")) {
    return "ルーター同士は接続できません。";
  }
  return undefined;
}

export function checkTypesCompatible(a: DeviceType, b: DeviceType): ConnectionCheck {
  if (VALID_SET.has(pairKey(a, b))) return { ok: true };
  return {
    ok: false,
    reason: specificReason(a, b) ?? "この機器同士は接続できません。",
  };
}

export function portsUsed(device: Device): number {
  return device.connections.length;
}

export function hasFreePort(device: Device): boolean {
  if (device.ports === null) return true;
  return portsUsed(device) < device.ports;
}

export function validateConnection(a: Device, b: Device): ConnectionCheck {
  if (a.id === b.id) {
    return { ok: false, reason: "同じ機器同士は接続できません。" };
  }
  if (a.x === null || b.x === null) {
    return { ok: false, reason: "先に機器をオフィスに配置してください。" };
  }
  const alreadyConnected = a.connections.some((cid) =>
    b.connections.includes(cid)
  );
  if (alreadyConnected) {
    return { ok: false, reason: "すでに接続されています。" };
  }
  const typeCheck = checkTypesCompatible(a.type, b.type);
  if (!typeCheck.ok) return typeCheck;
  if (!hasFreePort(a)) {
    return { ok: false, reason: `${a.name}に空いているポートがありません。` };
  }
  if (!hasFreePort(b)) {
    return { ok: false, reason: `${b.name}に空いているポートがありません。` };
  }
  return { ok: true };
}
