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

/** A logical broadcast domain (design doc v6 §3/§4). VLAN 1 "default" always exists so
 * every device's ports default into it - existing missions keep working unmodified. */
export interface Vlan {
  id: number;
  name: string;
}

export const DEFAULT_VLAN_ID = 1;

export interface Port {
  id: string;
  type: PortType;
  /** Max simultaneous connections. undefined/1 = one cable only. null = unlimited (AP radio). */
  capacity?: number | null;
  status: "up" | "down";
  /** Only meaningful on switch ports (design doc v6 §5/§6). Access ports carry exactly
   * one VLAN; trunk ports carry a set of VLANs tagged across a switch-to-switch link.
   * Every other device type's ports are VLAN-transparent regardless of these fields. */
  vlanMode?: "access" | "trunk";
  accessVlan?: number;
  trunkVlans?: number[];
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

/** The room's enclosing wall (design doc v7 §3/§5) - one material per room rather than
 * per individual wall segment, a deliberate simplification: it still makes the building
 * genuinely affect Wi-Fi (design doc v7 §4), just without full wall-segment geometry. */
export type WallMaterial = "gypsum" | "wood" | "glass" | "concrete" | "thick_concrete";

/** The room's floor covering (design doc v7.1 §7) - a CSS-level texture/tone
 * distinction, not simulated underfloor cabling (OA floor raised-cabling is deferred). */
export type FloorFinish = "carpet" | "tile" | "oa_floor" | "waterproof" | "plain";

export interface Room {
  id: string;
  name: string;
  /** Which building/floor this room belongs to, for display only in this pass (design
   * doc v7.1 §3/§17) - e.g. "本庁舎 1F", "別館". Rooms still share one flat map canvas;
   * a genuinely separate second building layout is deferred (see README). */
  building: string;
  x: number;
  y: number;
  width: number;
  height: number;
  wallMaterial: WallMaterial;
  floorFinish: FloorFinish;
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

/** A member of the company roster (design doc v6.1 §3/§4) - flavors tickets with a
 * real requester. Not tied to accounts/email/permissions, which are deferred. */
export interface Employee {
  id: string;
  name: string;
  department: string;
  position: string;
}

export type TicketPriority = "緊急" | "高" | "中" | "低";

/** Simplified from the design doc's 6-state lifecycle (§18) to 3 states for this first
 * pass: 未対応 (new) → 調査中 (opened at least once) → 解決 (fixed and closed together). */
export type TicketStatus = "未対応" | "調査中" | "解決";

/** A helpdesk ticket (design doc v6.1 §17/§18) - names a real employee and, when the
 * problem is a network fault, a real device the player can go diagnose and fix using
 * the existing diagnostics/settings systems (design doc v6.1 principle 7: reuse rather
 * than build new). */
export interface Ticket {
  id: string;
  employeeId: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  relatedDeviceId: string | null;
  reward: number;
}

export interface GameState {
  money: number;
  devices: Device[];
  connections: Connection[];
  rooms: Room[];
  vlans: Vlan[];
  tickets: Ticket[];
  nextTicketSeq: number;
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
  | "vlan"
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
