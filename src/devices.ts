import { deviceIconMarkup } from "./icons";
import { DEFAULT_VLAN_ID, isComputerType } from "./types";
import type { ClientConfig, Device, DeviceCatalogItem, DeviceType, L3SwitchConfig, RouterConfig } from "./types";

// Shop catalog. Ports are templates (capacity/type only); real Port objects
// with unique ids get stamped out per-device in createDevice(). `specifications` is the
// single source of truth rendered by both the shop's and a placed device's info panel
// (design doc v5-fix §12).
export const DEVICE_CATALOG: DeviceCatalogItem[] = [
  {
    type: "desktop_pc",
    category: "computer",
    label: "デスクトップPC",
    price: 100_000,
    description: "社員が使う据え置き型の端末。有線LANのみで接続する。",
    ports: [{ type: "ETHERNET" }],
    specifications: { CPU: "標準", メモリ: "8GB", ストレージ: "256GB SSD", ネットワーク: "有線LANのみ（Wi-Fiなし）", 消費電力: "約180W", バッテリー: "なし", 用途: "一般事務" },
  },
  {
    type: "notebook_pc",
    category: "computer",
    label: "ノートPC",
    price: 120_000,
    description: "持ち運べる端末。バッテリーを内蔵し、Wi-Fiのみで接続する。",
    ports: [{ type: "WIFI" }],
    specifications: { CPU: "標準", メモリ: "8GB", ストレージ: "256GB SSD", ネットワーク: "Wi-Fiのみ（有線LANなし）", 消費電力: "約65W", バッテリー: "あり", 用途: "外出先・会議室" },
  },
  {
    type: "workstation",
    category: "computer",
    label: "ワークステーション",
    price: 350_000,
    description: "CADや設計など重い処理向けの高性能端末。有線LANのみで接続する。",
    ports: [{ type: "ETHERNET" }],
    specifications: { CPU: "高性能", メモリ: "32GB", ストレージ: "1TB SSD", ネットワーク: "有線LANのみ（Wi-Fiなし）", 消費電力: "約250W", バッテリー: "なし", 用途: "CAD・設計・重い処理" },
  },
  {
    type: "server",
    category: "server",
    label: "サーバー",
    price: 200_000,
    description: "社内サービスを提供する。固定IPを設定することが多い。",
    ports: [{ type: "ETHERNET" }],
    specifications: { CPU: "標準", メモリ: "16GB", ストレージ: "1TB HDD", ネットワーク: "有線LANのみ", 用途: "ファイル共有・社内サービス提供", 稼働: "24時間常時稼働を想定" },
  },
  {
    type: "router",
    category: "network",
    label: "ルーター",
    price: 80_000,
    description: "WANとLANをつなぎ、DHCP・NATを行う。",
    ports: [
      { type: "WAN" },
      { type: "LAN" },
      { type: "LAN" },
      { type: "LAN" },
      { type: "LAN" },
    ],
    specifications: { WANポート: "1", LANポート: "4", DHCP: "対応", NAT: "対応", 推奨接続台数: "〜20台" },
  },
  {
    type: "switch4",
    category: "network",
    label: "スイッチ（4ポート）",
    price: 50_000,
    description: "4台までの機器をまとめて接続できる。",
    ports: [{ type: "ETHERNET" }, { type: "ETHERNET" }, { type: "ETHERNET" }, { type: "ETHERNET" }],
    specifications: { ポート数: "4", 速度: "1000Mbps", PoE給電: "非対応" },
  },
  {
    type: "switch8",
    category: "network",
    label: "スイッチ（8ポート）",
    price: 80_000,
    description: "8台までの機器をまとめて接続できる。",
    ports: Array.from({ length: 8 }, () => ({ type: "ETHERNET" as const })),
    specifications: { ポート数: "8", 速度: "1000Mbps", PoE給電: "非対応" },
  },
  {
    type: "l3_switch",
    category: "network",
    label: "L3スイッチ",
    price: 220_000,
    description:
      "VLANごとにルーティングインターフェース（SVI）を持てるスイッチ。異なるVLAN同士を、ルーターを介さず直接中継できる。",
    ports: Array.from({ length: 8 }, () => ({ type: "ETHERNET" as const })),
    specifications: {
      ポート数: "8",
      速度: "1000Mbps",
      "VLAN間ルーティング": "対応（SVI・VLANごとに1つ）",
      PoE給電: "非対応",
    },
  },
  {
    type: "onu",
    category: "network",
    label: "ONU（回線終端装置）",
    price: 40_000,
    description: "ISPの回線を終端し、ルーターのWANへつなぐ。",
    ports: [{ type: "ETHERNET" }, { type: "ETHERNET" }],
    specifications: { 対応回線: "光回線", ポート数: "2", 用途: "ISP回線の終端" },
  },
  {
    type: "wifi",
    category: "network",
    label: "Wi-Fiアクセスポイント",
    price: 30_000,
    description: "有線LANを無線化する。複数台が同時接続できる。",
    ports: [{ type: "ETHERNET" }, { type: "WIFI", capacity: null }],
    specifications: { 規格: "Wi-Fi 5（11ac）", 同時接続台数: "〜30台", 有線ポート: "1" },
  },
  {
    type: "lan_jack",
    category: "wiring",
    label: "LANコンセント",
    price: 5_000,
    description: "壁に設置する情報コンセント。片側にPCなど、反対側にパッチパネルをつなぐ。",
    ports: [{ type: "ETHERNET" }, { type: "ETHERNET" }],
    specifications: { ポート数: "2", 用途: "壁面の情報コンセント" },
  },
  {
    type: "patch_panel",
    category: "wiring",
    label: "パッチパネル",
    price: 40_000,
    description: "通信室でLANコンセントの配線をまとめ、スイッチへ引き渡す。",
    ports: Array.from({ length: 8 }, () => ({ type: "ETHERNET" as const })),
    specifications: { ポート数: "8", 用途: "配線の集約" },
  },
  {
    type: "rack",
    category: "wiring",
    label: "通信ラック",
    price: 60_000,
    description: "通信室に設置し、ONU・ルーター・スイッチ・パッチパネルをまとめて収める什器。ケーブルはつなげない。",
    ports: [],
    specifications: { 収容ユニット: "12U", 備考: "ケーブル接続不可（装飾什器）" },
  },
];

