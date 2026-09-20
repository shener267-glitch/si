import { CABLE_MAX_METERS, cableLengthMeters, isCableTooLong } from "./cables";
import {
  findConnectionBetween,
  findL2Domain,
  findVlanDomain,
  isValidIp,
  resolveAllConfigs,
  routerReachesInternet,
  sameSubnet,
  shortestPathDevices,
} from "./netutils";
import { connectionsOf, internetDeviceId } from "./state";
import { isComputerType } from "./types";
import type {
  ClientConfig,
  DeviceDiagnosis,
  DiagStep,
  DiagStepKey,
  GameState,
  PingResult,
  RouterConfig,
} from "./types";

const STEP_LABELS: Record<DiagStepKey, string> = {
  physical: "物理接続",
  power: "電源",
  cable: "ケーブル長",
  port: "ポート状態",
  vlan: "VLAN",
  ip: "IPアドレス",
  subnet: "サブネット",
  gateway: "デフォルトゲートウェイ",
  route: "ルーティング",
  nat: "NAT",
  dns: "DNS",
  internet: "インターネット到達",
};

function ok(key: DiagStepKey, detail?: string): DiagStep {
  return { key, label: STEP_LABELS[key], status: "ok", detail };
}

function fail(key: DiagStepKey, detail: string): DiagStep {
  return { key, label: STEP_LABELS[key], status: "fail", detail };
}

function skipped(key: DiagStepKey): DiagStep {
  return { key, label: STEP_LABELS[key], status: "skipped", detail: "前段階の問題により未確認" };
}

const REMAINING_ORDER: DiagStepKey[] = [
  "physical",
  "power",
  "cable",
  "port",
  "vlan",
  "ip",
  "subnet",
  "gateway",
  "route",
  "nat",
  "dns",
  "internet",
];

export function diagnoseDevice(state: GameState, deviceId: string): DeviceDiagnosis {
  const device = state.devices.find((d) => d.id === deviceId);
  const steps: DiagStep[] = [];
  const finish = (failedAt: number): DeviceDiagnosis => {
    // failedAt === -1 means every step already pushed "ok" (full success) -
    // there is nothing left to mark as skipped.
    if (failedAt >= 0) {
      for (let i = failedAt + 1; i < REMAINING_ORDER.length; i++) {
        steps.push(skipped(REMAINING_ORDER[i]));
      }
    }
    return { deviceId, name: device?.name ?? deviceId, steps, success: failedAt === -1 };
  };

  if (!device) {
    steps.push(fail("physical", "機器が見つかりません。"));
    return finish(0);
  }

  // 1. physical
  const domain = findL2Domain(state, device.id);
  const hasAnyLink = connectionsOf(state, device.id).length > 0;
  if (!hasAnyLink) {
    steps.push(fail("physical", `${device.name}はどの機器にも接続されていません。`));
    return finish(0);
  }
  if (!domain.router) {
    steps.push(fail("physical", "ルーターまでの物理的な経路が見つかりません。"));
    return finish(0);
  }
  steps.push(ok("physical"));

  // Power and cable-length checks need the *full* physical route all the way to the
  // Internet node (including the router's WAN-side hop through the ONU), not just the
  // LAN-side hop to the router - otherwise turning off the ONU, or an over-length WAN
  // cable, would go undetected. Falls back to the LAN-only path if the WAN side isn't
  // wired yet; the later "route" step catches that case on its own.
  const path =
    shortestPathDevices(state, device.id, internetDeviceId()) ??
    shortestPathDevices(state, device.id, domain.router.id) ??
    [device, domain.router];

  // 2. power along the path to the Internet (the passive jack/patch-panel hops have no power field)
  const unpoweredHop = path.find((d) => d.id !== device.id && d.power === "off");
  if (unpoweredHop) {
    steps.push(fail("power", `${unpoweredHop.name}の電源が入っていません。`));
    return finish(1);
  }
  steps.push(ok("power"));

  // 3. cable length along the same path (straight-line distance; design doc v3 §12)
  let tooLong: { a: string; b: string; length: number } | null = null;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (a.x === null || a.y === null || b.x === null || b.y === null) continue;
    const length = cableLengthMeters(a.x, a.y, b.x, b.y);
    if (isCableTooLong(length)) {
      tooLong = { a: a.name, b: b.name, length };
      break;
    }
  }
  if (tooLong) {
    steps.push(
      fail(
        "cable",
        `${tooLong.a} ↔ ${tooLong.b} 間のケーブルが長すぎます（${tooLong.length.toFixed(1)}m / 上限${CABLE_MAX_METERS}m）。中継するスイッチやパッチパネルを間に設置しましょう。`
      )
    );
    return finish(2);
  }
  steps.push(ok("cable"));

  // 4. port status along the whole path - a disabled port on EITHER end of any hop
  // (not just this device's own NIC) breaks that link, e.g. a faulted switch port.
  let downPortHop: { name: string } | null = null;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const link = findConnectionBetween(state, a.id, b.id);
    if (!link) continue;
    const aPort = a.ports.find((p) => p.id === link.fromPort || p.id === link.toPort);
    const bPort = b.ports.find((p) => p.id === link.fromPort || p.id === link.toPort);
    if (aPort?.status === "down") {
      downPortHop = { name: a.name };
      break;
    }
    if (bPort?.status === "down") {
      downPortHop = { name: b.name };
      break;
    }
  }
  if (downPortHop) {
    steps.push(fail("port", `${downPortHop.name}のポートが無効になっています。`));
    return finish(3);
  }
  steps.push(ok("port"));

  // 5. VLAN - the physical route above exists, but a switch access/trunk port along
  // the way may still keep this device's VLAN from ever reaching the router's VLAN
  // (design doc v6 §3-§6). Checked separately from "physical" so the message is clear:
  // the cable is fine, the logical network segmentation is what's blocking it.
  const vlanDomain = findVlanDomain(state, device.id);
  if (!vlanDomain.router) {
    steps.push(
      fail(
        "vlan",
        `VLANの設定が原因で${domain.router.name}に到達できません。アクセスポート/トランクポートの設定を確認しましょう。`
      )
    );
    return finish(4);
  }
  steps.push(ok("vlan"));

  // 6. IP
  const resolved = resolveAllConfigs(state).get(device.id) ?? {};
  const cfg = device.networkConfig as ClientConfig | undefined;
  if (resolved.duplicateOf) {
    steps.push(fail("ip", `IPアドレスが重複しています（${resolved.duplicateOf}と同じ）。`));
    return finish(5);
  }
  if (cfg?.dhcpEnabled && resolved.dhcpFailed) {
    steps.push(fail("ip", "IPアドレスを取得できません（DHCPサーバーが見つかりません）。"));
    return finish(5);
  }
  if (!resolved.ip || !isValidIp(resolved.ip)) {
    steps.push(fail("ip", "IPアドレスが設定されていません。"));
    return finish(5);
  }
  steps.push(ok("ip", `${resolved.ip}${cfg?.dhcpEnabled ? "（DHCPで自動取得）" : "（手動設定）"}`));

  // 7. Subnet
  if (!resolved.subnetMask || !isValidIp(resolved.subnetMask)) {
    steps.push(fail("subnet", "サブネットマスクが設定されていません。"));
    return finish(6);
  }
  steps.push(ok("subnet", resolved.subnetMask));

  // 8. Gateway
  const routerConfig = domain.router.networkConfig as RouterConfig;
  if (!resolved.gateway) {
    steps.push(fail("gateway", "デフォルトゲートウェイが設定されていません。"));
    return finish(7);
  }
  if (!sameSubnet(resolved.ip, resolved.gateway, resolved.subnetMask)) {
    steps.push(fail("gateway", `ゲートウェイ（${resolved.gateway}）が自分のサブネットと異なります。`));
    return finish(7);
  }
  if (resolved.gateway !== routerConfig.lanIp) {
    steps.push(fail("gateway", `ゲートウェイ（${resolved.gateway}）に到達できません。`));
    return finish(7);
  }
  steps.push(ok("gateway", resolved.gateway));

  // 9. Routing (router -> internet, e.g. via ONU)
  if (!routerReachesInternet(state, domain.router.id, internetDeviceId())) {
    steps.push(fail("route", "ルーターがインターネット回線（ONU）に接続されていません。"));
    return finish(8);
  }
  steps.push(ok("route"));

  // 10. NAT
  if (!routerConfig.natEnabled) {
    steps.push(fail("nat", "ルーターのNAT設定が無効になっています。"));
    return finish(9);
  }
  steps.push(ok("nat"));

  // 11. DNS
  if (!resolved.dns || !isValidIp(resolved.dns)) {
    steps.push(fail("dns", "DNSサーバーが設定されていません。"));
    return finish(10);
  }
  steps.push(ok("dns", resolved.dns));

  // 12. Internet
  steps.push(ok("internet"));
  return finish(-1);
}

