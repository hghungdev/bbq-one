<script setup lang="ts">
import { computed, onMounted, ref, shallowRef, watch } from 'vue'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/ui/AppIcon.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroConfirm from '@/components/ui/RetroConfirm.vue'
import SettingsAccordionSection from '@/components/layout/SettingsAccordionSection.vue'
import BackupRestoreDialog, { type RestorePreview } from '@/components/backup/BackupRestoreDialog.vue'
import { useLangStore } from '@/stores/uiLang'
import {
  applyRestore,
  backupNow,
  readBackupData,
  readBackupState,
  writeBackupState,
  type BackupState,
} from '@/services/backupFile.service'
import { BACKUP_MAX_BYTES, backupCounts, parseBackup, type BackupCounts, type BackupData } from '@/utils/backupFile'
import { sanitizeNoteHtml } from '@/utils/noteHtmlSanitize'

/**
 * B1: Cài đặt › Sao lưu — kiểu Termius (công tắc tự động, "Lần sao lưu gần nhất", "Sao lưu ngay") + khôi phục
 * "thay toàn bộ" (xem trước → xác nhận 2 lần). Đã đăng nhập (cờ FEATURES.backupFileSignedIn): chỉ "Sao lưu ngay".
 */
const props = defineProps<{
  signedIn: boolean
  /** App.vue: 'restore' = vừa mở từ popup để chọn file; 'done' = vừa khôi phục xong (sau tải lại trang). */
  focus?: 'restore' | 'done' | null
}>()

const emit = defineEmits<{
  /** Hộp xem trước / xác nhận đang mở — Cài đặt không đóng theo Esc (Esc chỉ đóng hộp trên cùng). */
  'layer-open': [open: boolean]
}>()

const langStore = useLangStore()
const { t } = langStore
const { lang } = storeToRefs(langStore)

const state = ref<BackupState | null>(null)
const inTab = ref(false)
const busy = ref(false)
const message = ref<{ kind: 'ok' | 'error'; text: string } | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)

const preview = ref<RestorePreview | null>(null)
/** shallowRef: dữ liệu file KHÔNG được bọc Proxy của Vue — chrome.storage ghi Proxy mảng thành object. */
const pendingData = shallowRef<BackupData | null>(null)
const confirmReplace = ref(false)

watch([preview, confirmReplace], ([p, c]) => emit('layer-open', !!p || c))

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(lang.value === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })
}

function countsLabel(c: BackupCounts): string {
  return t('backup.counts', {
    folders: c.folders,
    notes: c.notes,
    events: c.calendar_events,
    bookmarks: c.bookmark_backups,
  })
}

const lastLabel = computed(() =>
  state.value?.lastBackupAt ? t('backup.last', { date: formatDate(state.value.lastBackupAt) }) : t('backup.never'),
)

async function refresh(): Promise<void> {
  state.value = await readBackupState()
}

onMounted(async () => {
  await refresh()
  try {
    // Popup: getCurrent() không có tab → chọn file phải mở BBQOne trong tab (Chrome đóng popup khi hộp chọn file mở).
    inTab.value = !!(await chrome.tabs.getCurrent())
  } catch {
    inTab.value = false
  }
  if (props.focus === 'done' && state.value?.lastRestore) {
    message.value = { kind: 'ok', text: t('backup.restored', { counts: countsLabel(state.value.lastRestore.counts) }) }
  }
})

async function toggleAuto(): Promise<void> {
  if (!state.value) return
  await writeBackupState({ autoEnabled: !state.value.autoEnabled })
  await refresh()
}

async function onBackupNow(): Promise<void> {
  if (busy.value) return
  busy.value = true
  message.value = null
  try {
    const r = await backupNow({ source: props.signedIn ? 'account-cache' : 'local', now: new Date() })
    message.value = { kind: 'ok', text: t('backup.saved', { file: r.filename }) }
    await refresh()
  } catch (e) {
    console.error(e)
    message.value = { kind: 'error', text: t('backup.failed') }
  } finally {
    busy.value = false
  }
}

async function onRestoreClick(): Promise<void> {
  message.value = null
  if (!inTab.value) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('index.html#/dashboard?restore=1') })
    return
  }
  fileInputRef.value?.click()
}

/** File là dữ liệu NGOÀI: chặn kích thước trước khi đọc; parseBackup kiểm từng trường + lọc HTML ghi chú. */
async function onFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  message.value = null
  if (file.size > BACKUP_MAX_BYTES) {
    message.value = { kind: 'error', text: t('backup.error.too_large') }
    return
  }
  let text: string
  try {
    text = await file.text()
  } catch {
    message.value = { kind: 'error', text: t('backup.error.read') }
    return
  }
  const res = parseBackup(text, sanitizeNoteHtml)
  if (!res.ok) {
    message.value = { kind: 'error', text: t(`backup.error.${res.error}`) }
    return
  }
  const current = backupCounts(await readBackupData('local'))
  const d = res.dropped
  pendingData.value = res.file.data
  preview.value = {
    fileName: file.name,
    createdLabel: t('backup.preview.created', {
      date: res.file.exported_at ? formatDate(res.file.exported_at) : '—',
      version: res.file.app_version || '—',
    }),
    inFileLabel: countsLabel(res.file.counts),
    willDeleteLabel: countsLabel(current),
    skipped: d.invalid + d.duplicate + d.orphanBodies + d.overCap,
    unsafeBookmarks: d.unsafeBookmarks,
  }
}

