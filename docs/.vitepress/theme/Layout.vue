<script setup lang="ts">
import DefaultTheme from 'vitepress/theme';
import { useData } from 'vitepress';

const { Layout } = DefaultTheme;
const { theme } = useData();
</script>

<template>
  <Layout>
    <!-- The home hero's actions list is rendered from frontmatter and
     VitePress prefixes any `/...` link with `base`, so a viewer link
     can't live there directly. Teleport injects an extra <div class="action">
     into the existing actions container at mount time, with `defer` so
     the target exists by the time the move runs. Styles are unscoped
     because teleported content sits outside this component's data-v scope. -->
    <template #home-hero-actions-after>
      <Teleport to=".VPHero .actions" defer>
        <div class="action viewer-action">
          <a class="viewer-cta-button" :href="(theme as any).viewerUrl">Launch the viewer</a>
        </div>
      </Teleport>
    </template>
  </Layout>
</template>

<style>
/* The wrapping .action's `padding: 6px` is defined under
 * VPHomeHeroActions.vue's data-v scope, so the teleported wrapper
 * doesn't inherit it — restate it here so the button vertically aligns
 * with its siblings. */
.viewer-action {
  flex-shrink: 0;
  padding: 6px;
}

/* Mirrors .VPButton.medium.alt from VitePress's default theme. Restated
 * here rather than reused because VPButton.vue's styles are scoped to
 * its own data-v hash and don't apply to teleported markup. */
.viewer-cta-button {
  display: inline-block;
  border: 1px solid var(--vp-button-alt-border);
  text-align: center;
  font-weight: 600;
  white-space: nowrap;
  transition: color 0.25s, border-color 0.25s, background-color 0.25s;
  color: var(--vp-button-alt-text);
  background-color: var(--vp-button-alt-bg);
  border-radius: 20px;
  padding: 0 20px;
  line-height: 38px;
  font-size: 14px;
}
.viewer-cta-button:hover {
  border-color: var(--vp-button-alt-hover-border);
  color: var(--vp-button-alt-hover-text);
  background-color: var(--vp-button-alt-hover-bg);
  text-decoration: none;
}
.viewer-cta-button:active {
  border-color: var(--vp-button-alt-active-border);
  color: var(--vp-button-alt-active-text);
  background-color: var(--vp-button-alt-active-bg);
}
</style>
