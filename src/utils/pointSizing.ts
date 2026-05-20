const REFERENCE_CANVAS_AREA = 1100 * 700;
const MIN_CANVAS_POINT_SCALE = 0.6;
const MAX_CANVAS_POINT_SCALE = 2.0;

/** Canvas-size factor applied by the 3D point-cloud shaders in Auto
 *  point-density mode. The visible color pass and the ambient-occlusion
 *  normal/depth pass both need the exact same scale so AO contact
 *  shadows line up with the rendered point sprites. */
export function canvasPointSizeScale(
  autoSizing: boolean,
  width: number,
  height: number,
): number {
  if (!autoSizing) return 1;
  const area = Math.max(1, width * height);
  const scale = Math.sqrt(area / REFERENCE_CANVAS_AREA);
  return Math.max(MIN_CANVAS_POINT_SCALE, Math.min(MAX_CANVAS_POINT_SCALE, scale));
}