function closePreview(): void {
  if (busy.value) return
  preview.value = null
  pendingData.value = null
}

/** Xác nhận lần 2 → bản an toàn + ghi một lần → tải lại trang (RAM cũ không được ghi đè dữ liệu mới — N5). */
async function onConfirmReplace(): Promise<void> {
  const data = pendingData.value
  if (!data || busy.value || props.signedIn) return
  busy.value = true
  try {
    await applyRestore(data, { now: new Date() })
    location.hash = '#/dashboard?restore=done'
    location.reload()
  } catch (e) {
    console.error(e)
    busy.value = false
    preview.value = null
    pendingData.value = null
    message.value = { kind: 'error', text: t('backup.error.restore') }
  }
}
</script>

<template>
  <SettingsAccordionSection :title="t('backup.title')" :default-open="true">
    <!-- Tự động — chỉ khi không đăng nhập (đăng nhập: dữ liệu đã ở cloud). -->
    <div v-if="!signedIn && state" class="backup__row">
      <div class="backup__row-text">
        <span id="bbqone-backup-auto-label" class="backup__row-title">{{ t('backup.auto') }}</span>
        <span class="backup__hint">{{ t('backup.autoDesc') }}</span>
      </div>
      <button
        type="button"
        class="backup__switch"
        :class="{ 'backup__switch--on': state.autoEnabled }"
        role="switch"
        :aria-checked="state.autoEnabled"
        aria-labelledby="bbqone-backup-auto-label"
        @click="toggleAuto"
      >
        <span class="backup__switch-knob" aria-hidden="true" />
      </button>
    </div>
    <p v-else-if="signedIn" class="backup__hint">{{ t('backup.signedInHint') }}</p>

    <p class="backup__last">{{ lastLabel }}</p>

    <div class="backup__actions">
      <RetroButton variant="sm" type="button" primary :disabled="busy" @click="onBackupNow">
        <AppIcon name="download" :size="15" />
        {{ t('backup.now') }}
      </RetroButton>
      <template v-if="!signedIn">
        <RetroButton variant="sm" type="button" :disabled="busy" @click="onRestoreClick">
          <AppIcon name="restore" :size="15" />
          {{ t('backup.restore') }}
        </RetroButton>
        <input
          ref="fileInputRef"
          class="backup__file"
          type="file"
          accept=".json,application/json"
          tabindex="-1"
          aria-hidden="true"
          @change="onFileChange"
        />
      </template>
    </div>

    <p v-if="!signedIn && focus === 'restore' && inTab" class="backup__hint backup__hint--focus">
      {{ t('backup.restoreHint') }}
    </p>
    <p
      v-if="message"
      class="backup__message"
      :class="`backup__message--${message.kind}`"
      :role="message.kind === 'error' ? 'alert' : 'status'"
    >
      <AppIcon :name="message.kind === 'ok' ? 'check' : 'alert'" :size="14" />
      {{ message.text }}
    </p>
    <p class="backup__warn">
      <AppIcon name="alert" :size="14" />
      {{ t('backup.warnPlain') }}
    </p>

    <BackupRestoreDialog
      :open="!!preview"
      :preview="preview"
      :busy="busy"
      @close="closePreview"
      @replace="confirmReplace = true"
    />
    <!-- Xác nhận LẦN 2 (đỏ). -->
    <RetroConfirm
      v-model:open="confirmReplace"
      variant="danger"
      :title="t('backup.confirm.title')"
      :message="t('backup.confirm.message')"
      :confirm-label="t('backup.confirm.ok')"
      @confirm="onConfirmReplace"
    />
  </SettingsAccordionSection>
</template>

<style scoped>
.backup__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.backup__row-text {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.backup__row-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
}

.backup__hint {
  margin: 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-muted);
}

.backup__hint--focus {
  margin-top: 8px;
  color: var(--accent);
  font-weight: 600;
}

/* Công tắc kiểu iOS / Termius. */
.backup__switch {
  position: relative;
  flex: 0 0 auto;
  width: 36px;
  height: 20px;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--text-primary) 22%, transparent);
  cursor: pointer;
  transition: background 0.15s ease;
}

.backup__switch--on {
  background: var(--accent);
}

.backup__switch:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.backup__switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease;
}

.backup__switch--on .backup__switch-knob {
  transform: translateX(16px);
}

.backup__last {
  margin: 10px 0 0;
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.backup__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.backup__file {
  display: none;
}

.backup__message {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  font-size: var(--font-size-sm);
}

.backup__message--ok {
  color: var(--accent);
}

.backup__message--error {
  color: var(--danger);
}

.backup__warn {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.35;
  color: var(--text-muted);
}

@media (prefers-reduced-motion: reduce) {
  .backup__switch,
  .backup__switch-knob {
    transition: none;
  }
}
</style>
