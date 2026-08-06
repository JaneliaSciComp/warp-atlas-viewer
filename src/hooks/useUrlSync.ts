import { useCallback, useEffect, useRef } from 'react';
import type { FilterState, SettingsState } from '../data/types';
import { DEFAULT_SETTINGS } from '../data/types';
import {
  encodeHash,
  diffFilter,
  diffSettings,
  roundCamera,
  roundViewport,
  viewportIsDefault,
  roundLasso,
  type CameraState,
  type UmapViewport,
} from '../utils/urlState';

// Debounce window for URL writes. Re-runs after every render so any state
// change (including ref-driven camera/umap updates routed via
// scheduleUrlWrite) is captured. 50 ms is short enough that a single
// click feels instant, long enough to coalesce camera-drag bursts (the
// camera-controls 'change' fires 30-60×/sec while moving).
const URL_DEBOUNCE_MS = 50;
// Hard cap on how long a continuous emit burst can defer the write.
// Trackball damping produces ~2 s of sub-epsilon emits after release;
// without this, the URL hash would never update during the damping
// tail and a tab duplicated mid-coast would copy a stale URL.
const URL_MAX_WAIT_MS = 250;
// Browser + proxy hash limits vary (Firefox throws SecurityError past
// a few KB; Chrome silently truncates in extremes; corporate proxies
// are sometimes stricter). Cap below the practical floor so a
// multi-hundred-vertex lasso doesn't break sharing or history-state.
const MAX_HASH_BYTES = 6000;
// Activity playback speed multiplier omitted from the hash at this value.
const ACTIVITY_SPEED_DEFAULT = 10;

/**
 * Whether a URL write may proceed.
 *
 * `hashIsOurs` is the one that stops a pasted share link from being eaten.
 * Setting `location.hash` does not dispatch `hashchange` synchronously — the
 * event is queued — so a debounced write already in flight runs *first* and
 * `replaceState`s this page's state over the hash the user just pasted. By the
 * time the hashchange handler runs, `location.hash` is our own value again and
 * the reload it triggers restores the wrong state. Refusing to overwrite a hash
 * we did not write closes that window, and covers bookmarks and back/forward
 * for the same reason.
 *
 * Checked inside the writer rather than at each caller: writes arrive by three
 * routes — the debounce timer, a synchronous call from `scheduleUrlWrite` when
 * the burst cap is exceeded, and the pagehide/visibilitychange flush — and no
 * amount of `clearTimeout` in the hashchange handler can catch the second one.
 */
export function mayWriteUrl({
  playing,
  hashIsOurs,
}: {
  /** Activity playback is running; the hash is held still so a share link
   *  captures a frame rather than a moving picture. */
  playing: boolean;
  /** The current `location.hash` is the one this hook last wrote. False means
   *  something else changed it — a paste, a bookmark, back/forward — and our
   *  state is now the stale one. */
  hashIsOurs: boolean;
}): boolean {
  return !playing && hashIsOurs;
}

/** The view state the URL mirrors. All sanitized values — see App. */
export interface UrlSyncState {
  filter: FilterState;
  settings: SettingsState;
  focusedNeuron: number | null;
  detailOpen: boolean;
  bottomOpen: boolean;
  bottomHeight: number;
  detailWidth: number;
  umapWidth: number;
  sidebarOpen: boolean;
  sidebarWidth: number;
  lassoPoly: Float32Array | null;
  activitySpeed: number;
  activityPlaying: boolean;
}

export interface UrlSyncConfig {
  /** App default filter; fields equal to it are dropped from the hash. */
  defaultFilter: FilterState;
  bottomHeightDefault: number;
  detailWidthDefault: number;
  umapWidthDefault: number;
  sidebarWidthDefault: number;
  initialCamera: CameraState | null;
  initialUmap: UmapViewport | null;
}

