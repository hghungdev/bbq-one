<script setup lang="ts">
import IconButton from '@/components/ui/IconButton.vue'
import type { ConflictReport } from '@/services/localFirst/conflictDetector'
import type { SyncStrategy } from '@/services/localFirst/syncEngine.service'
import { useLangStore } from '@/stores/uiLang'

const { t } = useLangStore()

defineProps<{
  report: ConflictReport
  visible: boolean
}>()

defineEmits<{
  resolve: [strategy: SyncStrategy]
}>()
</script>

<template>
  <Transition name="dialog">
    <div v-if="visible" class="conflict-overlay" @click.self="$emit('resolve', 'cancel')">
      <div class="conflict-dialog" role="dialog" aria-modal="true">
        <header class="conflict-dialog__header">
          <span class="conflict-dialog__title">⚠ SYNC CONFLICT DETECTED</span>
          <IconButton
            variant="default"
            :label="t('common.close')"
            @click="$emit('resolve', 'cancel')"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                d="M6 6l12 12M18 6L6 18"
              />
            </svg>
          </IconButton>
        </header>

        <section class="conflict-dialog__summary">
          <p>
            You have <strong>{{ report.totalLocal }}</strong> local entries.
          </p>
          <p>
            <strong>{{ report.totalConflicts }}</strong> entries already exist in your cloud account
            with different values.
          </p>
        </section>

        <section v-if="report.conflicts.length > 0" class="conflict-dialog__list">
          <div class="conflict-dialog__list-header">
            PREVIEW (first {{ report.conflicts.length }}):
          </div>
          <ul>
            <li v-for="(c, i) in report.conflicts" :key="i" class="conflict-item">
              <div class="conflict-item__id">{{ c.identifier }}</div>
              <div class="conflict-item__values">
                <div class="conflict-item__local">
                  <span class="conflict-item__label">LOCAL:</span>
                  {{ c.localValue }}
                </div>
                <div class="conflict-item__cloud">
                  <span class="conflict-item__label">CLOUD:</span>
                  {{ c.cloudValue }}
                </div>
              </div>
            </li>
          </ul>
          <div v-if="report.hasMore" class="conflict-dialog__more">
            ...and more conflicts not shown
          </div>
        </section>

        <footer class="conflict-dialog__actions">
          <button
            class="conflict-dialog__btn conflict-dialog__btn--primary"
            @click="$emit('resolve', 'use-local')"
          >
            [ USE LOCAL ] (overwrite cloud)
          </button>
          <button class="conflict-dialog__btn" @click="$emit('resolve', 'use-cloud')">
            [ USE CLOUD ] (discard local)
          </button>
          <button
            class="conflict-dialog__btn conflict-dialog__btn--cancel"
            @click="$emit('resolve', 'cancel')"
          >
            [ CANCEL ]
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
  background:
    radial-gradient(
      ellipse 110% 80% at 50% 0%,
      color-mix(in srgb, var(--danger) 5%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: 0 18px 54px var(--panel-ring);
  font-family: var(--font-body);
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 12px;
  overflow: hidden;
}

.conflict-dialog__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  margin-bottom: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 76%, var(--bg-secondary));
  box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 70%, transparent);
}

.conflict-dialog__title {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 700;
  letter-spacing: -0.012em;
}

.conflict-dialog__summary {
  padding: 10px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
  margin-bottom: 10px;
}

.conflict-dialog__summary p {
  margin: 0 0 4px;
}

.conflict-dialog__list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
}

.conflict-dialog__list-header {
  font-size: 10px;
  color: var(--text-primary);
  font-weight: 700;
  margin-bottom: 8px;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.conflict-dialog__list ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.conflict-item {
  margin-bottom: 12px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-panel) 58%, transparent);
}

.conflict-item__id {
  font-weight: bold;
  font-size: 12px;
  margin-bottom: 4px;
  color: var(--text-primary);
}

.conflict-item__values {
  font-size: 11px;
}

.conflict-item__local,
.conflict-item__cloud {
  padding: 2px 0;
  color: var(--text-secondary);
}

.conflict-item__label {
  display: inline-block;
  width: 60px;
  color: var(--accent);
  font-size: 10px;
}

.conflict-dialog__more {
  font-size: 11px;
  font-style: italic;
  text-align: center;
  padding: 8px;
  color: var(--text-muted);
}

.conflict-dialog__actions {
  display: flex;
  gap: 8px;
  padding: 6px;
  margin-top: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 72%, var(--bg-secondary));
  flex-wrap: wrap;
}

.conflict-dialog__btn {
  flex: 1;
  min-width: 140px;
  background: color-mix(in srgb, var(--bg-secondary) 78%, transparent);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  font-family: inherit;
  font-size: 11px;
  padding: 6px 10px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.conflict-dialog__btn:hover {
  border-color: var(--accent-soft-border);
  background: var(--surface-accent-muted);
  color: var(--text-primary);
}

.conflict-dialog__btn--primary {
  border-color: var(--accent);
  color: var(--on-accent);
  background: var(--accent);
}

.conflict-dialog__btn--cancel {
  color: var(--text-muted);
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
