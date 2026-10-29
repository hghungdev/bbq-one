<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import type { ConflictReport } from '@/services/localFirst/conflictDetector'
import type { SyncStrategy } from '@/services/localFirst/syncEngine.service'
import { useLangStore } from '@/stores/uiLang'

const { t } = useLangStore()

const props = defineProps<{
  report: ConflictReport
  visible: boolean
}>()

const emit = defineEmits<{
  resolve: [strategy: SyncStrategy]
}>()

/** U29: Esc = Hủy (như bấm ra ngoài) — không đóng cả extension. */
function onKeydown(e: KeyboardEvent): void {
  if (!props.visible || e.key !== 'Escape') return
  e.preventDefault()
  emit('resolve', 'cancel')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Transition name="dialog">
    <div v-if="visible" class="conflict-overlay" @click.self="$emit('resolve', 'cancel')">
      <div class="conflict-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-conflict-title">
        <header class="conflict-dialog__header">
          <h2 id="sync-conflict-title" class="conflict-dialog__title">{{ t('sync.conflict.title') }}</h2>
          <IconButton
            variant="default"
            :label="t('common.close')"
            @click="$emit('resolve', 'cancel')"
          >
            <AppIcon name="close" :size="18" />
          </IconButton>
        </header>

        <div class="conflict-dialog__summary">
          <p>{{ t('sync.conflict.localCount', { n: report.totalLocal }) }}</p>
          <p v-if="report.totalConflicts > 0">
            {{ t('sync.conflict.conflictCount', { n: report.totalConflicts }) }}
          </p>
        </div>

        <section v-if="report.conflicts.length > 0" class="conflict-dialog__list">
          <p class="ds-label conflict-dialog__list-header">
            {{ t('sync.conflict.preview') }}<span class="ds-label__meta"> · {{ report.conflicts.length }}</span>
          </p>
          <ul>
            <li v-for="(c, i) in report.conflicts" :key="i" class="conflict-item">
              <div class="conflict-item__id">{{ c.identifier }}</div>
              <div class="conflict-item__values">
                <div>
                  <span class="conflict-item__label">{{ t('sync.conflict.local') }}</span>
                  {{ c.localValue }}
                </div>
                <div>
                  <span class="conflict-item__label">{{ t('sync.conflict.cloud') }}</span>
                  {{ c.cloudValue }}
                </div>
              </div>
            </li>
          </ul>
          <p v-if="report.hasMore" class="conflict-dialog__more">{{ t('sync.conflict.more') }}</p>
        </section>

        <p class="conflict-dialog__hint">{{ t('sync.conflict.hint') }}</p>

        <!-- U15: quyết định kết thúc hộp thoại = chữ (quy tắc 4); một nút chính. -->
        <footer class="conflict-dialog__actions">
          <button
            type="button"
            class="ds-text-action ds-text-action--muted"
            @click="$emit('resolve', 'cancel')"
          >
            {{ t('common.cancel') }}
          </button>
          <button type="button" class="ds-text-action" @click="$emit('resolve', 'use-cloud')">
            {{ t('sync.conflict.useCloud') }}
          </button>
          <button type="button" class="ds-primary" @click="$emit('resolve', 'use-local')">
            {{ t('sync.conflict.useLocal') }}
          </button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.conflict-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-scrim);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.conflict-dialog {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 520px;
  max-height: 80vh;
  padding: 14px 16px 14px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  box-shadow: 0 18px 48px var(--panel-ring);
  font-family: var(--font-body);
}

.conflict-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.conflict-dialog__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.conflict-dialog__summary {
  margin: 4px 0 10px;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.conflict-dialog__summary p {
  margin: 0 0 4px;
}

.conflict-dialog__list {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.conflict-dialog__list-header {
  margin: 0 0 6px;
}

.conflict-dialog__list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.conflict-item {
  padding: 8px 0;
  box-shadow: inset 0 -1px 0 var(--border);
}

.conflict-item__id {
  margin-bottom: 2px;
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.conflict-item__values {
  font-size: 12px;
  color: var(--text-secondary);
}

.conflict-item__label {
  display: inline-block;
  min-width: 72px;
  color: var(--text-muted);
}

.conflict-dialog__more,
.conflict-dialog__hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.conflict-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 12px;
}

.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s;
}

.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>