export interface UrlSyncHandlers {
  handleCameraChange: (cam: CameraState) => void;
  handleUmapViewportChange: (vp: UmapViewport) => void;
  /** Live t-SNE viewport. Exposed so a caller that unmounts and remounts
   *  UmapPanel (the embedded-mode t-SNE tab) can reseed it from the current
   *  viewport rather than the module-load URL value. */
  umapViewportRef: React.MutableRefObject<UmapViewport | null>;
}

/**
 * Mirror the app's view state into the URL hash (Neuroglancer `#!{json}`
 * style) so a copy/paste reproduces the exact view, and write camera /
 * t-SNE viewport changes — which live in refs, not React state — into the
 * same debounced channel. Owns all the URL-writer machinery that
 * otherwise dominated App: the debounce/burst timers, the per-field
 * snapshot refs read by the event-listener flush path, the
 * schedule-on-change effect, the pagehide/visibilitychange flush, and the
 * hashchange reload.
 */
export function useUrlSync(state: UrlSyncState, config: UrlSyncConfig): UrlSyncHandlers {
  const {
    filter,
    settings,
    focusedNeuron,
    detailOpen,
    bottomOpen,
    bottomHeight,
    detailWidth,
    umapWidth,
    sidebarOpen,
    sidebarWidth,
    lassoPoly,
    activitySpeed,
    activityPlaying,
  } = state;

  // Camera + t-SNE viewport are read continuously during interaction.
  // We keep them in refs (not React state) so they don't trigger
  // re-renders, and use a debounced URL writer that reads from these
  // refs alongside the React state.
  const cameraRef = useRef<CameraState | null>(config.initialCamera);
  const umapRef = useRef<UmapViewport | null>(config.initialUmap);

  const urlTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlBurstStartRef = useRef<number | null>(null);
  const warnedLassoDroppedRef = useRef(false);
  const warnedHashDroppedRef = useRef(false);
  // Mirror of activityPlaying as a ref so the URL writer's setTimeout
  // can sample the latest value without re-creating the debounce dep
  // chain on every play/pause toggle.
  const isPlayingRef = useRef(false);
  // The hash as the browser reported it after our last write — read back rather
  // than assumed, so any encoding normalisation the browser applies can't make
  // our own hash look foreign. Seeded with the hash we loaded on, which is ours
  // for this purpose: it is what the app's state was built from.
  const lastWrittenHashRef = useRef(
    typeof window === 'undefined' ? '' : window.location.hash,
  );

  // Snapshot state into refs so the writer (called from event listeners
  // that must NOT depend on render-cycle closures) always reads the
  // latest values. The values handed in are already the sanitized ones,
  // so a hash written before the restore commit can't carry an
  // out-of-range index forward into the next share link.
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const focusedNeuronRef = useRef(focusedNeuron);
  focusedNeuronRef.current = focusedNeuron;
  const detailOpenRef = useRef(detailOpen);
  detailOpenRef.current = detailOpen;
  const bottomOpenRef = useRef(bottomOpen);
  bottomOpenRef.current = bottomOpen;
  const bottomHeightRef = useRef(bottomHeight);
  bottomHeightRef.current = bottomHeight;
  const detailWidthRef = useRef(detailWidth);
  detailWidthRef.current = detailWidth;
  const umapWidthRef = useRef(umapWidth);
  umapWidthRef.current = umapWidth;
  const sidebarOpenRef = useRef(sidebarOpen);
  sidebarOpenRef.current = sidebarOpen;
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const lassoPolyRef = useRef(lassoPoly);
  lassoPolyRef.current = lassoPoly;
  const activitySpeedRef = useRef(activitySpeed);
  activitySpeedRef.current = activitySpeed;
  // Config values (defaults) are effectively constant; keep them in a ref
  // so the writer callback can stay stable.
  const configRef = useRef(config);
  configRef.current = config;

  const writeUrlNow = useCallback(() => {
    if (urlTimerRef.current) {
      clearTimeout(urlTimerRef.current);
      urlTimerRef.current = null;
    }
    urlBurstStartRef.current = null;
    // The single choke point for every write, whatever route it arrived by.
    if (
      !mayWriteUrl({
        playing: isPlayingRef.current,
        hashIsOurs: window.location.hash === lastWrittenHashRef.current,
      })
    ) {
      return;
    }
    const {
      defaultFilter,
      bottomHeightDefault,
      detailWidthDefault,
      umapWidthDefault,
      sidebarWidthDefault,
    } = configRef.current;
    const filterDiff = diffFilter(filterRef.current, defaultFilter);
    const settingsDiff = diffSettings(settingsRef.current, DEFAULT_SETTINGS);
    // screenshotMode is an ephemeral presentation toggle — never persist
    // it, so a share link doesn't land the recipient in a chrome-hidden
    // state they can't easily escape.
    delete settingsDiff.screenshotMode;
    // embeddedMode is set by ?embed=1, not by the hash — persisting it would
    // let a shared link drop the recipient into iframe chrome.
    delete settingsDiff.embeddedMode;
    const cam = cameraRef.current ? roundCamera(cameraRef.current) : undefined;
    const umap = umapRef.current && !viewportIsDefault(umapRef.current)
      ? roundViewport(umapRef.current)
      : undefined;
    const lasso = lassoPolyRef.current ? roundLasso(lassoPolyRef.current) : undefined;
    const baseFields = {
      filter: Object.keys(filterDiff).length > 0 ? filterDiff : undefined,
      settings: Object.keys(settingsDiff).length > 0 ? settingsDiff : undefined,
      focusedNeuron: focusedNeuronRef.current ?? undefined,
      detail: detailOpenRef.current ? undefined : false,
      bottom: bottomOpenRef.current ? undefined : false,
      bottomHeight:
        bottomHeightRef.current !== bottomHeightDefault
          ? Math.round(bottomHeightRef.current)
          : undefined,
      detailWidth:
        detailWidthRef.current !== detailWidthDefault
          ? Math.round(detailWidthRef.current)
          : undefined,
      umapWidth:
        umapWidthRef.current !== umapWidthDefault
          ? Math.round(umapWidthRef.current)
          : undefined,
      sidebarOpen: sidebarOpenRef.current ? undefined : false,
      sidebarWidth:
        sidebarWidthRef.current !== sidebarWidthDefault
          ? Math.round(sidebarWidthRef.current)
          : undefined,
      camera: cam,
      umap,
      activitySpeed:
        activitySpeedRef.current !== ACTIVITY_SPEED_DEFAULT
          ? activitySpeedRef.current
          : undefined,
    };
    let hash = encodeHash({ ...baseFields, lasso });
    if (hash.length > MAX_HASH_BYTES && lasso) {
      // Drop just the lasso first — it's by far the largest field and
      // the selection itself stays live in app state.
      hash = encodeHash(baseFields);
      if (!warnedLassoDroppedRef.current) {
        console.warn(
          `[urlState] lasso polygon (${lasso.length / 2} vertices) makes share URL ` +
            `exceed ${MAX_HASH_BYTES}-byte cap; dropping lasso from URL hash. ` +
            `Selection stays active in the UI.`,
        );
        warnedLassoDroppedRef.current = true;
      }
    }
    if (hash.length > MAX_HASH_BYTES) {
      // Lasso wasn't the culprit (or wasn't there). Drop the whole hash.
      if (!warnedHashDroppedRef.current) {
        console.warn(
          `[urlState] encoded state exceeds ${MAX_HASH_BYTES}-byte URL hash cap; ` +
            `skipping URL persistence this update.`,
        );
        warnedHashDroppedRef.current = true;
      }
      hash = '';
    }
    const target = `${window.location.pathname}${window.location.search}${hash}`;
    window.history.replaceState(null, '', target);
    lastWrittenHashRef.current = window.location.hash;
  }, []);
  const scheduleUrlWrite = useCallback(() => {
    const now = Date.now();
    if (urlBurstStartRef.current === null) {
      urlBurstStartRef.current = now;
    }
    const burstElapsed = now - urlBurstStartRef.current;
    if (urlTimerRef.current) clearTimeout(urlTimerRef.current);
    if (burstElapsed >= URL_MAX_WAIT_MS) {
      // Force-write so a continuous emit burst (e.g. trackball damping)
      // can't defer the URL hash forever.
      writeUrlNow();
      return;
    }
    const remainingMax = URL_MAX_WAIT_MS - burstElapsed;
    const wait = Math.min(URL_DEBOUNCE_MS, remainingMax);
    urlTimerRef.current = setTimeout(() => {
      urlTimerRef.current = null;
      writeUrlNow();
    }, wait);
  }, [writeUrlNow]);
  // Schedule a URL write whenever React state changes. scheduleUrlWrite
  // itself is stable (it reads through refs), so we depend on the
  // individual state values instead — without this, lasso / filter /
  // panel changes wouldn't trigger a write at all.
  useEffect(() => {
    scheduleUrlWrite();
  }, [
    filter,
    settings,
    focusedNeuron,
    detailOpen,
    bottomOpen,
    bottomHeight,
    detailWidth,
    // umapWidth was missing here: dragging the t-SNE width changed state but
    // never scheduled a write, so it only reached the URL if some later
    // change or a pagehide flush happened to follow.
    umapWidth,
    sidebarOpen,
    sidebarWidth,
    lassoPoly,
    activitySpeed,
    scheduleUrlWrite,
  ]);
  // Belt-and-suspenders: flush the URL when the tab is about to be
  // hidden/closed. pagehide covers refresh, navigation, close, and the
  // bfcache path; visibilitychange catches tab-switches the user
  // didn't initiate via the address bar. No guard of its own — writeUrlNow
  // owns that for every caller, and its hash check is what keeps this from
  // stamping our state over a hash someone just pasted.
  useEffect(() => {
    const flush = () => {
      writeUrlNow();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [writeUrlNow]);
  // External hash changes (user pasting a URL, clicking a bookmark,
  // hitting back/forward) come in as hashchange events. Our own writes
  // go through history.replaceState, which does NOT fire hashchange,
  // so this handler only sees user-driven changes. Reload so the new
  // hash flows through the module-level INITIAL_URL_STATE read on mount.
  //
  // This handler cannot be what protects the pasted hash: `hashchange` is
  // dispatched asynchronously, so by the time it runs a write in flight may
  // already have replaced the pasted hash with ours — and then there is nothing
  // left to protect. writeUrlNow's hash check is what actually holds the line;
  // cancelling the pending timer here just saves it a pointless call.
  useEffect(() => {
    const onHashChange = () => {
      if (urlTimerRef.current) {
        clearTimeout(urlTimerRef.current);
        urlTimerRef.current = null;
      }
      window.location.reload();
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
  // Camera + t-SNE viewport changes go through refs; they call
  // scheduleUrlWrite directly so the URL still picks them up.
  const handleCameraChange = useCallback(
    (cam: CameraState) => {
      cameraRef.current = cam;
      scheduleUrlWrite();
    },
    [scheduleUrlWrite],
  );
  const handleUmapViewportChange = useCallback(
    (vp: UmapViewport) => {
      umapRef.current = vp;
      scheduleUrlWrite();
    },
    [scheduleUrlWrite],
  );
  // Reflect the lifted playing state into the URL-writer's ref and
  // flush a write on stop so the final activitySample lands in the
  // share URL (we suppress writes during playback to keep the URL
  // stable). Only fires on the play→pause transition.
  const prevPlayingRef = useRef(activityPlaying);
  useEffect(() => {
    isPlayingRef.current = activityPlaying;
    if (prevPlayingRef.current && !activityPlaying) scheduleUrlWrite();
    prevPlayingRef.current = activityPlaying;
  }, [activityPlaying, scheduleUrlWrite]);

  return { handleCameraChange, handleUmapViewportChange, umapViewportRef: umapRef };
}
