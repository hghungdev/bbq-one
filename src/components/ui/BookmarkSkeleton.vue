<script setup lang="ts">
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue'
import { useLangStore } from '@/stores/uiLang'

const { t } = useLangStore()
</script>

<template>
  <div class="bm-skel" role="status" :aria-label="t('bookmark.loading')">
    <!-- Toolbar giả -->
    <div class="bm-skel__toolbar">
      <SkeletonLoader variant="pill" width="92" height="28" />
      <SkeletonLoader variant="pill" width="108" height="28" />
      <SkeletonLoader variant="pill" width="84" height="28" />
      <SkeletonLoader variant="pill" width="92" height="28" />
      <SkeletonLoader variant="line" width="180" height="10" rounded="9999px" />
    </div>

    <div class="bm-skel__body">
      <!-- Cột trái: backups -->
      <div class="bm-skel__col bm-skel__col--side">
        <SkeletonLoader variant="pill" width="120" height="22" />
        <div class="bm-skel__list">
          <div v-for="i in 4" :key="i" class="bm-skel__item">
            <SkeletonLoader variant="line" width="100%" height="12" rounded="6px" />
            <SkeletonLoader variant="line" width="60%" height="10" rounded="6px" />
          </div>
        </div>
      </div>

      <!-- Cột phải: tree -->
      <div class="bm-skel__col bm-skel__col--main">
        <SkeletonLoader variant="pill" width="100" height="22" />
        <div class="bm-skel__tree">
          <div
            v-for="row in 8"
            :key="row"
            class="bm-skel__row"
            :class="[`bm-skel__row--depth-${(row % 3)}`]"
          >
            <SkeletonLoader variant="circle" width="14" height="14" />
            <SkeletonLoader
              variant="line"
              :width="`${68 - (row % 4) * 8}%`"
              height="12"
              rounded="6px"
            />
          </div>
        </div>
      </div>
    </div>

    <span class="visually-hidden">{{ t('bookmark.loading') }}</span>
  </div>
</template>

<style scoped>
.bm-skel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  padding: 10px 12px 12px;
  overflow: hidden;
}

.bm-skel__toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.bm-skel__body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  gap: 10px;
}

.bm-skel__col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.bm-skel__col--side {
  width: 200px;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--bg-secondary) 78%, transparent);
}

.bm-skel__col--main {
  flex: 1 1 auto;
  min-width: 0;
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
}

.bm-skel__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bm-skel__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-panel) 40%, transparent);
}

.bm-skel__tree {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 4px;
}

.bm-skel__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 4px;
}

.bm-skel__row--depth-0 {
  padding-left: 4px;
}

.bm-skel__row--depth-1 {
  padding-left: 22px;
}

.bm-skel__row--depth-2 {
  padding-left: 40px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>
