<script setup lang="ts">
  /**
   * U22: tài khoản ở góc phải header (kiểu Gmail). Chưa đăng nhập → "👤 Đăng nhập"; đã đăng nhập →
   * avatar chữ cái email, bấm mở menu (email + Đăng xuất). Logic đăng nhập / xuất nằm ở App.vue.
   */
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
  import AppIcon from '@/components/ui/AppIcon.vue'
  import { useLangStore } from '@/stores/uiLang'
  import { avatarInitial } from '@/utils/accountAvatar'

  const props = defineProps<{
    signedIn: boolean
    email: string | null
  }>()

  const emit = defineEmits<{
    'sign-in': []
    'sign-out': []
  }>()

  const { t } = useLangStore()

  const open = ref(false)
  const rootRef = ref<HTMLElement | null>(null)
  const triggerRef = ref<HTMLButtonElement | null>(null)
  const signOutRef = ref<HTMLButtonElement | null>(null)

  const initial = computed(() => avatarInitial(props.email))
  const accountLabel = computed(() => t('app.account.aria', { email: props.email ?? '' }).trim())

  async function openMenu(): Promise<void> {
    open.value = true
    await nextTick()
    signOutRef.value?.focus()
  }

  function closeMenu(returnFocus: boolean): void {
    if (!open.value) return
    open.value = false
    if (returnFocus) void nextTick(() => triggerRef.value?.focus())
  }

  function toggle(): void {
    if (open.value) closeMenu(false)
    else void openMenu()
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key !== 'Escape' || !open.value) return
    e.preventDefault()
    e.stopPropagation()
    closeMenu(true)
  }

  /** Bấm ra ngoài → đóng (không kéo focus về avatar — user đang bấm chỗ khác). */
  function onDocPointerDown(e: PointerEvent): void {
    if (rootRef.value && !rootRef.value.contains(e.target as Node)) closeMenu(false)
  }

  /** Tab ra khỏi menu → đóng, để menu không treo lơ lửng khi dùng bàn phím. */
  function onFocusOut(e: FocusEvent): void {
    const next = e.relatedTarget as Node | null
    if (next && rootRef.value && !rootRef.value.contains(next)) closeMenu(false)
  }

  function onSignOut(): void {
    closeMenu(false)
    emit('sign-out')
  }

  watch(open, (isOpen) => {
    if (isOpen) document.addEventListener('pointerdown', onDocPointerDown, true)
    else document.removeEventListener('pointerdown', onDocPointerDown, true)
  })

  // Đăng xuất / hết phiên khi menu đang mở → bỏ trạng thái mở.
  watch(
    () => props.signedIn,
    (v) => {
      if (!v) open.value = false
    },
  )

  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true)
  })
</script>

<template>
  <div ref="rootRef" class="account" @keydown="onKeydown" @focusout="onFocusOut">
    <button
      v-if="!signedIn"
      type="button"
      class="account__sign-in"
      :title="t('app.aria.loginTitle')"
      @click="emit('sign-in')"
    >
      <AppIcon name="user" :size="16" />
      <span>{{ t('app.aria.login') }}</span>
    </button>
    <template v-else>
      <button
        ref="triggerRef"
        type="button"
        class="account__avatar"
        :aria-label="accountLabel"
        :title="accountLabel"
        aria-haspopup="menu"
        :aria-expanded="open"
        @click="toggle"
      >
        <span v-if="initial" aria-hidden="true">{{ initial }}</span>
        <AppIcon v-else name="user" :size="16" />
      </button>
      <div v-if="open" class="account__menu" role="menu" :aria-label="accountLabel">
        <div class="account__who">
          <span class="account__avatar account__avatar--lg" aria-hidden="true">
            <span v-if="initial">{{ initial }}</span>
            <AppIcon v-else name="user" :size="20" />
          </span>
          <div class="account__who-text">
            <span v-if="email" class="account__email" :title="email">{{ email }}</span>
            <span class="account__status">{{ t('app.account.signedIn') }}</span>
          </div>
        </div>
        <button ref="signOutRef" type="button" class="account__item" role="menuitem" @click="onSignOut">
          <AppIcon name="log-out" :size="16" />
          <span>{{ t('app.aria.logout') }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
  .account {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    margin-left: 4px;
  }

  /* Mời đăng nhập, không ép: nền nhấn nhạt (BBQOne dùng được không cần tài khoản). */
  .account__sign-in {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 32px;
    padding: 0 12px 0 10px;
    border: none;
    border-radius: var(--radius-pill);
    background: var(--surface-accent-muted);
    color: var(--accent);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: background 0.12s linear;
  }

  .account__sign-in:hover {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .account__avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
  }

  button.account__avatar:hover,
  button.account__avatar[aria-expanded='true'] {
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
  }

  .account__sign-in:focus-visible,
  .account__avatar:focus-visible,
  .account__item:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: 2px;
  }

  .account__avatar--lg {
    width: 40px;
    height: 40px;
    font-size: 17px;
    cursor: default;
  }

  .account__menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 10002;
    width: 260px;
    padding: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--bg-panel);
    box-shadow: 0 12px 32px var(--panel-ring);
  }

  .account__who {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 6px 10px;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--border);
  }

  .account__who-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .account__email {
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--font-size-sm);
    font-weight: 600;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .account__status {
    color: var(--text-muted);
    font-size: 11px;
  }

  .account__item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 36px;
    padding: 0 10px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: var(--font-size-sm);
    text-align: left;
    cursor: pointer;
  }

  .account__item:hover {
    background: color-mix(in srgb, var(--text-primary) 6%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .account__sign-in {
      transition: none;
    }
  }
</style>
