<script setup lang="ts">
import { ref, useId } from 'vue'

const props = withDefaults(
  defineProps<{
    title: string
    defaultOpen?: boolean
  }>(),
  { defaultOpen: false },
)

const open = ref(props.defaultOpen)
const baseId = useId()
const headingId = `${baseId}-h`
const panelId = `${baseId}-p`

function toggle(): void {
  open.value = !open.value
}
</script>

<template>
  <section class="set-acc">
    <h3 :id="headingId" class="set-acc__heading">
      <button
        type="button"
        class="set-acc__trigger"
        :aria-expanded="open"
        :aria-controls="panelId"
        @click="toggle"
      >
        <span class="set-acc__chevron" aria-hidden="true">{{ open ? '▼' : '▶' }}</span>
        <span class="set-acc__title">{{ title }}</span>
      </button>
    </h3>
    <div
      v-show="open"
      :id="panelId"
      class="set-acc__panel"
      role="region"
      :aria-labelledby="headingId"
    >
      <div class="set-acc__inner">
        <slot />
      </div>
    </div>
  </section>
</template>

<style scoped>
.set-acc {
  margin-bottom: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
  overflow: hidden;
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.set-acc__heading {
  margin: 0;
  font-size: inherit;
  font-weight: inherit;
}

.set-acc__trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 9px 10px;
  border: none;
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  color: var(--text-primary);
  font-family: inherit;
  font-size: var(--font-size-sm);
  font-weight: 700;
  letter-spacing: -0.012em;
  text-align: left;
  cursor: pointer;
}

.set-acc__trigger:hover {
  background: var(--surface-accent-muted);
  color: var(--accent-dashboard);
}

.set-acc__trigger:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

.set-acc__chevron {
  flex: 0 0 auto;
  width: 1.25em;
  font-size: 10px;
  line-height: 1;
  color: var(--text-muted);
}

.set-acc__title {
  flex: 1 1 auto;
  min-width: 0;
}

.set-acc__panel {
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg-secondary) 82%, transparent);
}

.set-acc__inner {
  padding: 10px;
}
</style>
