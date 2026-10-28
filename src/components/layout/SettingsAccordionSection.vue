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
        <span class="set-acc__title ds-label">{{ title }}</span>
        <svg
          class="set-acc__chevron"
          :class="{ 'set-acc__chevron--open': open }"
          viewBox="0 0 24 24"
          width="14"
          height="14"
          aria-hidden="true"
        >
          <path fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" d="M9 6l6 6-6 6" />
        </svg>
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
/* U11 (ADN popover): mục = nhãn in hoa + mũi tên, ngăn bằng đường kẻ mảnh — không còn hộp viền. */
.set-acc {
  border-top: 1px solid var(--border);
}

.set-acc:first-child {
  border-top: none;
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
  padding: 11px 6px 9px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.set-acc__trigger:hover .set-acc__title {
  color: var(--text-primary);
}

.set-acc__trigger:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

.set-acc__title {
  flex: 1 1 auto;
  min-width: 0;
}

.set-acc__chevron {
  flex: 0 0 auto;
  color: var(--text-muted);
  transition: transform 0.15s ease;
}

.set-acc__chevron--open {
  transform: rotate(90deg);
}

.set-acc__panel {
  padding: 0 6px 12px;
}

@media (prefers-reduced-motion: reduce) {
  .set-acc__chevron {
    transition: none;
  }
}
</style>
