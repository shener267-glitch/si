import { internetDeviceId } from "./state";
import type { Device, GameState, PcDiagnosis } from "./types";

function neighbors(state: GameState, device: Device): Device[] {
  const result: Device[] = [];
  for (const connId of device.connections) {
    const conn = state.connections.find((c) => c.id === connId);
    if (!conn) continue;
    const otherId = conn.fromId === device.id ? conn.toId : conn.fromId;
    const other = state.devices.find((d) => d.id === otherId);
    if (other) result.push(other);
  }
  return result;
}

function connectedComponent(state: GameState, start: Device): Set<string> {
  const visited = new Set<string>([start.id]);
  const queue: Device[] = [start];
  while (queue.length) {
    const current = queue.shift()!;
    for (const n of neighbors(state, current)) {
      if (!visited.has(n.id)) {
        visited.add(n.id);
        queue.push(n);
      }
    }
  }
  return visited;
}

function findPath(state: GameState, from: Device, to: Device): Device[] | null {
  const visited = new Set<string>([from.id]);
  const queue: Array<{ device: Device; path: Device[] }> = [
    { device: from, path: [from] },
  ];
  while (queue.length) {
    const { device, path } = queue.shift()!;
    if (device.id === to.id) return path;
    for (const n of neighbors(state, device)) {
      if (!visited.has(n.id)) {
        visited.add(n.id);
        queue.push({ device: n, path: [...path, n] });
      }
    }
  }
  return null;
}

function diagnoseFailure(state: GameState, pc: Device): string {
  if (pc.connections.length === 0) {
    return `${pc.name}はどの機器にも接続されていません。`;
  }
  const component = connectedComponent(state, pc);
  const componentDevices = state.devices.filter((d) => component.has(d.id));

  const router = componentDevices.find((d) => d.type === "router");
  const anyRouterExists = state.devices.some((d) => d.type === "router");

  if (!anyRouterExists) {
    return "ルーターがネットワークに存在しません。";
  }

  if (!router) {
    const switchInComponent = componentDevices.find(
      (d) => d.type === "switch4" || d.type === "switch8"
    );
    if (switchInComponent) {
      return `${switchInComponent.name} → Router の経路がありません。`;
    }
    return `${pc.name} → Router の経路がありません。`;
  }

  const internetId = internetDeviceId();
  if (!component.has(internetId)) {
    return `${router.name}がインターネットに接続されていません。`;
  }

  return "インターネットまでの経路がありません。";
}

export function diagnosePc(state: GameState, pc: Device): PcDiagnosis {
  const internet = state.devices.find((d) => d.id === internetDeviceId());
  if (!internet) {
    return {
      deviceId: pc.id,
      name: pc.name,
      success: false,
      path: [pc.name],
      reason: "インターネットが見つかりません。",
    };
  }
  const path = findPath(state, pc, internet);
  if (path) {
    return {
      deviceId: pc.id,
      name: pc.name,
      success: true,
      path: path.map((d) => d.name),
    };
  }
  return {
    deviceId: pc.id,
    name: pc.name,
    success: false,
    path: [pc.name],
    reason: diagnoseFailure(state, pc),
  };
}

export function runCommunicationTest(state: GameState): PcDiagnosis[] {
  const pcs = state.devices.filter((d) => d.type === "pc" && d.x !== null);
  return pcs.map((pc) => diagnosePc(state, pc));
}

export function missionProgress(state: GameState): {
  onlinePcCount: number;
  totalPcCount: number;
  routerCount: number;
  switchCount: number;
} {
  const results = runCommunicationTest(state);
  const onlinePcCount = results.filter((r) => r.success).length;
  const totalPcCount = state.devices.filter(
    (d) => d.type === "pc" && d.x !== null
  ).length;
  const routerCount = state.devices.filter(
    (d) => d.type === "router" && d.x !== null
  ).length;
  const switchCount = state.devices.filter(
    (d) => (d.type === "switch4" || d.type === "switch8") && d.x !== null
  ).length;
  return { onlinePcCount, totalPcCount, routerCount, switchCount };
}

export function isMissionClear(state: GameState): boolean {
  const progress = missionProgress(state);
  return (
    progress.onlinePcCount >= state.mission.requiredPcCount &&
    progress.totalPcCount >= state.mission.requiredPcCount
  );
}
