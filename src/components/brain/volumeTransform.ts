/** The transform between the viewer's preprocessed coordinates and world
 *  coordinates.
 *
 *  Everything in the 3D scene that comes from preprocessed data — the cell
 *  point cloud, and the mapZebrain brain meshes — is rendered inside a group
 *  carrying this rotation and scale. Three composes it as M = T * R * S, so a
 *  preprocessed vertex (x, y, z) lands at world (y, x, z):
 *
 *    preprocessed:  x = lateral,    y = rostral +,  z = dorsal +
 *    world:         x = rostral +,  y = lateral,    z = dorsal +
 *
 *  It exists to lay the brain's long rostro-caudal axis across the wide 3D
 *  panel, which is why the default dorsal view shows the fish pointing
 *  screen-right rather than up.
 *
 *  Two things to know before using it:
 *
 *  1. Composed with the rotation, the scale has determinant −1 — this is a
 *     MIRROR. World handedness is reversed relative to the mapZebrain voxel
 *     axes, so anything that cares about anatomical left vs right has to be
 *     confirmed visually, not derived. It also inverts triangle winding, so
 *     meshes rendered here want THREE.DoubleSide.
 *  2. There is no translation, so the origin maps to the origin and lengths
 *     are preserved: camera distances don't depend on the transform.
 *
 *  Anything you add to the scene in preprocessed coordinates must be a child
 *  of a group with these two values, or it will not line up with the cells.
 */
export const VOLUME_GROUP_ROTATION: [number, number, number] = [0, 0, Math.PI / 2];
export const VOLUME_GROUP_SCALE: [number, number, number] = [1, -1, 1];
