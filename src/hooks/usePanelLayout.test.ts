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
    ).toBe('35px 360px minmax(0, 1fr) 400px 35px');
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
    ).toBe('35px minmax(0, 1fr) 400px 35px');
    expect(
      outerGridTemplate({
        embedded: true,
        sidebarOpen: true,
        sidebarWidth: 360,
        detailOpen: false,
        detailWidth: 400,
      }),
    ).toBe('35px 360px minmax(0, 1fr) 35px');
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

  it('uses mapZebrain’s 35px rail width', () => {
    expect(RAIL_WIDTH).toBe(35);
  });
});
