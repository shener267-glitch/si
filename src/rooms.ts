import type { Room } from "./types";

// A small village hall (design doc v7.1 §1/§2/§11/§14/§17): 本庁舎 (main hall, 1F/2F)
// and 別館 (a smaller annex next door housing the comms room). `sales`/`admin`/`comms`/
// `dev`/`meeting1`/`meeting2`/`entrance`/`warehouse` keep their v3-era ids and
// rectangles so every existing mission (m7 checks the "warehouse" room bounds) and every
// previously-placed device's map position keep working - only names/theming changed.
//
// The doc's own two-building floor plan (§3, connected by a 渡り廊下) isn't laid out as
// physically separate structures yet - `building` is a display-only label for now. See
// the README for what's deferred (real building separation, doors/windows, furniture).
export const DEFAULT_ROOMS: Room[] = [
  { id: "entrance", name: "ロビー", building: "本庁舎 1F", x: 20, y: 10, width: 600, height: 65, wallMaterial: "glass", floorFinish: "tile" },
  { id: "sales", name: "住民課", building: "本庁舎 1F", x: 20, y: 90, width: 280, height: 200, wallMaterial: "gypsum", floorFinish: "carpet" },
  { id: "admin", name: "財政課", building: "本庁舎 1F", x: 340, y: 90, width: 280, height: 200, wallMaterial: "gypsum", floorFinish: "carpet" },
  { id: "comms", name: "通信室", building: "別館", x: 20, y: 320, width: 280, height: 160, wallMaterial: "concrete", floorFinish: "oa_floor" },
  { id: "dev", name: "健康福祉課", building: "本庁舎 1F", x: 340, y: 320, width: 280, height: 160, wallMaterial: "gypsum", floorFinish: "carpet" },
  { id: "meeting1", name: "会議室1", building: "本庁舎 2F", x: 20, y: 500, width: 280, height: 180, wallMaterial: "glass", floorFinish: "carpet" },
  // The design doc's own example scenario (§4/§26): this room's thick walls are what
  // makes Wi-Fi weak inside it, independent of anything the player does wrong.
  { id: "meeting2", name: "会議室2", building: "本庁舎 2F", x: 340, y: 500, width: 280, height: 180, wallMaterial: "concrete", floorFinish: "carpet" },
  { id: "corridor", name: "廊下", building: "本庁舎", x: 20, y: 682, width: 600, height: 36, wallMaterial: "gypsum", floorFinish: "tile" },
  { id: "crisis", name: "防災無線室", building: "別館", x: 20, y: 722, width: 280, height: 128, wallMaterial: "gypsum", floorFinish: "plain" },
  { id: "chamber", name: "商工会", building: "別館", x: 340, y: 722, width: 280, height: 128, wallMaterial: "gypsum", floorFinish: "carpet" },
  { id: "warehouse", name: "倉庫", building: "本庁舎 1F", x: 340, y: 860, width: 280, height: 200, wallMaterial: "thick_concrete", floorFinish: "plain" },
];
