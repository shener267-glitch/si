export type DeviceType =
  | "pc"
  | "router"
  | "switch4"
  | "switch8"
  | "wifi"
  | "server"
  | "internet";

export interface DeviceCatalogItem {
  type: DeviceType;
  label: string;
  price: number;
  ports: number | null; // null = unlimited
  icon: string;
  description: string;
}

export interface Device {
  id: string;
  type: DeviceType;
  name: string;
  x: number | null; // null = not yet placed (in inventory)
  y: number | null;
  price: number;
  ports: number | null; // null = unlimited
  connections: string[]; // connection ids touching this device
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
}

export type GameMode = "idle" | "placing" | "moving" | "connecting";

export interface Mission {
  id: string;
  title: string;
  description: string;
  budget: number;
  requiredPcCount: number;
  reward: number;
}

export interface GameState {
  money: number;
  devices: Device[];
  connections: Connection[];
  mission: Mission;
  missionCleared: boolean;
  mode: GameMode;
  selectedDeviceId: string | null; // for placing/moving
  connectFromId: string | null; // for connecting, first tap
  nextDeviceSeq: Record<string, number>;
  nextConnSeq: number;
}

export interface PcDiagnosis {
  deviceId: string;
  name: string;
  success: boolean;
  path: string[]; // device names in the reached chain
  reason?: string;
}
