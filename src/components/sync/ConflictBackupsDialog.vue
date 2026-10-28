<script setup lang="ts">
import AppIcon from '@/components/ui/AppIcon.vue'
import IconButton from '@/components/ui/IconButton.vue'
import { useLangStore } from '@/stores/uiLang'
import type { ConflictBackupEntry } from '@/utils/syncConflict'
import { isEncryptedEnvelope } from '@/utils/secureCrypto'

const { t } = useLangStore()

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
  if (kind === 'note_body') return t('sync.backups.kindNoteBody')
  if (kind === 'calendar') return t('sync.backups.kindCalendar')
  return t('sync.backups.kindNote')
}

function snippet(entry: ConflictBackupEntry): string {
  const raw = String(
    entry.row.title ?? entry.row.label ?? entry.row.content ?? entry.row.id ?? '',
  )
  // S2C1.2: backup lưu bản mã hóa — chưa mở được thì không in chuỗi envelope ra UI.
  if (isEncryptedEnvelope(raw)) return t('sync.backups.encrypted')
  return raw.length > 80 ? `${raw.slice(0, 80)}…` : raw
}
</script>

<template>
  <Transition name="dialog">
    <div v-if="visible" class="conflict-backups-overlay" @click.self="$emit('close')">
      <div class="conflict-backups-dialog" role="dialog" aria-modal="true" aria-labelledby="conflict-backups-title">
        <header class="conflict-backups-dialog__header">
          <h2 id="conflict-backups-title" class="conflict-backups-dialog__title">
            {{ t('sync.backups.title') }}
          </h2>
          <IconButton variant="default" :label="t('common.close')" @click="$emit('close')">
            <AppIcon name="close" :size="18" />
          </IconButton>
        </header>

        <p class="conflict-backups-dialog__subtitle">{{ t('sync.backups.subtitle') }}</p>

        <!-- U15: mỗi bản = một dòng phẳng; ↶ khôi phục / 🗑 bỏ là icon như dòng sao lưu Bookmark. -->
        <ul class="conflict-backups-dialog__list">
          <li v-for="entry in entries" :key="entry.id" class="conflict-backups-item ds-row">
            <div class="conflict-backups-item__text">
              <p class="ds-label conflict-backups-item__meta">
                {{ kindLabel(entry.kind) }}<span class="ds-label__meta"> · {{ entry.at }}</span>
              </p>
              <p class="conflict-backups-item__snippet">{{ snippet(entry) }}</p>
            </div>
            <div class="conflict-backups-item__actions">
              <button
                v-if="restorableIds.has(entry.id)"
                type="button"
                class="ds-icon-action ds-icon-action--accent"
                :aria-label="t('sync.backups.restore')"
                :title="t('sync.backups.restore')"
                @click="$emit('restore', entry)"
              >
                <AppIcon name="restore" />
              </button>
              <button
                type="button"
                class="ds-icon-action ds-icon-action--danger"
                :aria-label="t('sync.backups.discard')"
                :title="t('sync.backups.discard')"
                @click="$emit('dismiss', entry)"
              >
                <AppIcon name="trash" />
              </button>
            </div>
          </li>
        </ul>
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
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 560px;
  max-height: 80vh;
  padding: 14px 12px 12px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-panel);
  box-shadow: 0 18px 48px var(--panel-ring);
  font-family: var(--font-body);
}

.conflict-backups-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 0 0 8px;
}

.conflict-backups-dialog__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.conflict-backups-dialog__subtitle {
  margin: 2px 8px 10px;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-muted);
}

.conflict-backups-dialog__list {
  flex: 1 1 auto;
  min-height: 0;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.conflict-backups-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px 8px 10px;
}

.conflict-backups-item + .conflict-backups-item {
  box-shadow: inset 0 1px 0 var(--border);
}

.conflict-backups-item__text {
  flex: 1 1 auto;
  min-width: 0;
}

.conflict-backups-item__meta {
  margin: 0 0 2px;
}

.conflict-backups-item__snippet {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  word-break: break-word;
}

.conflict-backups-item__actions {
  display: flex;
  flex: 0 0 auto;
  gap: 2px;
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
