<script setup lang="ts">
import SkeletonLoader from '@/components/ui/SkeletonLoader.vue'
import { useLangStore } from '@/stores/uiLang'

const { t } = useLangStore()
</script>

<template>
  <div class="dash-skel" role="status" :aria-label="t('app.loading')">
    <!-- Reminder bar giả -->
    <div class="dash-skel__bar">
      <SkeletonLoader variant="circle" width="20" height="20" />
      <SkeletonLoader variant="line" width="240" height="12" rounded="6px" />
    </div>

    <!-- Search bar giả -->
    <div class="dash-skel__search">
      <SkeletonLoader variant="line" width="100%" height="38" rounded="9999px" />
    </div>

    <!-- Body 2 cột (notes layout) -->
    <div class="dash-skel__body">
      <div class="dash-skel__col dash-skel__col--side">
        <SkeletonLoader variant="pill" width="120" height="22" />
        <div class="dash-skel__list">
          <div v-for="i in 6" :key="i" class="dash-skel__item">
            <SkeletonLoader variant="line" :width="`${85 - i * 6}%`" height="12" rounded="6px" />
            <SkeletonLoader variant="line" width="50%" height="10" rounded="6px" />
          </div>
        </div>
      </div>
      <div class="dash-skel__col dash-skel__col--main">
        <SkeletonLoader variant="pill" width="160" height="22" />
        <SkeletonLoader variant="line" width="100%" height="12" rounded="6px" />
        <SkeletonLoader variant="line" width="92%" height="12" rounded="6px" />
        <SkeletonLoader variant="line" width="78%" height="12" rounded="6px" />
        <SkeletonLoader variant="line" width="100%" height="12" rounded="6px" />
        <SkeletonLoader variant="line" width="64%" height="12" rounded="6px" />
        <SkeletonLoader variant="block" width="100%" height="120" rounded="12px" />
        <SkeletonLoader variant="line" width="88%" height="12" rounded="6px" />
        <SkeletonLoader variant="line" width="72%" height="12" rounded="6px" />
      </div>
    </div>

    <span class="visually-hidden">{{ t('app.loading') }}</span>
  </div>
</template>

<style scoped>
.dash-skel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  padding: 10px 12px 12px;
  overflow: hidden;
}

.dash-skel__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--accent) 6%, var(--bg-secondary));
}

.dash-skel__search {
  padding: 0 2px;
}

.dash-skel__body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  gap: 10px;
}

.dash-skel__col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
  overflow: hidden;
}

.dash-skel__col--side {
  width: 220px;
  flex-shrink: 0;
}

.dash-skel__col--main {
  flex: 1 1 auto;
  min-width: 0;
}

.dash-skel__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.dash-skel__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-panel) 40%, transparent);
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
