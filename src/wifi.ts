import { MAP_SCALE_METERS_PER_PX } from "./cables";
import type { GameState, Room, WallMaterial } from "./types";

// Signal points lost per wall crossed, roughly following the design doc's table (v7
// §5): gypsum board barely matters, concrete matters a lot.
const WALL_ATTENUATION: Record<WallMaterial, number> = {
  gypsum: 8,
  wood: 12,
  glass: 10,
  concrete: 30,
  thick_concrete: 50,
};

export const WALL_MATERIAL_LABELS: Record<WallMaterial, string> = {
  gypsum: "石膏ボード",
  wood: "木製壁",
  glass: "ガラス",
  concrete: "コンクリート",
  thick_concrete: "厚いコンクリート",
};

const DISTANCE_ATTENUATION_PER_METER = 2;

function pointInRoom(x: number, y: number, room: Room): boolean {
  return x >= room.x && x <= room.x + room.width && y >= room.y && y <= room.y + room.height;
}

function segmentsIntersect(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number
): boolean {
  const d = (ax2 - ax1) * (by2 - by1) - (ay2 - ay1) * (bx2 - bx1);
  if (d === 0) return false;
  const t = ((bx1 - ax1) * (by2 - by1) - (by1 - ay1) * (bx2 - bx1)) / d;
  const u = ((bx1 - ax1) * (ay2 - ay1) - (by1 - ay1) * (ax2 - ax1)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

/** Does the AP-to-client signal actually cross this room's wall? Both ends sharing the
 * room (e.g. an AP placed inside the room it's serving) crosses nothing; one end inside
 * and one outside crosses it once; both outside but the straight line clipping through
 * the rectangle still crosses it once (design doc v7 §4). */
function crossesRoomWall(x1: number, y1: number, x2: number, y2: number, room: Room): boolean {
  const insideA = pointInRoom(x1, y1, room);
  const insideB = pointInRoom(x2, y2, room);
  if (insideA && insideB) return false;
  if (insideA || insideB) return true;
  const { x: left, y: top, width: w, height: h } = room;
  const right = left + w;
  const bottom = top + h;
  return (
    segmentsIntersect(x1, y1, x2, y2, left, top, right, top) ||
    segmentsIntersect(x1, y1, x2, y2, right, top, right, bottom) ||
    segmentsIntersect(x1, y1, x2, y2, right, bottom, left, bottom) ||
    segmentsIntersect(x1, y1, x2, y2, left, bottom, left, top)
  );
}

export type WifiSignalCategory = "圏外" | "弱" | "中" | "強";

export interface WifiSignal {
  strength: number;
  category: WifiSignalCategory;
  distanceMeters: number;
  crossedRoomNames: string[];
}

function categoryFor(strength: number): WifiSignalCategory {
  if (strength < 20) return "圏外";
  if (strength < 50) return "弱";
  if (strength < 80) return "中";
  return "強";
}

/** Signal strength between two map points, combining distance falloff with the
 * material of every room wall the straight-line path crosses (design doc v7 §4-§7). */
export function wifiSignalBetween(
  state: GameState,
  apX: number,
  apY: number,
  clientX: number,
  clientY: number
): WifiSignal {
  const dx = clientX - apX;
  const dy = clientY - apY;
  const distanceMeters = Math.sqrt(dx * dx + dy * dy) * MAP_SCALE_METERS_PER_PX;
  let strength = 100 - distanceMeters * DISTANCE_ATTENUATION_PER_METER;
  const crossedRoomNames: string[] = [];
  for (const room of state.rooms) {
    if (crossesRoomWall(apX, apY, clientX, clientY, room)) {
      strength -= WALL_ATTENUATION[room.wallMaterial];
      crossedRoomNames.push(room.name);
    }
  }
  strength = Math.max(0, Math.min(100, Math.round(strength)));
  return { strength, category: categoryFor(strength), distanceMeters, crossedRoomNames };
}

export function wifiSignalLabel(signal: WifiSignal): string {
  return `${signal.category}（${signal.strength}）`;
}
