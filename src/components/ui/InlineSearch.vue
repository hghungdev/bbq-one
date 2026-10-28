<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'

/**
 * U5: ô tìm kiếm thu gọn thành nút 🔍, dùng chung cho Calendar / Notes / Bookmark — mỗi tab đặt nó
 * trong thanh công cụ của nội dung nó lọc. Store giữ query; component chỉ lo mở/đóng + debounce.
 */
const props = defineProps<{
  /** Query hiện tại của store (đã trim hay chưa đều được). */
  query: string
  /** Tăng lên → mở + focus (Ctrl+F). */
  focusRequest: number
  placeholder: string
  /** aria-label của ô nhập. */
  inputLabel: string
  openLabel: string
  closeLabel: string
  inputId: string
  /** Bản nhỏ để nằm gọn trong đầu cột (Notes). */
  compact?: boolean
}>()

const emit = defineEmits<{
  search: [query: string]
  clear: []
}>()

/** Còn query (vd quay lại tab) → mở sẵn để user thấy bộ lọc đang bật. */
const open = ref(props.query.trim().length > 0)
const localQuery = ref(props.query)
const rootRef = ref<HTMLElement | null>(null)
const inputRef = ref<InstanceType<typeof RetroInput> | null>(null)
const openBtnRef = ref<HTMLElement | null>(null)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function cancelDebounce(): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

watch(localQuery, (v) => {
  cancelDebounce()
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    if (v.trim() === props.query.trim()) return
    emit('search', v)
  }, 300)
})

// Store lưu query đã trim — chỉ ghi đè ô nhập khi khác SAU trim, không thì gõ chậm mất dấu cách cuối.
watch(
  () => props.query,
  (q) => {
    if (q.trim() !== localQuery.value.trim()) localQuery.value = q
    if (q.trim()) open.value = true
  },
)

watch(
  () => props.focusRequest,
  () => {
    void openSearch()
  },
)

async function openSearch(): Promise<void> {
  open.value = true
  await nextTick()
  inputRef.value?.focus()
}

function collapse(emitClear: boolean): void {
  cancelDebounce()
  localQuery.value = ''
  open.value = false
  if (emitClear) emit('clear')
}

/** ✕ / Esc: xóa + thu gọn, trả focus về nút 🔍 (bàn phím không bị "rơi" ra body). */
async function closeSearch(): Promise<void> {
  collapse(true)
  await nextTick()
  openBtnRef.value?.querySelector('button')?.focus()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  void closeSearch()
}

/** Rời khỏi component khi ô trống → thu gọn về 🔍. */
function onFocusOut(e: FocusEvent): void {
  const next = e.relatedTarget as Node | null
  if (next && rootRef.value?.contains(next)) return
  // Bấm 🔍: nút đang focus bị gỡ khỏi DOM cũng phát focusout (relatedTarget null) — đợi DOM cập nhật
  // rồi xem focus thật sự ở đâu (openSearch đã focus ô nhập) mới quyết định.
  void nextTick(() => {
    if (!open.value || rootRef.value?.contains(document.activeElement)) return
    // Xóa hết chữ rồi rời ô trong lúc debounce → store còn query cũ, phải xóa theo.
    if (localQuery.value.trim() === '') collapse(props.query.trim() !== '')
  })
}

onBeforeUnmount(cancelDebounce)
</script>

<template>
  <div
    ref="rootRef"
    class="inline-search"
    :class="{ 'inline-search--open': open, 'inline-search--compact': compact }"
    @focusout="onFocusOut"
  >
    <template v-if="open">
      <RetroInput
        :id="inputId"
        ref="inputRef"
        v-model="localQuery"
        class="inline-search__input"
        type="search"
        :placeholder="placeholder"
        :aria-label="inputLabel"
        autocomplete="off"
        @keydown="onKeydown"
      />
      <slot name="suffix" />
      <IconButton variant="default" :label="closeLabel" :title="closeLabel" @click="closeSearch">
        <svg viewBox="0 0 24 24" :width="compact ? 14 : 16" :height="compact ? 14 : 16" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            d="M6 6l12 12M18 6L6 18"
          />
        </svg>
      </IconButton>
    </template>
    <template v-else>
      <slot name="collapsed" />
      <span ref="openBtnRef" class="inline-search__open">
        <IconButton variant="default" :label="openLabel" :title="openLabel" @click="openSearch">
          <svg viewBox="0 0 24 24" :width="compact ? 15 : 17" :height="compact ? 15 : 17" aria-hidden="true">
            <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.75" />
            <path
              fill="none"
              stroke="currentColor"
              stroke-width="1.75"
              stroke-linecap="round"
              d="M16 16l4.5 4.5"
            />
          </svg>
        </IconButton>
      </span>
    </template>
  </div>
</template>

<style scoped>
.inline-search {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.inline-search__open {
  display: inline-flex;
  margin-left: auto;
}

.inline-search__input {
  width: clamp(160px, 30vw, 260px);
  padding-top: 7px;
  padding-bottom: 7px;
}

/* Bỏ nút xóa mặc định của type="search" — đã có ✕ riêng. */
.inline-search__input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
}

/* Compact: nằm trong pill đầu cột — giữ đúng chiều cao pill "Folders" bên cạnh. */
.inline-search--compact {
  flex: 1 1 auto;
  gap: 4px;
}

.inline-search--compact .inline-search__input {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  padding: 3px 0;
  border-color: transparent;
  background: transparent;
  font-size: var(--font-size-sm);
}

/* Ô nhập không viền riêng (tránh "pill trong pill") — vòng focus vẽ lên pill chứa nó (:focus-within
   ở component cha). */
.inline-search--compact .inline-search__input:focus,
.inline-search--compact .inline-search__input:focus-visible {
  outline: none;
  border-color: transparent;
}

.inline-search--compact :deep(.icon-btn) {
  width: 24px;
  height: 24px;
  border-color: transparent;
  background: transparent;
}

.inline-search--compact :deep(.icon-btn:hover:not(:disabled)) {
  border-color: var(--border);
}
</style>
