<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import IconButton from '@/components/ui/IconButton.vue'
import RetroButton from '@/components/ui/RetroButton.vue'
import RetroInput from '@/components/ui/RetroInput.vue'
import { useLangStore } from '@/stores/uiLang'
import AppIcon from '@/components/ui/AppIcon.vue'

const props = defineProps<{
  open: boolean
  heading: string
  fieldLabel: string
  placeholder: string
  busy?: boolean
  error?: string | null
  inputId: string
}>()

const name = defineModel<string>('name', { required: true })

const emit = defineEmits<{
  close: []
  save: []
}>()

const { t } = useLangStore()
const panelRef = ref<HTMLElement | null>(null)
const inputRef = ref<InstanceType<typeof RetroInput> | null>(null)

watch(
  () => props.open,
  async (open) => {
    if (!open) return
    await nextTick()
    panelRef.value?.focus()
    inputRef.value?.focus()
  },
)

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && !props.busy) {
    e.preventDefault()
    emit('close')
  }
}

function onSubmit(): void {
  if (props.busy) return
  emit('save')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="quick-create-fade">
      <div
        v-if="open"
        class="quick-create__backdrop bbqone-overlay"
        role="presentation"
        @mousedown.self.prevent
      >
        <div
          ref="panelRef"
          class="quick-create"
          role="dialog"
          aria-modal="true"
          tabindex="-1"
          @keydown="onKeydown"
          @click.stop
        >
          <header class="quick-create__header">
            <h2 class="quick-create__title">{{ heading }}</h2>
            <IconButton
              variant="default"
              :label="t('common.close')"
              :disabled="busy"
              @click="emit('close')"
            >
              <AppIcon name="close" :size="18" />
            </IconButton>
          </header>

          <p v-if="error" class="quick-create__error" role="alert">{{ error }}</p>

          <form class="quick-create__form" @submit.prevent="onSubmit">
            <label class="quick-create__field">
              <span class="quick-create__label">{{ fieldLabel }}</span>
              <RetroInput
                :id="inputId"
                ref="inputRef"
                :model-value="name"
                :placeholder="placeholder"
                :disabled="busy"
                @update:model-value="name = $event"
                @keydown.enter.prevent="onSubmit"
              />
            </label>
            <div class="quick-create__actions">
              <RetroButton variant="sm" type="submit" primary :disabled="busy">
                {{ t('calendar.modal.btn.save') }}
              </RetroButton>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.quick-create__backdrop {
  position: fixed;
  inset: 0;
  z-index: 8600;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--overlay-scrim);
  padding: 16px;
}

.quick-create {
  width: 100%;
  max-width: 400px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(
      ellipse 110% 80% at 50% 0%,
      color-mix(in srgb, var(--accent) 5%, transparent) 0%,
      transparent 58%
    ),
    var(--bg-secondary);
  box-shadow: 0 12px 48px var(--panel-ring);
  overflow: hidden;
  outline: none;
}

.quick-create__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 10px 10px 0;
  padding: 8px 10px;
  border: none;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.quick-create__title {
  margin: 0;
  font-size: var(--font-size-base);
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.35;
}

.quick-create__error {
  margin: 0;
  padding: 7px 9px;
  font-size: var(--font-size-sm);
  color: var(--danger);
  border: 1px solid color-mix(in srgb, var(--danger) 34%, var(--border));
  border-radius: var(--radius-md);
  background: var(--surface-danger-muted);
}

.quick-create__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 10px;
}

.quick-create__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-panel) 62%, transparent);
}

.quick-create__label {
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

.quick-create__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 4px;
  padding: 10px 0 0;
  border: none;
  border-top: 1px solid var(--border);
  border-radius: 0;
  background: transparent;
}

.quick-create-fade-enter-active,
.quick-create-fade-leave-active {
  transition: opacity 0.15s ease;
}

.quick-create-fade-enter-from,
.quick-create-fade-leave-to {
  opacity: 0;
}
</style>
