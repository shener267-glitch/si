import type { Room } from "./types";

// The office building (design doc v7 §24: "1フロア・約50人" - start with one floor, not
// a whole building). `sales`/`admin`/`comms`/`warehouse` keep their original ids and
// rectangles from v3 so existing missions (m7 checks devices against the "warehouse"
// room bounds) and every previously-placed device's map position keep working.
export const DEFAULT_ROOMS: Room[] = [
  { id: "entrance", name: "エントランス", x: 20, y: 10, width: 600, height: 65, wallMaterial: "glass" },
  { id: "sales", name: "営業部", x: 20, y: 90, width: 280, height: 200, wallMaterial: "gypsum" },
  { id: "admin", name: "総務部", x: 340, y: 90, width: 280, height: 200, wallMaterial: "gypsum" },
  { id: "comms", name: "通信室", x: 20, y: 320, width: 280, height: 160, wallMaterial: "concrete" },
  { id: "dev", name: "開発部", x: 340, y: 320, width: 280, height: 160, wallMaterial: "gypsum" },
  { id: "meeting1", name: "会議室1", x: 20, y: 500, width: 280, height: 180, wallMaterial: "glass" },
  // The design doc's own example scenario (§4/§14): this room's thick walls are what
  // makes Wi-Fi weak inside it, independent of anything the player does wrong.
  { id: "meeting2", name: "会議室2", x: 340, y: 500, width: 280, height: 180, wallMaterial: "concrete" },
  { id: "warehouse", name: "倉庫", x: 340, y: 860, width: 280, height: 200, wallMaterial: "thick_concrete" },
];
