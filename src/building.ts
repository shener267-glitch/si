/** V7.1 building-outline redesign, Phase 1 ("建物外形") only (design doc §22): the
 * real exterior shape of 本庁舎 (1F/2F) and 別館, traced by eye from the user's own
 * floor-plan photo - nothing here is invented; every vertex is read off that image.
 * This is a first-pass trace, not pixel-perfect (see README for the known
 * lower-confidence spots) - later phases refine it once confirmed. It is a purely
 * visual preview: it does not replace or drive the existing room/device/mission
 * systems (design doc §24 - don't break what already works). */

export interface BuildingOutline {
  id: string;
  label: string;
  /** Closed polygon, clockwise, in this outline's own local coordinate space
   * (traced from the source image at roughly 1/4 scale). */
  points: Array<[number, number]>;
}

export const HONCHO_2F: BuildingOutline = {
  id: "honcho-2f",
  label: "本庁舎 2階",
  points: [
    [390, 895], [520, 905], [730, 810], [1785, 800], [1780, 130],
    [1250, 130], [960, 225], [700, 395], [350, 575],
  ].map(([x, y]) => [(x - 0) / 4, (y - 0) / 4] as [number, number]),
};

/** 本庁舎1F and 別館 are kept in one shared coordinate space (both traced from the
 * same source image) so their relative position - 別館 to the east, linked by 渡り廊下
 * - comes out right without being re-specified by hand. */
const HONKAN_ORIGIN: [number, number] = [185, 155];

export const HONCHO_1F: BuildingOutline = {
  id: "honcho-1f",
  label: "本庁舎 1階",
  points: [
    [400, 1005], [185, 850], [185, 650], [300, 555], [630, 405],
    [775, 380], [975, 175], [1290, 155], [1700, 155], [1700, 800],
    [1450, 800], [1350, 800], [1350, 760], [700, 750], [630, 650],
  ].map(([x, y]) => [(x - HONKAN_ORIGIN[0]) / 4, (y - HONKAN_ORIGIN[1]) / 4] as [number, number]),
};

export const BEKKAN: BuildingOutline = {
  id: "bekkan",
  label: "別館",
  points: [
    [1900, 390], [1900, 300], [2000, 155], [2340, 155], [2420, 300],
    [2420, 650], [1975, 650], [1975, 500],
  ].map(([x, y]) => [(x - HONKAN_ORIGIN[0]) / 4, (y - HONKAN_ORIGIN[1]) / 4] as [number, number]),
};

export const BUILDING_OUTLINES: BuildingOutline[] = [HONCHO_2F, HONCHO_1F, BEKKAN];
