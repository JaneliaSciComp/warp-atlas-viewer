import { describe, it, expect } from 'vitest';
import { tabsFor } from './FilterControls';

describe('tabsFor', () => {
  it('is the original three tabs when there is no t-SNE node', () => {
    expect(tabsFor(false).map((t) => t.id)).toEqual(['filters', 'settings', 'about']);
  });

  it('inserts t-SNE immediately right of Filters', () => {
    expect(tabsFor(true).map((t) => t.id)).toEqual([
      'filters',
      'tsne',
      'settings',
      'about',
    ]);
  });

  it('labels the t-SNE tab the same way the panel header does', () => {
    expect(tabsFor(true)[1].label).toBe('t-SNE');
  });
});
