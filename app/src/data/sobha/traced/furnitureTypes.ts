import type { Mm2 } from './types';

/**
 * Model-flat furniture layout for a traced unit.
 *
 * Positions come from the furniture the vendor DREW on the floor-plan page (beds, sofas, dining
 * set, WC, basin, hob …, see tools/trace/furniture.py) where present — so the dressing follows
 * the developer's own layout — plus rule-based dressing (rugs, lamps, plants, art, cushions …)
 * the plan doesn't show. The whole layer is ILLUSTRATIVE: furniture is not part of the sale.
 *
 * Frame: unit mm (x → right, y → down, same as TracedUnit). `pos` = footprint centre;
 * `rotDeg` = rotation of the item's local "front" (local −y, i.e. page-up when rotDeg = 0)
 * clockwise on the page; `size` = [width along local x, depth along local y] in mm.
 * Item's front = the side a person uses (sofa seat, bed foot, wardrobe doors, WC bowl, hob front).
 */
export type FurnitureType =
  // living / dining
  | 'sofa3'
  | 'sofa2'
  | 'sofaL'
  | 'armchair'
  | 'coffeeTable'
  | 'sideTable'
  | 'tvUnit'
  | 'diningTable'
  | 'diningChair'
  | 'consoleTable'
  | 'bookshelf'
  | 'rug'
  // bedroom
  | 'bedKing'
  | 'bedQueen'
  | 'bedSingle'
  | 'nightstand'
  | 'wardrobe'
  | 'dresser'
  | 'desk'
  | 'deskChair'
  // kitchen / utility
  | 'kitchenCounter' // base cabinets + worktop (+ wall cabinets above); size = run
  | 'hob'
  | 'sink'
  | 'fridge'
  | 'washingMachine'
  | 'dishwasher'
  // bath
  | 'wc'
  | 'basinVanity'
  | 'shower' // shower enclosure / tray
  | 'bathtub'
  | 'mirror'
  // balcony / outdoor
  | 'outdoorChair'
  | 'outdoorTable'
  | 'planter'
  // decor (rule-based)
  | 'floorLamp'
  | 'tableLamp'
  | 'pendantLight'
  | 'plant'
  | 'wallArt'
  | 'curtain' // along a window/sliding opening; size = [width, 0]
  | 'shoeRack'
  | 'vase'
  | 'books'
  | 'cushions'
  | 'throwBlanket';

export interface FurnitureItem {
  type: FurnitureType;
  /** TracedRoom.name the item belongs to. */
  room: string;
  pos: Mm2;
  rotDeg: number;
  size: Mm2;
  /** Height above floor of the item's base (mm), e.g. wall art / mirrors / wall cabinets. Default 0. */
  elevMm?: number;
  /** Overall height (mm) if the renderer should not use its default. */
  heightMm?: number;
  /** Style variant hint, renderer-defined (e.g. 'oak', 'walnut', 'linen', 'velvet'). */
  variant?: string;
  /** 'plan' = drawn by the vendor on the plan page (traced); 'dressing' = added by rules. */
  from: 'plan' | 'dressing';
  /**
   * Renderer hint: build the item's geometry as its MIRROR IMAGE about local x (handed pieces —
   * L-sofa chaise, sink bowl vs drainer, towel ring … — swap sides). Set by mirrorFurniture().
   */
  mirrored?: boolean;
}

export interface FurnitureLayout {
  code: string;
  /** True for mirrorFurniture() output (layout of a mirrored flat). */
  mirrored?: boolean;
  items: FurnitureItem[];
  notes: string[];
}
