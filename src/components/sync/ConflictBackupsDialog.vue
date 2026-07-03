<script setup lang="ts">
import IconButton from '@/components/ui/IconButton.vue'
import type { ConflictBackupEntry } from '@/utils/syncConflict'

defineProps<{
  entries: ConflictBackupEntry[]
  visible: boolean
  /** id các entry được phép Restore (row còn tồn tại + không thuộc secure folder). */
  restorableIds: Set<string>
}>()

defineEmits<{
  restore: [entry: ConflictBackupEntry]
  dismiss: [entry: ConflictBackupEntry]
  close: []
}>()

function kindLabel(kind: ConflictBackupEntry['kind']): string {
  if (kind === 'note_body') return 'NOTE SECTION'
  if (kind === 'calendar') return 'CALENDAR EVENT'
  return 'NOTE'
}

function snippet(entry: ConflictBackupEntry): string {
  const raw = String(
    entry.row.title ?? entry.row.label ?? entry.row.content ?? entry.row.id ?? '',
  )
  return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw
}
</script>

<template>
  <Transition name="dialog">
    <div v-if="visible" class="conflict-backups-overlay" @click.self="$emit('close')">
      <div class="conflict-backups-dialog" role="dialog" aria-modal="true">
        <header class="conflict-backups-dialog__header">
          <span class="conflict-backups-dialog__title">
            ⚠ SYNC CONFLICTS — YOUR EDITS WERE SUPERSEDED
          </span>
          <IconButton variant="default" label="Close" @click="$emit('close')">
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

        <p class="conflict-backups-dialog__subtitle">
          These local edits lost to newer versions from another device. Restore to re-apply them,
          or discard.
        </p>

        <section class="conflict-backups-dialog__list">
          <div
            v-for="entry in entries"
            :key="entry.id"
            class="conflict-backups-item"
          >
            <div class="conflict-backups-item__meta">
              <span class="conflict-backups-item__kind">{{ kindLabel(entry.kind) }}</span>
              <span class="conflict-backups-item__at">{{ entry.at }}</span>
            </div>
            <div class="conflict-backups-item__snippet">{{ snippet(entry) }}</div>
            <div class="conflict-backups-item__actions">
              <button
                v-if="restorableIds.has(entry.id)"
                class="conflict-backups-dialog__btn conflict-backups-dialog__btn--primary"
                type="button"
                @click="$emit('restore', entry)"
              >
                [ RESTORE MY VERSION ]
              </button>
              <button
                class="conflict-backups-dialog__btn"
                type="button"
                @click="$emit('dismiss', entry)"
              >
                [ DISCARD ]
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.conflict-backups-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-scrim);
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.conflict-backups-dialog {
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

.conflict-backups-dialog__header {
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

.conflict-backups-dialog__title {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 700;
  letter-spacing: -0.012em;
}

.conflict-backups-dialog__subtitle {
  margin: 0 0 10px;
  padding: 10px;
  font-size: 13px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-secondary) 80%, transparent);
}

.conflict-backups-dialog__list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.conflict-backups-item {
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 58%, transparent);
}

.conflict-backups-item__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}

.conflict-backups-item__at {
  font-weight: 400;
  color: var(--text-muted);
  text-transform: none;
  letter-spacing: normal;
  font-size: 10px;
}

.conflict-backups-item__snippet {
  font-size: 12px;
  color: var(--text-secondary);
  margin-bottom: 8px;
  word-break: break-word;
}

.conflict-backups-item__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.conflict-backups-dialog__btn {
  flex: 1;
  min-width: 120px;
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

.conflict-backups-dialog__btn:hover {
  border-color: var(--accent-soft-border);
  background: var(--surface-accent-muted);
  color: var(--text-primary);
}

.conflict-backups-dialog__btn--primary {
  border-color: var(--accent);
  color: var(--on-accent);
  background: var(--accent);
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
