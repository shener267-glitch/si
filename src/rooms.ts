import type { Room } from "./types";

// A small starter office (design doc v3 §22 "初級": rooms x2 + a comms room),
// plus a distant warehouse room used to teach the cable-length limit (too far
// to wire directly; needs an intermediate patch panel/switch hop).
export const DEFAULT_ROOMS: Room[] = [
  { id: "sales", name: "営業部", x: 20, y: 90, width: 280, height: 200 },
  { id: "admin", name: "総務部", x: 340, y: 90, width: 280, height: 200 },
  { id: "comms", name: "通信室", x: 20, y: 320, width: 280, height: 160 },
  { id: "warehouse", name: "倉庫", x: 340, y: 860, width: 280, height: 200 },
];
