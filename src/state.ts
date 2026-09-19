import { catalogItem, createDevice, shortLabel } from "./devices";
import { DEFAULT_ROOMS } from "./rooms";
import { validatePhysicalConnection } from "./rules";
import type { ClientConfig, Connection, Device, DeviceType, GameState, RouterConfig } from "./types";

const OFFICE_WIDTH = 640;
const OFFICE_HEIGHT = 1100;
const INTERNET_ID = "internet-0";

export const OFFICE_SIZE = { width: OFFICE_WIDTH, height: OFFICE_HEIGHT };
export const STARTING_MONEY = 1_500_000;

export function createInitialState(): GameState {
  const internet = createDevice("internet", INTERNET_ID, "INTERNET", 0);
  internet.x = OFFICE_WIDTH / 2;
  internet.y = 50;
  return {
    money: STARTING_MONEY,
    devices: [internet],
    connections: [],
    rooms: DEFAULT_ROOMS,
    missionIndex: 0,
    missionCleared: {},
    mode: "idle",
    selectedDeviceId: null,
    connectFromId: null,
    nextDeviceSeq: {},
    nextConnSeq: 1,
  };
}

export function internetDeviceId(): string {
  return INTERNET_ID;
}

// Sequence numbers are counted per display label (e.g. "Switch"), not per exact
// DeviceType, so a 4-port and an 8-port switch don't both end up "Switch-01".
function nextSeq(state: GameState, label: string): number {
  const n = (state.nextDeviceSeq[label] ?? 0) + 1;
  state.nextDeviceSeq[label] = n;
  return n;
}

export function buyDevice(state: GameState, type: DeviceType): { ok: boolean; reason?: string } {
  const item = catalogItem(type);
  if (state.money < item.price) {
    return { ok: false, reason: "所持金が足りません。" };
  }
  const label = shortLabel(type);
  const seq = nextSeq(state, label);
  const id = `${type}-${seq}-${Date.now().toString(36)}`;
  const name = `${label}-${String(seq).padStart(2, "0")}`;
  const device = createDevice(type, id, name, item.price);
  state.money -= item.price;
  state.devices.push(device);
  return { ok: true };
}

export function unplacedDevices(state: GameState): Device[] {
  return state.devices.filter((d) => d.type !== "internet" && d.x === null);
}

export function placedDevices(state: GameState): Device[] {
  return state.devices.filter((d) => d.x !== null);
}

export function deviceById(state: GameState, id: string): Device | undefined {
  return state.devices.find((d) => d.id === id);
}

export function placeDevice(state: GameState, deviceId: string, x: number, y: number): void {
  const device = deviceById(state, deviceId);
  if (!device) return;
  device.x = Math.max(24, Math.min(OFFICE_WIDTH - 24, x));
  device.y = Math.max(24, Math.min(OFFICE_HEIGHT - 24, y));
}

export function moveDevice(state: GameState, deviceId: string, x: number, y: number): void {
  const device = deviceById(state, deviceId);
  if (!device || device.type === "internet") return;
  placeDevice(state, deviceId, x, y);
}

export function portUsageCount(state: GameState, deviceId: string, portId: string): number {
  return state.connections.filter(
    (c) =>
      (c.fromDevice === deviceId && c.fromPort === portId) ||
      (c.toDevice === deviceId && c.toPort === portId)
  ).length;
}

export function connectDevices(
  state: GameState,
  fromId: string,
  toId: string
): { ok: boolean; reason?: string } {
  const a = deviceById(state, fromId);
  const b = deviceById(state, toId);
  if (!a || !b) return { ok: false, reason: "機器が見つかりません。" };
  const alreadyDirectlyLinked = state.connections.some(
    (c) =>
      (c.fromDevice === a.id && c.toDevice === b.id) ||
      (c.fromDevice === b.id && c.toDevice === a.id)
  );
  if (alreadyDirectlyLinked) {
    return { ok: false, reason: "すでに接続されています。" };
  }
  const usageOf = (deviceId: string, portId: string) => portUsageCount(state, deviceId, portId);
  const check = validatePhysicalConnection(a, b, usageOf);
  if (!check.ok || !check.fromPort || !check.toPort) {
    return { ok: false, reason: check.reason };
  }
  const conn: Connection = {
    id: `conn-${state.nextConnSeq++}`,
    fromDevice: a.id,
    fromPort: check.fromPort.id,
    toDevice: b.id,
    toPort: check.toPort.id,
    kind: check.fromPort.type === "WIFI" ? "wifi" : "ethernet",
  };
  state.connections.push(conn);
  return { ok: true };
}

export function connectionsOf(state: GameState, deviceId: string): Connection[] {
  return state.connections.filter((c) => c.fromDevice === deviceId || c.toDevice === deviceId);
}

export function neighborsOf(state: GameState, deviceId: string): Device[] {
  const result: Device[] = [];
  for (const c of connectionsOf(state, deviceId)) {
    const otherId = c.fromDevice === deviceId ? c.toDevice : c.fromDevice;
    const other = deviceById(state, otherId);
    if (other) result.push(other);
  }
  return result;
}

export function setPortStatus(
  state: GameState,
  deviceId: string,
  portId: string,
  status: "up" | "down"
): void {
  const device = deviceById(state, deviceId);
  const port = device?.ports.find((p) => p.id === portId);
  if (port) port.status = status;
}

export function togglePower(state: GameState, deviceId: string): void {
  const device = deviceById(state, deviceId);
  if (!device || device.power === undefined) return;
  device.power = device.power === "on" ? "off" : "on";
}

export function disconnectCable(state: GameState, connectionId: string): void {
  state.connections = state.connections.filter((c) => c.id !== connectionId);
}

export function updateClientConfig(
  state: GameState,
  deviceId: string,
  patch: Partial<ClientConfig>
): void {
  const device = deviceById(state, deviceId);
  if (!device || (device.type !== "pc" && device.type !== "server")) return;
  const current = (device.networkConfig as ClientConfig) ?? { dhcpEnabled: true };
  device.networkConfig = { ...current, ...patch };
}

export function updateRouterConfig(
  state: GameState,
  deviceId: string,
  patch: Partial<RouterConfig>
): void {
  const device = deviceById(state, deviceId);
  if (!device || device.type !== "router") return;
  const current = device.networkConfig as RouterConfig;
  device.networkConfig = { ...current, ...patch };
}

export function resetState(): GameState {
  return createInitialState();
}
