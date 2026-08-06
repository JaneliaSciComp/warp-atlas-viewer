import { describe, it, expect } from 'vitest';
import {
  RAIL_WIDTH,
  SIDEBAR_WIDTH_DEFAULT,
  nextSidebarWidth,
  outerGridTemplate,
} from './usePanelLayout';

describe('nextSidebarWidth', () => {
  // The resize strip sits on the sidebar's RIGHT edge, so dragging right
  // grows it. The detail panel's strip is on its LEFT edge and negates the
  // delta; copying that sign here would make the sidebar shrink when dragged
  // outward. This is the assertion that catches it.
  it('grows when dragged right and shrinks when dragged left', () => {
    expect(nextSidebarWidth(400, 50)).toBe(450);
    expect(nextSidebarWidth(400, -50)).toBe(350);
  });

  it('clamps to the drag bounds', () => {
    expect(nextSidebarWidth(300, -1000)).toBe(280);
    expect(nextSidebarWidth(600, 1000)).toBe(700);
  });

  it('is a no-op for a zero delta', () => {
    expect(nextSidebarWidth(SIDEBAR_WIDTH_DEFAULT, 0)).toBe(SIDEBAR_WIDTH_DEFAULT);
  });
});

describe('outerGridTemplate', () => {
  // Standalone must be byte-identical to what App produced before this
  // change, or every non-embedded layout shifts.
  it('reproduces the standalone templates exactly', () => {
    expect(
      outerGridTemplate({
        embedded: false,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: true,
        detailWidth: 360,
      }),
    ).toBe('minmax(0, 1fr) 360px');
    expect(
      outerGridTemplate({
        embedded: false,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: false,
        detailWidth: 360,
      }),
    ).toBe('minmax(0, 1fr)');
  });

  it('builds five tracks in embedded mode with both panels open', () => {
    expect(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: true,
        detailWidth: 400,
      }),
    ).toBe(
      '35px min(360px, calc(40% - 28px)) minmax(0, 1fr) ' +
        'min(400px, calc(40% - 28px)) 35px',
    );
  });

  it('drops a collapsed panel track but keeps both rails', () => {
    expect(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: false,
        sidebarWidth: 360,
        detailOpen: true,
        detailWidth: 400,
      }),
    ).toBe('35px minmax(0, 1fr) min(400px, calc(40% - 28px)) 35px');
    expect(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: false,
        detailWidth: 400,
      }),
    ).toBe('35px min(360px, calc(40% - 28px)) minmax(0, 1fr) 35px');
    expect(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: false,
        sidebarWidth: 360,
        detailOpen: false,
        detailWidth: 400,
      }),
    ).toBe('35px minmax(0, 1fr) 35px');
  });

  // Screenshot mode renders no rails, so it must get no rail tracks either:
  // an empty track shifts every later child a column left, and a dummy child
  // to fill it paints a 35px gutter into the one mode meant for a clean
  // capture. Three tracks, three children.
  it('drops the rail tracks entirely in screenshot mode', () => {
    expect(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: true,
        detailWidth: 400,
        screenshotMode: true,
      }),
    ).toBe('min(360px, calc(40% - 28px)) minmax(0, 1fr) min(400px, calc(40% - 28px))');
    expect(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: false,
        sidebarWidth: 360,
        detailOpen: false,
        detailWidth: 400,
        screenshotMode: true,
      }),
    ).toBe('minmax(0, 1fr)');
    // Standalone ignores it — there are no rails there to drop.
    expect(
      outerGridTemplate({
        embedded: false,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: true,
        detailWidth: 360,
        screenshotMode: true,
      }),
    ).toBe('minmax(0, 1fr) 360px');
  });

  /**
   * Resolve an emitted template to used pixel widths the way the grid
   * algorithm does: every fixed track takes its resolved size and the single
   * `minmax(0, 1fr)` gets whatever is left (never negative — a shortfall
   * becomes overflow instead). Only the three track forms
   * `outerGridTemplate` emits are understood, and the round-trip assertion
   * below fails loudly if it ever emits a fourth. Chromium is the real
   * resolver: tests/smoke/embedded.smoke.ts measures the same numbers in a
   * browser so the two are cross-checked.
   */
  function resolveTemplate(template: string, container: number): number[] {
    const tracks =
      template.match(/min\(\d+px, calc\([\d.]+% - [\d.]+px\)\)|minmax\(0, 1fr\)|[\d.]+px/g) ?? [];
    expect(tracks.join(' '), 'resolver understood every track').toBe(template);
    const sizes = tracks.map((track) => {
      if (track === 'minmax(0, 1fr)') return null;
      const capped = /^min\((\d+)px, calc\(([\d.]+)% - ([\d.]+)px\)\)$/.exec(track);
      if (capped) {
        const [, px, pct, sub] = capped;
        return Math.max(0, Math.min(Number(px), (Number(pct) / 100) * container - Number(sub)));
      }
      return Number(track.replace('px', ''));
    });
    const fixed = sizes.reduce<number>((sum, size) => sum + (size ?? 0), 0);
    return sizes.map((size) => size ?? Math.max(0, container - fixed));
  }

  // The property the literal strings above only encode indirectly, and the
  // one the plan should have stated instead of sampling two viewport widths
  // where the defaults happen to fit: whatever the panel widths are, the
  // viewer track survives and both rails stay inside the container.
  // Uncapped, the fixed tracks out-total the container — measured at 500x700
  // with the DEFAULT 360/360: 0px viewer, rail-detail at x=755 inside a 500px
  // viewport, i.e. clipped away by the root `overflow-hidden`. In embedded
  // mode that rail is the detail panel's only toggle.
  it('leaves the viewer track and both rails room at every container width', () => {
    // 1280/1024 are where the plan's manual checklist stopped; 500 is where
    // it broke; below that is the squeeze. 71px is the arithmetic floor — one
    // pixel more than the two rails themselves.
    for (const container of [1280, 1024, 640, 500, 360, 280, 100, 71]) {
      // Defaults, and the widest a share URL can restore (sidebarWidth
      // clamps to 700, detailWidth to 800 — the hostile case from the review).
      for (const [sidebarWidth, detailWidth] of [[360, 360], [700, 800]] as const) {
        const template = outerGridTemplate({
          embedded: true,
          sidebarOpen: true,
          sidebarWidth,
          detailOpen: true,
          detailWidth,
        });
        const sizes = resolveTemplate(template, container);
        const where = `${container}px container, ${sidebarWidth}/${detailWidth} panels`;
        expect(sizes, where).toHaveLength(5);
        expect(sizes[2], `viewer track at ${where}`).toBeGreaterThan(0);
        // Right rail fully inside: its left edge plus its own width must fit.
        const total = sizes.reduce((sum, size) => sum + size, 0);
        expect(total, `track total at ${where}`).toBeLessThanOrEqual(container);
        expect(sizes[0]).toBe(RAIL_WIDTH);
        expect(sizes[4]).toBe(RAIL_WIDTH);
      }
    }
  });

  it('leaves the dragged width alone once it fits', () => {
    // A cap that always bit would silently shrink every embedded panel, so
    // check the inert case as well as the squeeze.
    expect(resolveTemplate(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: true,
        detailWidth: 360,
      }),
      1280,
    )).toEqual([35, 360, 490, 360, 35]);
    // 40% of (500 − 70) = 172 each, leaving 86 for the viewer.
    expect(resolveTemplate(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: true,
        detailWidth: 360,
      }),
      500,
    )).toEqual([35, 172, 86, 172, 35]);
  });

  it('uses mapZebrain’s 35px rail width', () => {
    expect(RAIL_WIDTH).toBe(35);
  });
});
