// Scene-object names so the projection render pass (a sibling of
// PointCloud in the same scene) can find the projection overlay and its
// ghost/context underlay without prop-threading refs across components.
export const PROJECTION_POINTS_NAME = 'projectionPoints';
export const PROJECTION_CONTEXT_NAME = 'projectionContext';
export const FOCUS_MARKER_NAME = 'focusMarker';

/** The mapZebrain brain-mesh group. Every pass that renders the whole scene
 *  has to decide whether the translucent shells belong in it — the ID-buffer
 *  pick pass must exclude them, and the projection pass must include them in
 *  its context underlay but exclude them from its reduction targets. */
export const BRAIN_MESH_GROUP_NAME = 'brainMeshGroup';
