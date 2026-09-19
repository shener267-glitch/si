import { diagnoseDevice } from "./diagnostics";
import { findL2Domain, resolveAllConfigs, shortestPathDevices } from "./netutils";
import { connectionsOf } from "./state";
import type { ClientConfig, GameState, Mission } from "./types";

function onlinePcCount(state: GameState): number {
  return state.devices.filter(
    (d) => d.type === "pc" && d.x !== null && diagnoseDevice(state, d.id).success
  ).length;
}

export function currentMission(state: GameState): Mission {
  return MISSIONS[Math.min(state.missionIndex, MISSIONS.length - 1)];
}

export function isCurrentMissionClear(state: GameState): boolean {
  const mission = currentMission(state);
  return mission.check(state).ok;
}

export const MISSIONS: Mission[] = [
  {
    id: "m1",
    title: "ミッション01",
    description: "1台のPCをインターネットに接続せよ（ONU・ルーターが必要）",
    reward: 100_000,
    check: (state) => {
      const online = onlinePcCount(state);
      return online >= 1
        ? { ok: true }
        : { ok: false, detail: "PCがまだインターネットに接続できていません。" };
    },
  },
  {
    id: "m2",
    title: "ミッション02",
    description: "5台のPCを接続せよ（ルーターのLANポートだけでは足りません）",
    reward: 150_000,
    check: (state) => {
      const online = onlinePcCount(state);
      return online >= 5
        ? { ok: true }
        : { ok: false, detail: `インターネットに接続できているPC：${online} / 5` };
    },
  },
  {
    id: "m3",
    title: "ミッション03",
    description: "PCのIPアドレスを手動設定し、正しく通信できるようにせよ",
    reward: 100_000,
    check: (state) => {
      const manualOnline = state.devices.some((d) => {
        if (d.type !== "pc" || d.x === null) return false;
        const cfg = d.networkConfig as ClientConfig | undefined;
        if (!cfg || cfg.dhcpEnabled) return false;
        return diagnoseDevice(state, d.id).success;
      });
      return manualOnline
        ? { ok: true }
        : { ok: false, detail: "手動でIPを設定したPCが、まだ正常に通信できていません。" };
    },
  },
  {
    id: "m4",
    title: "ミッション04",
    description: "故障したPCを復旧せよ",
    reward: 150_000,
    onActivate: (state) => {
      const pcs = state.devices.filter((d) => d.type === "pc" && d.x !== null);
      if (pcs.length === 0) return;
      const resolved = resolveAllConfigs(state);
      const target =
        pcs.find((pc) => diagnoseDevice(state, pc.id).success) ?? pcs[0];
      const r = resolved.get(target.id);
      target.networkConfig = {
        dhcpEnabled: false,
        ip: r?.ip ?? "192.168.1.50",
        subnetMask: r?.subnetMask ?? "255.255.255.0",
        gateway: "",
        dns: r?.dns ?? "192.168.1.1",
      };
    },
    check: (state) => {
      const touched = state.devices.filter(
        (d) => (d.type === "pc" || d.type === "server") && d.x !== null && connectionsOf(state, d.id).length > 0
      );
      const allOnline = touched.length > 0 && touched.every((d) => diagnoseDevice(state, d.id).success);
      return allOnline
        ? { ok: true }
        : { ok: false, detail: "通信できていない機器が残っています。診断で原因を確認しましょう。" };
    },
  },
  {
    id: "m5",
    title: "ミッション05",
    description: "社内サーバーを設置し、固定IPで正しく接続せよ",
    reward: 200_000,
    check: (state) => {
      const serverOnline = state.devices.some((d) => {
        if (d.type !== "server" || d.x === null) return false;
        const cfg = d.networkConfig as ClientConfig | undefined;
        if (!cfg || cfg.dhcpEnabled) return false;
        return diagnoseDevice(state, d.id).success;
      });
      return serverOnline
        ? { ok: true }
        : { ok: false, detail: "固定IPで正常に通信できるサーバーがまだありません。" };
    },
  },
  {
    id: "m6",
    title: "ミッション06",
    description: "部屋のLANコンセントにPCをつなぎ、パッチパネル経由でスイッチへ配線せよ",
    reward: 150_000,
    check: (state) => {
      const wired = state.devices.some((d) => {
        if ((d.type !== "pc" && d.type !== "server") || d.x === null) return false;
        if (!diagnoseDevice(state, d.id).success) return false;
        const domain = findL2Domain(state, d.id);
        if (!domain.router) return false;
        const path = shortestPathDevices(state, d.id, domain.router.id);
        if (!path) return false;
        return path.some((p) => p.type === "lan_jack") && path.some((p) => p.type === "patch_panel");
      });
      return wired
        ? { ok: true }
        : {
            ok: false,
            detail: "LANコンセント→パッチパネル→スイッチの経路でインターネットに到達している機器がまだありません。",
          };
    },
  },
  {
    id: "m7",
    title: "ミッション07",
    description: "倉庫にPCを設置し、通信室まで正しく配線せよ（直線では100mを超えるため中継が必要）",
    reward: 200_000,
    check: (state) => {
      const warehouse = state.rooms.find((r) => r.id === "warehouse");
      if (!warehouse) return { ok: false, detail: "倉庫が見つかりません。" };
      const online = state.devices.some((d) => {
        if ((d.type !== "pc" && d.type !== "server") || d.x === null || d.y === null) return false;
        const inWarehouse =
          d.x >= warehouse.x &&
          d.x <= warehouse.x + warehouse.width &&
          d.y >= warehouse.y &&
          d.y <= warehouse.y + warehouse.height;
        if (!inWarehouse) return false;
        return diagnoseDevice(state, d.id).success;
      });
      return online
        ? { ok: true }
        : { ok: false, detail: "倉庫内のPC・サーバーがまだインターネットに接続できていません。" };
    },
  },
];
