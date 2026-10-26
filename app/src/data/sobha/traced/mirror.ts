import type { FurnitureItem, FurnitureLayout } from './furnitureTypes';
import type { Mm2, TracedUnit } from './types';

/**
 * MIRRORED flats: many flats on a floor are built as the mirror image of the printed type plan
 * (FlatPlacement.mirrored). We mirror the DATA (across the plan's vertical axis, x_mm → −x_mm)
 * before any geometry is built, so walls, collisions, floors, labels, furniture, XR teleport
 * and the in-VR minimap all follow without special cases.
 *
 * Invariants: lengths, areas, printed / traced room sizes (width × depth stay along the same
 * page axes) and the validation figures do not change. Polygon winding is reversed so each
 * polygon keeps its orientation sign (a reflection alone would flip it).
 *
 * Frames: the output is still "unit mm, x → right, y → down", but of the MIRRORED drawing. A
 * mirrored UnitPlacement / FlatPlacement maps PRINTED coordinates (unitMmToSite flips x itself);
 * data that already went through mirrorTraced() must use yawRad + offset directly.
 */

const mx = ([x, y]: Mm2): Mm2 => [x === 0 ? 0 : -x, y];

/** North-arrow angle (deg clockwise from page-up) of the mirrored drawing. */
const flipDeg = (d: number) => Math.round(((360 - d) % 360) * 1e6) / 1e6;

export function mirrorTraced(t: TracedUnit): TracedUnit {
  return {
    ...t,
    mirrored: !t.mirrored,
    entry: mx(t.entry),
    northDeg: t.northDeg == null ? undefined : flipDeg(t.northDeg),
    rooms: t.rooms.map((r) => ({ ...r, polygon: r.polygon.map(mx).reverse() })),
    walls: t.walls.map((w) => ({ ...w, a: mx(w.a), b: mx(w.b) })),
    openings: t.openings.map((o) => ({ ...o, a: mx(o.a), b: mx(o.b) })),
    provenance: [
      ...t.provenance,
      {
        asset: 'derived (src/data/traced/mirror.ts)',
        note: `Mirrored copy of the printed ${t.code} plan (x → −x): for flats built as its mirror image. Dimensions unchanged; the drawing itself is not printed this way.`,
      },
    ],
  };
}

/**
 * Mirror a model-flat furniture layout the same way: pos.x → −x, rotDeg → −rotDeg (the item's
 * front direction mirrors with it) and `mirrored` toggled so the renderer builds handed pieces
 * as their mirror image (an L-sofa's chaise, a sink's drainer side) instead of just rotating them.
 */
export function mirrorFurnitureItem(it: FurnitureItem): FurnitureItem {
  return { ...it, pos: mx(it.pos), rotDeg: flipDeg(it.rotDeg), mirrored: !it.mirrored };
}

export function mirrorFurniture(l: FurnitureLayout): FurnitureLayout {
  return { ...l, mirrored: !l.mirrored, items: l.items.map(mirrorFurnitureItem) };
}
