import { findL2Domain, isValidIp, resolveAllConfigs, routerReachesInternet, sameSubnet } from "./netutils";
import { connectionsOf, internetDeviceId } from "./state";
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
  port: "ポート状態",
  ip: "IPアドレス",
  subnet: "サブネット",
  gateway: "デフォルトゲートウェイ",
  route: "ルーティング",
  nat: "NAT",
  dns: "DNS",
  internet: "インターネット到達",
};

function ok(key: DiagStepKey): DiagStep {
  return { key, label: STEP_LABELS[key], status: "ok" };
}

function fail(key: DiagStepKey, detail: string): DiagStep {
  return { key, label: STEP_LABELS[key], status: "fail", detail };
}

function skipped(key: DiagStepKey): DiagStep {
  return { key, label: STEP_LABELS[key], status: "skipped", detail: "前段階の問題により未確認" };
}

const REMAINING_ORDER: DiagStepKey[] = [
  "physical",
  "port",
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
    for (let i = failedAt + 1; i < REMAINING_ORDER.length; i++) {
      steps.push(skipped(REMAINING_ORDER[i]));
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

  // 2. port status along the direct link + router side
  const myDownLink = connectionsOf(state, device.id)[0];
  const myPort = device.ports.find(
    (p) => p.id === myDownLink.fromPort || p.id === myDownLink.toPort
  );
  if (myPort && myPort.status === "down") {
    steps.push(fail("port", `${device.name}のポートが無効になっています。`));
    return finish(1);
  }
  steps.push(ok("port"));

  // 3. IP
  const resolved = resolveAllConfigs(state).get(device.id) ?? {};
  const cfg = device.networkConfig as ClientConfig | undefined;
  if (resolved.duplicateOf) {
    steps.push(fail("ip", `IPアドレスが重複しています（${resolved.duplicateOf}と同じ）。`));
    return finish(2);
  }
  if (cfg?.dhcpEnabled && resolved.dhcpFailed) {
    steps.push(fail("ip", "IPアドレスを取得できません（DHCPサーバーが見つかりません）。"));
    return finish(2);
  }
  if (!resolved.ip || !isValidIp(resolved.ip)) {
    steps.push(fail("ip", "IPアドレスが設定されていません。"));
    return finish(2);
  }
  steps.push(ok("ip"));

  // 4. Subnet
  if (!resolved.subnetMask || !isValidIp(resolved.subnetMask)) {
    steps.push(fail("subnet", "サブネットマスクが設定されていません。"));
    return finish(3);
  }
  steps.push(ok("subnet"));

  // 5. Gateway
  const routerConfig = domain.router.networkConfig as RouterConfig;
  if (!resolved.gateway) {
    steps.push(fail("gateway", "デフォルトゲートウェイが設定されていません。"));
    return finish(4);
  }
  if (!sameSubnet(resolved.ip, resolved.gateway, resolved.subnetMask)) {
    steps.push(fail("gateway", `ゲートウェイ（${resolved.gateway}）が自分のサブネットと異なります。`));
    return finish(4);
  }
  if (resolved.gateway !== routerConfig.lanIp) {
    steps.push(fail("gateway", `ゲートウェイ（${resolved.gateway}）に到達できません。`));
    return finish(4);
  }
  steps.push(ok("gateway"));

  // 6. Routing (router -> internet, e.g. via ONU)
  if (!routerReachesInternet(state, domain.router.id, internetDeviceId())) {
    steps.push(fail("route", "ルーターがインターネット回線（ONU）に接続されていません。"));
    return finish(5);
  }
  steps.push(ok("route"));

  // 7. NAT
  if (!routerConfig.natEnabled) {
    steps.push(fail("nat", "ルーターのNAT設定が無効になっています。"));
    return finish(6);
  }
  steps.push(ok("nat"));

  // 8. DNS
  if (!resolved.dns || !isValidIp(resolved.dns)) {
    steps.push(fail("dns", "DNSサーバーが設定されていません。"));
    return finish(7);
  }
  steps.push(ok("dns"));

  // 9. Internet
  steps.push(ok("internet"));
  return finish(-1);
}

export function runCommunicationTest(state: GameState): DeviceDiagnosis[] {
  return state.devices
    .filter((d) => (d.type === "pc" || d.type === "server") && d.x !== null)
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
  const domain = findL2Domain(state, sourceDeviceId);
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