export function runCommunicationTest(state: GameState): DeviceDiagnosis[] {
  return state.devices
    .filter((d) => (isComputerType(d.type) || d.type === "server") && d.x !== null)
    .map((d) => diagnoseDevice(state, d.id));
}

export function ping(state: GameState, sourceDeviceId: string, targetIp: string): PingResult {
  const resolved = resolveAllConfigs(state).get(sourceDeviceId);
  if (!resolved?.ip || !isValidIp(resolved.ip)) {
    return { target: targetIp, success: false, message: "送信元に有効なIPアドレスがありません。" };
  }
  if (!isValidIp(targetIp)) {
    return { target: targetIp, success: false, message: "宛先IPアドレスの形式が正しくありません。" };
  }
  const domain = findVlanDomain(state, sourceDeviceId);
  const mask = resolved.subnetMask;

  if (mask && sameSubnet(resolved.ip, targetIp, mask)) {
    // Same LAN: succeeds if some device in the domain actually has that IP.
    const allConfigs = resolveAllConfigs(state);
    const targetInDomain = [...domain.memberIds].some((id) => allConfigs.get(id)?.ip === targetIp);
    const isGateway = domain.router && (domain.router.networkConfig as RouterConfig).lanIp === targetIp;
    if (targetInDomain || isGateway) {
      return { target: targetIp, success: true, message: `Reply from ${targetIp}: Success` };
    }
    return { target: targetIp, success: false, message: "Request timed out." };
  }

  // Different subnet: treat as an external ping, needs full path to Internet.
  const diag = diagnoseDevice(state, sourceDeviceId);
  const reachesInternet = diag.steps.find((s) => s.key === "internet")?.status === "ok";
  if (reachesInternet) {
    return { target: targetIp, success: true, message: `Reply from ${targetIp}: Success` };
  }
  return { target: targetIp, success: false, message: "Request timed out." };
}
