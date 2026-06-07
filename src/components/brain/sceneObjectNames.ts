// Scene-object names so the projection render pass (a sibling of
// PointCloud in the same scene) can find the projection overlay and its
// ghost/context underlay without prop-threading refs across components.
export const PROJECTION_POINTS_NAME = 'projectionPoints';
export const PROJECTION_CONTEXT_NAME = 'projectionContext';
export const FOCUS_MARKER_NAME = 'focusMarker';
