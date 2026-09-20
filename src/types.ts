export type DeviceType =
  | "desktop_pc"
  | "notebook_pc"
  | "workstation"
  | "server"
  | "router"
  | "switch4"
  | "switch8"
  | "onu"
  | "wifi"
  | "lan_jack"
  | "patch_panel"
  | "rack"
  | "internet";

/** The 3 computer types introduced in v5 (design doc §3/§17) - client devices a user sits at. */
export const COMPUTER_TYPES: DeviceType[] = ["desktop_pc", "notebook_pc", "workstation"];

export function isComputerType(type: DeviceType): boolean {
  return COMPUTER_TYPES.includes(type);
}

/** Shop grouping (design doc §25). */
export type DeviceCategory = "computer" | "server" | "network" | "wiring";

export type PortType = "WAN" | "LAN" | "ETHERNET" | "WIFI";

export interface Port {
  id: string;
  type: PortType;
  /** Max simultaneous connections. undefined/1 = one cable only. null = unlimited (AP radio). */
  capacity?: number | null;
  status: "up" | "down";
}

export interface DeviceCatalogItem {
  type: DeviceType;
  category: DeviceCategory;
  label: string;
  price: number;
  description: string;
  ports: Array<Pick<Port, "type" | "capacity">>;
  /** The device model's own fixed specs, shown identically in the shop's and a placed
   * device's info panel (design doc v5-fix §12/§13) - never changes after purchase. */
  specifications: Record<string, string>;
}

/** One row of a device's "現在の状態" section - computed from live game state, as
 * opposed to `specifications` which describes the model itself (design doc v5-fix §11). */
export interface CurrentStateRow {
  label: string;
  value: string;
  ok?: boolean;
}

/** Router-side LAN configuration (also carries WAN uplink / NAT toggle). */
export interface RouterConfig {
  lanIp: string;
  subnetMask: string;
  dhcpEnabled: boolean;
  dhcpStart: string;
  dhcpEnd: string;
  natEnabled: boolean;
}

/** Client-side (PC/Server) network configuration. */
export interface ClientConfig {
  dhcpEnabled: boolean;
  ip?: string;
  subnetMask?: string;
  gateway?: string;
  dns?: string;
}

export type NetworkConfig = RouterConfig | ClientConfig;

export interface Device {
  id: string;
  type: DeviceType;
  name: string;
  x: number | null;
  y: number | null;
  price: number;
  ports: Port[];
  networkConfig?: NetworkConfig;
  /** Only meaningful for powered infra (router/switch/onu/wifi). */
  power?: "on" | "off";
}

export interface Connection {
  id: string;
  fromDevice: string;
  fromPort: string;
  toDevice: string;
  toPort: string;
  kind: "ethernet" | "wifi";
}

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type GameMode = "idle" | "placing" | "moving" | "connecting" | "settings" | "diagnosing";

export interface Mission {
  id: string;
  title: string;
  description: string;
  reward: number;
  /** Client-facing framing (design doc v4 §19) shown in the job-request letter. */
  client: string;
  deadline: string;
  budgetHint: string;
  requirements: string[];
  /** Returns null when the mission's requirement is met, otherwise a short reason it's not. */
  check: (state: GameState) => { ok: boolean; detail?: string };
  /** Called once when this mission becomes the active mission (e.g. to inject a fault). */
  onActivate?: (state: GameState) => void;
}

export interface GameState {
  money: number;
  devices: Device[];
  connections: Connection[];
  rooms: Room[];
  missionIndex: number;
  missionCleared: Record<string, boolean>;
  mode: GameMode;
  selectedDeviceId: string | null;
  connectFromId: string | null;
  nextDeviceSeq: Record<string, number>;
  nextConnSeq: number;
  /** Failed wiring attempts (port full, incompatible ports, etc.) - shown in the evaluation screen. */
  wiringMistakes: number;
}

export type DiagStepKey =
  | "physical"
  | "power"
  | "cable"
  | "port"
  | "ip"
  | "subnet"
  | "gateway"
  | "route"
  | "nat"
  | "dns"
  | "internet";

export interface DiagStep {
  key: DiagStepKey;
  label: string;
  status: "ok" | "fail" | "skipped";
  detail?: string;
}

export interface DeviceDiagnosis {
  deviceId: string;
  name: string;
  steps: DiagStep[];
  success: boolean;
}

export interface PingResult {
  target: string;
  success: boolean;
  message: string;
}
