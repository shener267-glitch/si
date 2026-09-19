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
    title: "案件01",
    description: "1台のPCをインターネットに接続せよ（ONU・ルーターが必要）",
    reward: 100_000,
    client: "あおぞら商事株式会社",
    deadline: "納期：3日後",
    budgetHint: "予算目安：¥300,000",
    requirements: ["PCを1台、インターネットに接続できるようにしてください。"],
    check: (state) => {
      const online = onlinePcCount(state);
      return online >= 1
        ? { ok: true }
        : { ok: false, detail: "PCがまだインターネットに接続できていません。" };
    },
  },
  {
    id: "m2",
    title: "案件02",
    description: "5台のPCを接続せよ（ルーターのLANポートだけでは足りません）",
    reward: 150_000,
    client: "あおぞら商事株式会社",
    deadline: "納期：5日後",
    budgetHint: "予算目安：¥800,000",
    requirements: [
      "新入社員5名分のPCをネットワークに接続してください。",
      "全員が同時にインターネットへ接続できる必要があります。",
    ],
    check: (state) => {
      const online = onlinePcCount(state);
      return online >= 5
        ? { ok: true }
        : { ok: false, detail: `インターネットに接続できているPC：${online} / 5` };
    },
  },
  {
    id: "m3",
    title: "案件03",
    description: "PCのIPアドレスを手動設定し、正しく通信できるようにせよ",
    reward: 100_000,
    client: "あおぞら商事株式会社 総務部",
    deadline: "納期：2日後",
    budgetHint: "予算目安：¥150,000",
    requirements: ["特定の1台には固定のIPアドレスを割り当ててください（社内システムの都合です）。"],
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
    title: "案件04",
    description: "故障したPCを復旧せよ",
    reward: 150_000,
    client: "あおぞら商事株式会社",
    deadline: "至急対応",
    budgetHint: "追加予算：¥50,000",
    requirements: [
      "「PCが急にインターネットに繋がらなくなった」と連絡がありました。",
      "原因を調査し、復旧してください。",
    ],
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
    title: "案件05",
    description: "社内サーバーを設置し、固定IPで正しく接続せよ",
    reward: 200_000,
    client: "あおぞら商事株式会社 情報システム部",
    deadline: "納期：4日後",
    budgetHint: "予算目安：¥400,000",
    requirements: ["社内サーバーを設置してください。", "サーバーには固定IPを割り当ててください。"],
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
    title: "案件06",
    description: "部屋のLANコンセントにPCをつなぎ、パッチパネル経由でスイッチへ配線せよ",
    reward: 150_000,
    client: "あおぞら商事株式会社 総務部",
    deadline: "納期：3日後",
    budgetHint: "予算目安：¥100,000",
    requirements: [
      "壁のLANコンセントを使って配線してください。",
      "パッチパネルで集約してからスイッチへ接続してください。",
    ],
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
    title: "案件07",
    description: "倉庫にPCを設置し、通信室まで正しく配線せよ（直線では100mを超えるため中継が必要）",
    reward: 200_000,
    client: "あおぞら商事株式会社 物流部",
    deadline: "納期：5日後",
    budgetHint: "予算目安：¥250,000",
    requirements: ["倉庫にもネットワークを届けてください。", "配線1本の長さは上限（100m）を超えないようにしてください。"],
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
