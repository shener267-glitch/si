import type { ClientConfig, Device, DeviceCatalogItem, DeviceType, RouterConfig } from "./types";

// Shop catalog. Ports are templates (capacity/type only); real Port objects
// with unique ids get stamped out per-device in createDevice().
export const DEVICE_CATALOG: DeviceCatalogItem[] = [
  {
    type: "pc",
    label: "PC",
    price: 100_000,
    icon: "💻",
    description: "社員が使う端末。有線でもWi-Fiでも接続できる。",
    ports: [{ type: "ETHERNET" }, { type: "WIFI" }],
  },
  {
    type: "server",
    label: "サーバー",
    price: 200_000,
    icon: "🖥️",
    description: "社内サービスを提供する。固定IPを設定することが多い。",
    ports: [{ type: "ETHERNET" }],
  },
  {
    type: "router",
    label: "ルーター",
    price: 80_000,
    icon: "🌐",
    description: "WANとLANをつなぎ、DHCP・NATを行う。",
    ports: [
      { type: "WAN" },
      { type: "LAN" },
      { type: "LAN" },
      { type: "LAN" },
      { type: "LAN" },
    ],
  },
  {
    type: "switch4",
    label: "スイッチ（4ポート）",
    price: 50_000,
    icon: "🔀",
    description: "4台までの機器をまとめて接続できる。",
    ports: [{ type: "ETHERNET" }, { type: "ETHERNET" }, { type: "ETHERNET" }, { type: "ETHERNET" }],
  },
  {
    type: "switch8",
    label: "スイッチ（8ポート）",
    price: 80_000,
    icon: "🔀",
    description: "8台までの機器をまとめて接続できる。",
    ports: Array.from({ length: 8 }, () => ({ type: "ETHERNET" as const })),
  },
  {
    type: "onu",
    label: "ONU（回線終端装置）",
    price: 40_000,
    icon: "📶",
    description: "ISPの回線を終端し、ルーターのWANへつなぐ。",
    ports: [{ type: "ETHERNET" }, { type: "ETHERNET" }],
  },
  {
    type: "wifi",
    label: "Wi-Fiアクセスポイント",
    price: 30_000,
    icon: "📡",
    description: "有線LANを無線化する。複数台が同時接続できる。",
    ports: [{ type: "ETHERNET" }, { type: "WIFI", capacity: null }],
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
    case "server":
      return "Server";
    case "router":
      return "Router";
    case "switch4":
    case "switch8":
      return "Switch";
    case "onu":
      return "ONU";
    case "wifi":
      return "AP";
    case "internet":
      return "Internet";
  }
}

export function iconFor(type: DeviceType): string {
  if (type === "internet") return INTERNET_ICON;
  return catalogItem(type).icon;
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
  // Servers conventionally get a static IP; PCs default to DHCP.
  return { dhcpEnabled: type !== "server" };
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
    })),
  };
  if (type === "router") {
    device.networkConfig = defaultRouterConfig();
  } else if (type === "pc" || type === "server") {
    device.networkConfig = defaultClientConfig(type);
  }
  return device;
}

export function isRouterConfig(config: unknown): config is RouterConfig {
  return !!config && typeof config === "object" && "lanIp" in config;
}

export function isClientConfig(config: unknown): config is ClientConfig {
  return !!config && typeof config === "object" && "dhcpEnabled" in config && !("lanIp" in config);
}
