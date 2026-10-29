<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'

const props = defineProps<{
  settingsTitle: string
  renameTitle: string
  deleteTitle: string
  /** Khi có — hiện nút chuyển folder giữa rename và delete. */
  moveTitle?: string
}>()

const emit = defineEmits<{
  rename: []
  move: []
  delete: []
}>()

const open = ref(false)
const triggerRef = ref<HTMLButtonElement | null>(null)
const menuRef = ref<HTMLDivElement | null>(null)
const menuX = ref(0)
const menuY = ref(0)

let removeOutside: (() => void) | null = null

function placeMenu(): void {
  const el = triggerRef.value
  if (!el) return
  const r = el.getBoundingClientRect()
  const menuW = props.moveTitle ? 104 : 76
  const menuH = 34
  const gap = 4
  const pad = 8

  menuX.value = Math.min(
    Math.max(pad, r.right - menuW),
    window.innerWidth - menuW - pad,
  )

  const spaceBelow = window.innerHeight - r.bottom - pad
  const openUp = spaceBelow < menuH + gap && r.top > menuH + gap + pad
  menuY.value = openUp ? r.top - menuH - gap : r.bottom + gap
}

function clearOutside(): void {
  removeOutside?.()
  removeOutside = null
}

function close(): void {
  open.value = false
  clearOutside()
}

function toggle(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()
  if (open.value) {
    close()
    return
  }
  placeMenu()
  open.value = true
  void nextTick(() => {
    const menu = menuRef.value
    const trigger = triggerRef.value
    if (menu && trigger) {
      const r = trigger.getBoundingClientRect()
      const m = menu.getBoundingClientRect()
      const gap = 4
      const pad = 8
      menuX.value = Math.min(
        Math.max(pad, r.right - m.width),
        window.innerWidth - m.width - pad,
      )
      const spaceBelow = window.innerHeight - r.bottom - pad
      const openUp = spaceBelow < m.height + gap && r.top > m.height + gap + pad
      menuY.value = openUp ? r.top - m.height - gap : r.bottom + gap
    }
    clearOutside()
    const onDoc = (ev: MouseEvent): void => {
      const t = ev.target as Node | null
      if (menuRef.value?.contains(t) || triggerRef.value?.contains(t)) return
      close()
    }
    // U29: Esc đóng menu (không đóng cả extension) và trả focus về nút ⚙.
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return
      ev.preventDefault()
      close()
      triggerRef.value?.focus()
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    removeOutside = () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  })
}

function onRename(e: MouseEvent): void {
  e.stopPropagation()
  close()
  emit('rename')
}

function onMove(e: MouseEvent): void {
  e.stopPropagation()
  close()
  emit('move')
}

function onDelete(e: MouseEvent): void {
  e.stopPropagation()
  close()
  emit('delete')
}

onBeforeUnmount(clearOutside)
</script>

<template>
  <div class="list-settings">
    <button
      ref="triggerRef"
      type="button"
      class="ds-icon-action list-settings__trigger"
      :title="settingsTitle"
      :aria-label="settingsTitle"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <AppIcon name="settings" :size="15" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuRef"
        class="list-settings__menu bbqone-overlay"
        :style="{ left: `${menuX}px`, top: `${menuY}px` }"
        role="menu"
        @click.stop
      >
        <button
          type="button"
          class="ds-icon-action list-settings__action"
          role="menuitem"
          :title="renameTitle"
          :aria-label="renameTitle"
          @click="onRename"
        >
          <AppIcon name="pencil" :size="15" />
        </button>
        <button
          v-if="moveTitle"
          type="button"
          class="ds-icon-action list-settings__action"
          role="menuitem"
          :title="moveTitle"
          :aria-label="moveTitle"
          @click="onMove"
        >
          <AppIcon name="move" :size="15" />
        </button>
        <button
          type="button"
          class="ds-icon-action ds-icon-action--danger list-settings__action"
          role="menuitem"
          :title="deleteTitle"
          :aria-label="deleteTitle"
          @click="onDelete"
        >
          <AppIcon name="trash" :size="15" />
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.list-settings {
  flex: 0 0 auto;
  display: inline-flex;
}

/* U15: nút icon chung (ds-icon-action) — chỉ giữ cỡ 26 px cho vừa dòng. Xóa: xám, đỏ khi rê. */
.list-settings__trigger,
.list-settings__action {
  width: 26px;
  height: 26px;
}

.list-settings__menu {
  position: fixed;
  z-index: 10002;
  display: flex;
  align-items: center;
  gap: 2px;
  margin: 0;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-panel);
  box-shadow: 0 4px 12px var(--panel-ring);
}
</style>
