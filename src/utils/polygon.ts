/** Standard ray-casting point-in-polygon test. The polygon is treated
 *  as closed — the last vertex implicitly connects back to the first.
 *  `poly` is a flat array [x0,y0,x1,y1,...]. */
export function pointInPolygon(x: number, y: number, poly: Float32Array): boolean {
  let inside = false;
  const n = poly.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i * 2];
    const yi = poly[i * 2 + 1];
    const xj = poly[j * 2];
    const yj = poly[j * 2 + 1];
    if (((yi > y) !== (yj > y)) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Run pointInPolygon against every cell's 2D position. Bounding-box
 *  fast-rejection keeps it cheap at 274k cells. */
export function cellsInPolygon(umap: Float32Array, count: number, poly: Float32Array): Uint32Array {
  if (poly.length < 6) return new Uint32Array(0);
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < poly.length; i += 2) {
    const x = poly[i], y = poly[i + 1];
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = umap[i * 2];
    const y = umap[i * 2 + 1];
    if (x < xmin || x > xmax || y < ymin || y > ymax) continue;
    if (pointInPolygon(x, y, poly)) out.push(i);
  }
  return Uint32Array.from(out);
}
