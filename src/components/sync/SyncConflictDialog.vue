<script setup lang="ts">
import type { ConflictReport } from '@/services/localFirst/conflictDetector'
import type { SyncStrategy } from '@/services/localFirst/syncEngine.service'

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
          <button class="conflict-dialog__close" @click="$emit('resolve', 'cancel')">✕</button>
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
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.conflict-dialog {
  background: var(--bg-primary);
  border: 1px solid var(--accent);
  font-family: 'IBM Plex Mono', 'JetBrains Mono', 'Courier New', monospace;
  max-width: 600px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.conflict-dialog__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-secondary);
}

.conflict-dialog__title {
  font-size: 12px;
  color: var(--accent);
  letter-spacing: 1px;
}

.conflict-dialog__close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--text-primary);
  font-size: 14px;
  padding: 0;
  line-height: 1;
}

.conflict-dialog__close:hover {
  color: var(--accent);
}

.conflict-dialog__summary {
  padding: 12px;
  font-size: 13px;
  border-bottom: 1px solid var(--border);
}

.conflict-dialog__summary p {
  margin: 0 0 4px;
}

.conflict-dialog__list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.conflict-dialog__list-header {
  font-size: 10px;
  color: var(--accent);
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
  padding: 12px;
  border-top: 1px solid var(--border);
  flex-wrap: wrap;
}

.conflict-dialog__btn {
  flex: 1;
  min-width: 140px;
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border);
  font-family: inherit;
  font-size: 11px;
  padding: 6px 10px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.conflict-dialog__btn:hover {
  background: var(--accent);
  color: var(--bg-primary);
}

.conflict-dialog__btn--primary {
  border-color: var(--accent);
  color: var(--accent);
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
