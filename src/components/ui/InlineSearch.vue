<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import RetroInput from '@/components/ui/RetroInput.vue'

/**
 * U5: ô tìm kiếm thu gọn thành nút 🔍, dùng chung cho Calendar / Notes / Bookmark — mỗi tab đặt nó
 * trong thanh công cụ của nội dung nó lọc. Store giữ query; component chỉ lo mở/đóng + debounce.
 * U11: `persistent` — luôn là ô nhập có icon 🔍 (đầu cột Thư mục: "tìm trong tất cả ghi chú").
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
  /** Luôn hiện ô nhập (không thu về 🔍); ✕ chỉ hiện khi có chữ. */
  persistent?: boolean
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
const openBtnRef = ref<HTMLButtonElement | null>(null)
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
  if (props.persistent) inputRef.value?.focus()
  else openBtnRef.value?.focus()
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  // Ô luôn hiện: Esc lần đầu xóa chữ, Esc khi đã trống thì rời ô.
  if (props.persistent && localQuery.value === '' && props.query === '') {
    ;(e.target as HTMLElement).blur()
    return
  }
  void closeSearch()
}

/** Rời khỏi component khi ô trống → thu gọn về 🔍. */
function onFocusOut(e: FocusEvent): void {
  if (props.persistent) return
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
    :class="{ 'inline-search--open': open || persistent, 'inline-search--persistent': persistent }"
    @focusout="onFocusOut"
  >
    <template v-if="open || persistent">
      <span class="inline-search__field">
        <svg
          v-if="persistent"
          class="inline-search__field-icon"
          viewBox="0 0 24 24"
          width="15"
          height="15"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.75" />
          <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M16 16l4.5 4.5" />
        </svg>
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
        <button
          v-if="!persistent || localQuery !== ''"
          type="button"
          class="ds-icon-action inline-search__clear"
          :aria-label="closeLabel"
          :title="closeLabel"
          @click="closeSearch"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            <path fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </span>
    </template>
    <template v-else>
      <slot name="collapsed" />
      <button
        ref="openBtnRef"
        type="button"
        class="ds-icon-action inline-search__open"
        :aria-label="openLabel"
        :title="openLabel"
        @click="openSearch"
      >
        <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.75" />
          <path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M16 16l4.5 4.5" />
        </svg>
      </button>
    </template>
  </div>
</template>

<style scoped>
.inline-search {
  display: flex;
  align-items: center;
  min-width: 0;
}

/* Ô nhập phẳng (ADN popover): nền xám nhạt, không viền; focus = vòng nhấn. */
.inline-search__field {
  position: relative;
  display: flex;
  align-items: center;
  gap: 2px;
  width: clamp(180px, 30vw, 260px);
  min-width: 0;
  padding-right: 3px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--text-primary) 6%, transparent);
  transition: box-shadow 0.12s linear, background 0.12s linear;
}

.inline-search__field:focus-within {
  background: var(--bg-panel);
  box-shadow: 0 0 0 2px var(--focus-ring);
}

.inline-search__input {
  flex: 1 1 auto;
  width: auto;
  min-width: 0;
  padding: 6px 12px;
  border-color: transparent;
  background: transparent;
  font-size: 12px;
}

.inline-search__input:focus,
.inline-search__input:focus-visible {
  outline: none;
  border-color: transparent;
}

/* Bỏ nút xóa mặc định của type="search" — đã có ✕ riêng. */
.inline-search__input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
}

.inline-search__clear {
  width: 24px;
  height: 24px;
}

.inline-search--persistent {
  width: 100%;
}

.inline-search--persistent .inline-search__field {
  width: 100%;
}

.inline-search--persistent .inline-search__input {
  padding-left: 30px;
}

.inline-search__field-icon {
  position: absolute;
  left: 11px;
  color: var(--text-muted);
  pointer-events: none;
}
</style>
