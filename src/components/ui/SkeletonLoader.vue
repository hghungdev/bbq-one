<script setup lang="ts">
import { computed } from 'vue'

type SkeletonVariant = 'line' | 'block' | 'circle' | 'pill'

const props = withDefaults(
  defineProps<{
    variant?: SkeletonVariant
    width?: string | number
    height?: string | number
    rounded?: string | number
    count?: number
    /** Tỉ lệ chiều rộng giảm dần cho từng dòng khi count > 1 (cảm giác paragraph). */
    taper?: boolean
  }>(),
  {
    variant: 'line',
    count: 1,
    taper: false,
  },
)

const items = computed(() => Array.from({ length: Math.max(1, props.count) }))

function toCss(value: string | number | undefined): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'number' ? `${value}px` : value
}

function styleFor(idx: number): Record<string, string> {
  const style: Record<string, string> = {}
  const w = toCss(props.width)
  const h = toCss(props.height)
  const r = toCss(props.rounded)
  if (w) style.width = w
  if (h) style.height = h
  if (r) style.borderRadius = r
  if (props.taper && props.count > 1) {
    // Mỗi dòng tiếp theo ngắn hơn ~12% để trông giống đoạn văn thật.
    const factor = Math.max(0.45, 1 - idx * 0.12)
    style.width = `calc(${w ?? '100%'} * ${factor.toFixed(3)})`
  }
  return style
}
</script>

<template>
  <span
    v-for="(_, idx) in items"
    :key="idx"
    class="skel"
    :class="[`skel--${props.variant}`]"
    :style="styleFor(idx)"
    role="presentation"
    aria-hidden="true"
  />
</template>

<style scoped>
.skel {
  display: block;
  position: relative;
  overflow: hidden;
  /* Base panel với hairline để lẫn đẹp với UI. */
  background-color: color-mix(in srgb, var(--bg-panel) 72%, var(--bg-secondary));
  border: 1px solid color-mix(in srgb, var(--border) 55%, transparent);
  background-image: linear-gradient(
    100deg,
    transparent 0%,
    transparent 30%,
    color-mix(in srgb, var(--accent) 10%, var(--bg-panel)) 50%,
    transparent 70%,
    transparent 100%
  );
  background-size: 220% 100%;
  background-repeat: no-repeat;
  background-position: 220% 0;
  animation: skel-shimmer 1.6s ease-in-out infinite;
  will-change: background-position, opacity;
}

.skel + .skel {
  margin-top: 8px;
}

.skel--line {
  width: 100%;
  height: 12px;
  border-radius: var(--radius-pill);
}

.skel--block {
  width: 100%;
  height: 56px;
  border-radius: var(--radius-md);
}

.skel--circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}

.skel--pill {
  width: 96px;
  height: 28px;
  border-radius: var(--radius-pill);
}

@keyframes skel-shimmer {
  0% {
    background-position: 220% 0;
  }
  100% {
    background-position: -120% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .skel {
    animation-duration: 3.2s;
  }
}
</style>
