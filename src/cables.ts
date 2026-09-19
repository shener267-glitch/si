// Cables are modeled as straight-line runs for v3's first pass (design doc §12
// explicitly allows this, with wall-aware routing as a later refinement).
export const MAP_SCALE_METERS_PER_PX = 0.2;
export const CABLE_MAX_METERS = 100;

export function cableLengthMeters(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy) * MAP_SCALE_METERS_PER_PX;
}

export function isCableTooLong(lengthMeters: number): boolean {
  return lengthMeters > CABLE_MAX_METERS;
}
