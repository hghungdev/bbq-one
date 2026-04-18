<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useSecureFolderStore } from '@/stores/secureFolder'

const props = defineProps<{
  open: boolean
  mode: 'enable' | 'unlock' | 'change'
  folderId: string
}>()

const emit = defineEmits<{
  close: []
  done: []
}>()

const secure = useSecureFolderStore()
const busy = ref(false)
const error = ref('')
const password = ref('')
const confirmPassword = ref('')
const oldPassword = ref('')
const panelRef = ref<HTMLElement | null>(null)
const firstInputRef = ref<InstanceType<typeof RetroInput> | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (open) {
      error.value = ''
      password.value = ''
      confirmPassword.value = ''
      oldPassword.value = ''
      await nextTick()
      panelRef.value?.focus()
      firstInputRef.value?.focus()
    }
  },
)

async function submit(): Promise<void> {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try {
    if (props.mode === 'enable') {
      await secure.enableSecureFolder(
        props.folderId,
        password.value,
        confirmPassword.value,
      )
    } else if (props.mode === 'unlock') {
      await secure.unlockFolder(props.folderId, password.value)
    } else {
      await secure.changePassphrase(
        props.folderId,
        oldPassword.value,
        password.value,
        confirmPassword.value,
      )
    }
    emit('done')
    emit('close')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Operation failed'
  } finally {
    busy.value = false
  }
}

function onPanelKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

const titleText = (): string => {
  if (props.mode === 'enable') return 'SECURE FOLDER'
  if (props.mode === 'unlock') return 'UNLOCK FOLDER'
  return 'CHANGE PASSPHRASE'
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="secure-modal__backdrop bbqone-overlay"
      role="presentation"
      @click.self="emit('close')"
    >
      <div
        ref="panelRef"
        class="secure-modal"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        @keydown="onPanelKeydown"
      >
        <p class="secure-modal__title">
          {{ titleText() }}
        </p>
        <p v-if="error" class="secure-modal__err" role="alert">
          {{ error }}
        </p>

        <template v-if="mode === 'change'">
          <label class="secure-modal__label" for="secure-old">CURRENT</label>
          <RetroInput
            id="secure-old"
            ref="firstInputRef"
            v-model="oldPassword"
            type="password"
            placeholder="••••••••"
            autocomplete="off"
            :disabled="busy"
          />
        </template>

        <label class="secure-modal__label" for="secure-pw">{{
          mode === 'unlock' ? 'PASSPHRASE' : mode === 'change' ? 'NEW' : 'PASSPHRASE'
        }}</label>
        <RetroInput
          v-if="mode !== 'change'"
          id="secure-pw"
          ref="firstInputRef"
          v-model="password"
          type="password"
          placeholder="••••••••"
          autocomplete="off"
          :disabled="busy"
          @keydown.enter.prevent="submit"
        />
        <RetroInput
          v-else
          id="secure-pw"
          v-model="password"
          type="password"
          placeholder="••••••••"
          autocomplete="off"
          :disabled="busy"
        />

        <template v-if="mode === 'enable' || mode === 'change'">
          <label class="secure-modal__label" for="secure-confirm">CONFIRM</label>
          <RetroInput
            id="secure-confirm"
            v-model="confirmPassword"
            type="password"
            placeholder="••••••••"
            autocomplete="off"
            :disabled="busy"
            @keydown.enter.prevent="submit"
          />
        </template>

        <div class="secure-modal__actions">
          <RetroButton
            variant="sm"
            type="button"
            :disabled="busy"
            @click="submit"
          >
            [ OK ]
          </RetroButton>
          <RetroButton
            variant="sm"
            type="button"
            :disabled="busy"
            @click="emit('close')"
          >
            [ X ]
          </RetroButton>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.secure-modal__backdrop {
  position: fixed;
  inset: 0;
  z-index: 10001;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(13, 13, 6, 0.88);
  padding: 16px;
}

.secure-modal {
  width: 100%;
  max-width: 360px;
  border: 1px solid var(--border);
  background: var(--bg-secondary);
  padding: 16px 14px 14px;
  outline: none;
}

.secure-modal__title {
  margin: 0 0 12px;
  font-size: var(--font-size-sm);
  color: var(--accent);
  letter-spacing: 0.08em;
}

.secure-modal__err {
  margin: 0 0 10px;
  font-size: var(--font-size-sm);
  color: var(--danger);
}

.secure-modal__label {
  display: block;
  margin: 8px 0 4px;
  font-size: var(--font-size-sm);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}

.secure-modal__actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 14px;
}
</style>
