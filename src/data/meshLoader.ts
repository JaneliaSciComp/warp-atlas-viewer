/** Lazy loader for the mapZebrain whole-brain meshes.
 *
 *  These live in their own manifest (preprocessed/meshes.json), separate
 *  from neurons.json, for two reasons: the primary dataset load path stays
 *  completely untouched, and the meshes are only fetched when a user
 *  actually turns one on rather than upfront with the cell data.
 *
 *  Blobs are non-indexed float32 vertex positions in the viewer's
 *  preprocessed coordinate space, produced by scripts/fetch_meshes.py.
 *  Render them inside a group carrying VOLUME_GROUP_ROTATION and
 *  VOLUME_GROUP_SCALE so they line up with the point cloud.
 */
import { streamBin } from './dataLoader';

const PREPROCESSED_BASE = './preprocessed/';

export type BrainMeshKey = 'outline' | 'fibers' | 'cellBodies';

export interface BrainMeshEntry {
  file: string;
  triangles: number;
  color: string;
}

export interface MeshManifest {
  version: number;
  source: string;
  voxelCenter: [number, number, number];
  meshes: Record<BrainMeshKey, BrainMeshEntry>;
}

export interface BrainMeshControl {
  key: BrainMeshKey;
  label: string;
  enabledKey: 'brainOutline' | 'brainFibers' | 'brainCellBodies';
  opacityKey: 'brainOutlineOpacity' | 'brainFibersOpacity' | 'brainCellBodiesOpacity';
}

/** Single source of truth for the mesh key ↔ settings field mapping, shared
 *  by the renderer (BrainMeshes) and the Settings UI so the two can't drift.
 *
 *  enabledKey / opacityKey are plain string-literal types rather than
 *  `keyof SettingsState`, so this module does not depend on those fields
 *  existing yet; the names are checked wherever `settings` is indexed. */
export const BRAIN_MESH_CONTROLS: BrainMeshControl[] = [
  {
    key: 'outline',
    label: 'Brain outline',
    enabledKey: 'brainOutline',
    opacityKey: 'brainOutlineOpacity',
  },
  {
    key: 'fibers',
    label: 'Brain fibers',
    enabledKey: 'brainFibers',
    opacityKey: 'brainFibersOpacity',
  },
  {
    key: 'cellBodies',
    label: 'Brain cell bodies',
    enabledKey: 'brainCellBodies',
    opacityKey: 'brainCellBodiesOpacity',
  },
];

export const BRAIN_MESH_KEYS: BrainMeshKey[] = BRAIN_MESH_CONTROLS.map((c) => c.key);

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function parseMeshManifest(raw: unknown): MeshManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('meshes.json is not an object');
  }
  const m = raw as Record<string, unknown>;
  const center = m.voxelCenter;
  if (!Array.isArray(center) || center.length !== 3 || !center.every(isFiniteNum)) {
    throw new Error('meshes.json voxelCenter must be 3 finite numbers');
  }
  const meshesRaw = m.meshes;
  if (!meshesRaw || typeof meshesRaw !== 'object') {
    throw new Error('meshes.json has no meshes object');
  }
  const src = meshesRaw as Record<string, unknown>;
  const meshes = {} as Record<BrainMeshKey, BrainMeshEntry>;
  for (const key of BRAIN_MESH_KEYS) {
    const e = src[key];
    if (!e || typeof e !== 'object') {
      throw new Error(`meshes.json is missing mesh "${key}"`);
    }
    const entry = e as Record<string, unknown>;
    if (typeof entry.file !== 'string' || entry.file.length === 0) {
      throw new Error(`meshes.json mesh "${key}" has no file`);
    }
    if (!isFiniteNum(entry.triangles) || entry.triangles <= 0) {
      throw new Error(`meshes.json mesh "${key}" has invalid triangles`);
    }
    meshes[key] = {
      file: entry.file,
      triangles: entry.triangles,
      color: typeof entry.color === 'string' ? entry.color : '#dddcdf',
    };
  }
  return {
    version: isFiniteNum(m.version) ? m.version : 1,
    source: typeof m.source === 'string' ? m.source : '',
    voxelCenter: [center[0], center[1], center[2]],
    meshes,
  };
}

/** Non-indexed geometry: 3 vertices per triangle, 3 floats per vertex. */
export function decodeMeshBuffer(entry: BrainMeshEntry, buf: ArrayBuffer): Float32Array {
  const expected = entry.triangles * 9;
  const actual = buf.byteLength / 4;
  if (actual !== expected) {
    throw new Error(
      `${entry.file}: expected ${expected} floats (${entry.triangles} triangles) ` +
        `but got ${actual}. Re-run scripts/fetch_meshes.py.`,
    );
  }
  return new Float32Array(buf);
}

let manifestPromise: Promise<MeshManifest | null> | null = null;

/** Resolves to null (never rejects) when the meshes have not been generated,
 *  so the UI can show a "run scripts/fetch_meshes.py" hint instead of
 *  breaking. Also covers mock mode, which has no preprocessed/ at all. */
export function loadMeshManifest(): Promise<MeshManifest | null> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      try {
        const res = await fetch(`${PREPROCESSED_BASE}meshes.json`, { cache: 'no-cache' });
        if (!res.ok) return null;
        return parseMeshManifest(await res.json());
      } catch {
        return null;
      }
    })();
  }
  return manifestPromise;
}

const meshCache = new Map<BrainMeshKey, Promise<Float32Array>>();

/** Rejects with a specific message if this one mesh is unavailable, leaving
 *  the other two usable. */
export function loadBrainMesh(key: BrainMeshKey): Promise<Float32Array> {
  const cached = meshCache.get(key);
  if (cached) return cached;
  const p = (async () => {
    const manifest = await loadMeshManifest();
    if (!manifest) {
      throw new Error('preprocessed/meshes.json not found - run scripts/fetch_meshes.py');
    }
    const entry = manifest.meshes[key];
    const res = await fetch(`${PREPROCESSED_BASE}${entry.file}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${entry.file} ${res.status}`);
    return decodeMeshBuffer(entry, await streamBin(res, () => {}));
  })();
  meshCache.set(key, p);
  // A failed fetch shouldn't poison the cache forever - drop it so a later
  // retry (e.g. after the user regenerates the files) can succeed.
  p.catch(() => meshCache.delete(key));
  return p;
}
