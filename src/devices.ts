import type { DeviceCatalogItem, DeviceType } from "./types";

// Shop catalog. Data-driven so new device types can be added later
// without touching game logic elsewhere.
export const DEVICE_CATALOG: DeviceCatalogItem[] = [
  {
    type: "pc",
    label: "PC",
    price: 100_000,
    ports: 1,
    icon: "💻",
    description: "社員が使う端末。スイッチかWi-Fiにつなごう。",
  },
  {
    type: "router",
    label: "ルーター",
    price: 80_000,
    ports: 4,
    icon: "🌐",
    description: "社内ネットワークとインターネットをつなぐ。",
  },
  {
    type: "switch4",
    label: "スイッチ（4ポート）",
    price: 50_000,
    ports: 4,
    icon: "🔀",
    description: "4台までの機器をまとめて接続できる。",
  },
  {
    type: "switch8",
    label: "スイッチ（8ポート）",
    price: 80_000,
    ports: 8,
    icon: "🔀",
    description: "8台までの機器をまとめて接続できる。",
  },
  {
    type: "wifi",
    label: "Wi-Fiアクセスポイント",
    price: 30_000,
    ports: null,
    icon: "📡",
    description: "PCなどを無線で接続する。",
  },
  {
    type: "server",
    label: "サーバー",
    price: 200_000,
    ports: 1,
    icon: "🖥️",
    description: "社内サービスを提供する（v0.1では配置・接続のみ）。",
  },
];

export const INTERNET_ICON = "☁️";

export function catalogItem(type: DeviceType): DeviceCatalogItem {
  const item = DEVICE_CATALOG.find((d) => d.type === type);
  if (!item) throw new Error(`unknown device type: ${type}`);
  return item;
}

export function shortLabel(type: DeviceType): string {
  switch (type) {
    case "pc":
      return "PC";
    case "router":
      return "Router";
    case "switch4":
    case "switch8":
      return "Switch";
    case "wifi":
      return "WiFi";
    case "server":
      return "Server";
    case "internet":
      return "Internet";
  }
}

export function iconFor(type: DeviceType): string {
  if (type === "internet") return INTERNET_ICON;
  return catalogItem(type).icon;
}
