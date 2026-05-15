<script setup lang="ts">
import { computed, inject } from 'vue';
import { useData } from 'vitepress';

defineProps<{
  screenMenu?: boolean;
}>();

const closeScreen = inject<(() => void) | undefined>('close-screen', undefined);
const { theme } = useData();

const viewerUrl = computed(() => (theme.value as { viewerUrl?: string }).viewerUrl ?? '/');
</script>

<template>
  <a
    v-if="screenMenu"
    class="VPLink VPNavScreenMenuGroupLink vp-external-link-icon"
    :href="viewerUrl"
    target="_blank"
    rel="noopener noreferrer"
    @click="closeScreen?.()"
  >
    <span>Viewer</span>
  </a>

  <div v-else class="VPMenuLink">
    <a
      class="VPLink link vp-external-link-icon"
      :href="viewerUrl"
      target="_blank"
      rel="noopener noreferrer"
    >
      <span>Viewer</span>
    </a>
  </div>
</template>

<style scoped>
.link {
  display: block;
  border-radius: 6px;
  padding: 0 12px;
  line-height: 32px;
  font-size: 14px;
  font-weight: 500;
  color: var(--vp-c-text-1);
  white-space: nowrap;
  transition:
    background-color 0.25s,
    color 0.25s;
}

.link:hover {
  color: var(--vp-c-brand-1);
  background-color: var(--vp-c-default-soft);
}

.VPNavScreenMenuGroupLink {
  display: block;
  margin-left: 12px;
  line-height: 32px;
  font-size: 14px;
  font-weight: 400;
  color: var(--vp-c-text-1);
  transition: color 0.25s;
}

.VPNavScreenMenuGroupLink:hover {
  color: var(--vp-c-brand-1);
}
</style>
