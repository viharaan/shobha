import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import type { Shape } from 'three';

export interface WallData {
  shapes: Shape[];
  /** [minX, minY, maxX, maxY] in SVG user units */
  bboxPt: [number, number, number, number];
  subPaths: number;
  points: number;
}

const cache = new Map<string, Promise<WallData>>();

/**
 * The floor-plan PDFs draw walls as ONE white filled compound path (outer outline + holes for rooms).
 * Everything else (furniture, fixtures, dimension text) is white strokes or glyph <use> elements.
 * We take the white filled path with the most curve segments as the wall polygon. The result is
 * source-derived geometry: wall positions and thicknesses come straight from the vector plan.
 */
export function loadWalls(url: string): Promise<WallData> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`Plan SVG ${url}: HTTP ${r.status}`);
        return r.text();
      })
      .then((text) => {
        const data = new SVGLoader().parse(text);
        let best: (typeof data.paths)[number] | null = null;
        let bestScore = 0;
        for (const path of data.paths) {
          const style = (path.userData as { style?: { fill?: string } } | undefined)?.style;
          const fill = String(style?.fill ?? '').replace(/\s/g, '').toLowerCase();
          const white = fill === 'rgb(100%,100%,100%)' || fill === '#ffffff' || fill === '#fff' || fill === 'white';
          if (!white) continue;
          const score = path.subPaths.reduce((n, sp) => n + sp.curves.length, 0);
          if (score > bestScore) {
            bestScore = score;
            best = path;
          }
        }
        if (!best) throw new Error('No wall polygon (white filled path) found in this plan SVG.');
        const shapes = SVGLoader.createShapes(best);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of shapes) {
          for (const v of s.getPoints()) {
            if (v.x < minX) minX = v.x;
            if (v.y < minY) minY = v.y;
            if (v.x > maxX) maxX = v.x;
            if (v.y > maxY) maxY = v.y;
          }
        }
        return { shapes, bboxPt: [minX, minY, maxX, maxY], subPaths: best.subPaths.length, points: bestScore };
      });
    cache.set(url, p);
  }
  return p;
}