export const CATEGORY_LABELS: Record<DeviceCatalogItem["category"], string> = {
  computer: "コンピューター",
  server: "サーバー",
  network: "ネットワーク機器",
  wiring: "配線・什器",
};

export const CATEGORY_ORDER: DeviceCatalogItem["category"][] = ["computer", "server", "network", "wiring"];

export function catalogItem(type: DeviceType): DeviceCatalogItem {
  const item = DEVICE_CATALOG.find((d) => d.type === type);
  if (!item) throw new Error(`unknown device type: ${type}`);
  return item;
}

export function shortLabel(type: DeviceType): string {
  switch (type) {
    case "desktop_pc":
      return "PC";
    case "notebook_pc":
      return "Note";
    case "workstation":
      return "WS";
    case "server":
      return "Server";
    case "router":
      return "Router";
    case "switch4":
    case "switch8":
      return "Switch";
    case "l3_switch":
      return "L3SW";
    case "onu":
      return "ONU";
    case "wifi":
      return "AP";
    case "lan_jack":
      return "Jack";
    case "patch_panel":
      return "Patch";
    case "rack":
      return "Rack";
    case "internet":
      return "Internet";
  }
}

const POWERED_TYPES: DeviceType[] = ["router", "switch4", "switch8", "l3_switch", "onu", "wifi"];

const VLAN_CAPABLE_TYPES: DeviceType[] = ["switch4", "switch8", "l3_switch"];

/** Only switches enforce VLAN membership on their ports (design doc v6 §5-§7); every
 * other device type is VLAN-transparent. */
export function isVlanCapable(type: DeviceType): boolean {
  return VLAN_CAPABLE_TYPES.includes(type);
}

export function iconFor(type: DeviceType): string {
  return deviceIconMarkup(type);
}

function defaultRouterConfig(): RouterConfig {
  return {
    lanIp: "192.168.1.1",
    subnetMask: "255.255.255.0",
    dhcpEnabled: true,
    dhcpStart: "192.168.1.100",
    dhcpEnd: "192.168.1.200",
    natEnabled: true,
  };
}

function defaultClientConfig(type: DeviceType): ClientConfig {
  // Servers conventionally get a static IP; computers default to DHCP.
  return { dhcpEnabled: type !== "server" };
}

function defaultL3SwitchConfig(): L3SwitchConfig {
  return { interfaces: [], uplinkGateway: undefined };
}

export function createDevice(
  type: DeviceType,
  id: string,
  name: string,
  price: number
): Device {
  const ports =
    type === "internet"
      ? [{ type: "ETHERNET" as const }]
      : catalogItem(type).ports;
  const device: Device = {
    id,
    type,
    name,
    x: null,
    y: null,
    price,
    ports: ports.map((p, i) => ({
      id: `${id}-p${i}`,
      type: p.type,
      capacity: p.capacity,
      status: "up",
      // Switch ports default to access-mode on the default VLAN, so freshly-bought
      // switches (and every mission written before VLANs existed) behave exactly as
      // before until the player explicitly reconfigures a port.
      ...(isVlanCapable(type) ? { vlanMode: "access" as const, accessVlan: DEFAULT_VLAN_ID } : {}),
    })),
  };
  if (type === "router") {
    device.networkConfig = defaultRouterConfig();
  } else if (type === "l3_switch") {
    device.networkConfig = defaultL3SwitchConfig();
  } else if (isComputerType(type) || type === "server") {
    device.networkConfig = defaultClientConfig(type);
  }
  if (POWERED_TYPES.includes(type)) {
    device.power = "on";
  }
  return device;
}
