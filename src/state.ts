import { catalogItem, shortLabel } from "./devices";
import { MISSION_01 } from "./missions";
import { validateConnection } from "./rules";
import type {
  Connection,
  Device,
  DeviceType,
  GameState,
} from "./types";

const OFFICE_WIDTH = 640;
const OFFICE_HEIGHT = 760;
const INTERNET_ID = "internet-0";

export function createInitialState(): GameState {
  const internet: Device = {
    id: INTERNET_ID,
    type: "internet",
    name: "INTERNET",
    x: OFFICE_WIDTH / 2,
    y: OFFICE_HEIGHT - 60,
    price: 0,
    ports: null,
    connections: [],
  };
  return {
    money: MISSION_01.budget,
    devices: [internet],
    connections: [],
    mission: MISSION_01,
    missionCleared: false,
    mode: "idle",
    selectedDeviceId: null,
    connectFromId: null,
    nextDeviceSeq: {},
    nextConnSeq: 1,
  };
}

export const OFFICE_SIZE = { width: OFFICE_WIDTH, height: OFFICE_HEIGHT };

function nextSeq(state: GameState, type: DeviceType): number {
  const n = (state.nextDeviceSeq[type] ?? 0) + 1;
  state.nextDeviceSeq[type] = n;
  return n;
}

export function buyDevice(state: GameState, type: DeviceType): { ok: boolean; reason?: string } {
  const item = catalogItem(type);
  if (state.money < item.price) {
    return { ok: false, reason: "所持金が足りません。" };
  }
  const seq = nextSeq(state, type);
  const device: Device = {
    id: `${type}-${seq}-${Date.now().toString(36)}`,
    type,
    name: `${shortLabel(type)}-${String(seq).padStart(2, "0")}`,
    x: null,
    y: null,
    price: item.price,
    ports: item.ports,
    connections: [],
  };
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

export function placeDevice(
  state: GameState,
  deviceId: string,
  x: number,
  y: number
): void {
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device) return;
  const clampedX = Math.max(24, Math.min(OFFICE_WIDTH - 24, x));
  const clampedY = Math.max(24, Math.min(OFFICE_HEIGHT - 24, y));
  device.x = clampedX;
  device.y = clampedY;
}

export function moveDevice(state: GameState, deviceId: string, x: number, y: number): void {
  const device = state.devices.find((d) => d.id === deviceId);
  if (!device || device.type === "internet") return;
  placeDevice(state, deviceId, x, y);
}

export function connectDevices(
  state: GameState,
  fromId: string,
  toId: string
): { ok: boolean; reason?: string } {
  const a = state.devices.find((d) => d.id === fromId);
  const b = state.devices.find((d) => d.id === toId);
  if (!a || !b) return { ok: false, reason: "機器が見つかりません。" };
  const check = validateConnection(a, b);
  if (!check.ok) return check;
  const conn: Connection = {
    id: `conn-${state.nextConnSeq++}`,
    fromId: a.id,
    toId: b.id,
  };
  state.connections.push(conn);
  a.connections.push(conn.id);
  b.connections.push(conn.id);
  return { ok: true };
}

export function deviceById(state: GameState, id: string): Device | undefined {
  return state.devices.find((d) => d.id === id);
}

export function internetDeviceId(): string {
  return INTERNET_ID;
}

export function resetState(): GameState {
  return createInitialState();
}
