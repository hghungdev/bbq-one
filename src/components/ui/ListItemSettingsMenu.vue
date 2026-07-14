<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from 'vue'

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
    document.addEventListener('mousedown', onDoc)
    removeOutside = () => document.removeEventListener('mousedown', onDoc)
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
      class="list-settings__trigger"
      :title="settingsTitle"
      :aria-label="settingsTitle"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle"
    >
      <svg
        class="list-settings__svg"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        focusable="false"
      >
        <path
          class="list-settings__stroke"
          d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        />
        <path
          class="list-settings__stroke"
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        />
      </svg>
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
          class="list-settings__action"
          role="menuitem"
          :title="renameTitle"
          :aria-label="renameTitle"
          @click="onRename"
        >
          <svg
            class="list-settings__svg"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <path class="list-settings__stroke" d="M12 20h9" />
            <path
              class="list-settings__stroke"
              d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"
            />
          </svg>
        </button>
        <button
          v-if="moveTitle"
          type="button"
          class="list-settings__action"
          role="menuitem"
          :title="moveTitle"
          :aria-label="moveTitle"
          @click="onMove"
        >
          <svg
            class="list-settings__svg"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <path
              class="list-settings__stroke"
              d="M3 7h11M3 12h18M3 17h11"
            />
            <path
              class="list-settings__stroke"
              d="M17 4l4 3-4 3M17 14l4 3-4 3"
            />
          </svg>
        </button>
        <button
          type="button"
          class="list-settings__action list-settings__action--danger"
          role="menuitem"
          :title="deleteTitle"
          :aria-label="deleteTitle"
          @click="onDelete"
        >
          <svg
            class="list-settings__svg"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            focusable="false"
          >
            <polyline class="list-settings__stroke" points="3 6 5 6 21 6" />
            <path
              class="list-settings__stroke"
              d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14zM8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            />
            <line class="list-settings__stroke" x1="10" y1="11" x2="10" y2="17" />
            <line class="list-settings__stroke" x1="14" y1="11" x2="14" y2="17" />
          </svg>
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

.list-settings__trigger,
.list-settings__action {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  margin: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.list-settings__trigger:hover,
.list-settings__action:hover {
  border-color: var(--accent-soft-border);
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, var(--bg-secondary));
}

.list-settings__trigger:focus-visible,
.list-settings__action:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.list-settings__action--danger {
  color: var(--danger);
}

.list-settings__action--danger:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, var(--bg-secondary));
}

.list-settings__svg {
  width: 15px;
  height: 15px;
  display: block;
}

.list-settings__stroke {
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
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
