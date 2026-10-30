<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { FormEventAction, FormEventName, FormEvents } from '@/contracts/form-schema'
import { FORM_SCRIPT_FUNCTIONS } from '@/components/script-catalog'
import ScriptDialog from '@/components/ScriptDialog.vue'
import { validateFormEvents } from '../utils/form-events'
import { useI18n } from '@/locales'

const { t } = useI18n()
const events = defineModel<FormEvents>({ required: true })
const active = ref<FormEventName>('onLoad')
const editingId = ref('')
const editorVisible = ref(false)
const eventDefs: Array<{ name: FormEventName; label: string; hint: string }> = [
  { name: 'onLoad', label: t('formEvents.onLoad'), hint: t('formEvents.onLoadHint') },
  {
    name: 'beforeSubmitHandler',
    label: t('formEvents.beforeSubmit'),
    hint: t('formEvents.beforeSubmitHint'),
  },
  {
    name: 'afterSubmitHandler',
    label: t('formEvents.afterSubmit'),
    hint: t('formEvents.afterSubmitHint'),
  },
]
const activeHint = computed(() => eventDefs.find((item) => item.name === active.value)?.hint ?? '')
const actions = computed(() => events.value[active.value] ?? [])
const editing = computed(() => actions.value.find((item) => item.id === editingId.value))

function ensureActions(): FormEventAction[] {
  if (!events.value[active.value]) events.value[active.value] = []
  return events.value[active.value]!
}

function reindex(list: FormEventAction[]) {
  list.forEach((action, index) => (action.order = index))
}

function addAction() {
  const list = ensureActions()
  const id = `${active.value}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
  list.push({
    id,
    name: t('formEvents.actionDefaultName', { count: list.length + 1 }),
    enabled: true,
    order: list.length,
    script: '',
  })
  openEditor(id)
}

function openEditor(id: string) {
  editingId.value = id
  editorVisible.value = true
}

function saveScript(code: string) {
  const action = actions.value.find((item) => item.id === editingId.value)
  if (action) action.script = code
}

function move(index: number, offset: number) {
  const list = ensureActions()
  const target = index + offset
  if (target < 0 || target >= list.length) return
  const [item] = list.splice(index, 1)
  list.splice(target, 0, item)
  reindex(list)
}

async function remove(index: number) {
  try {
    await ElMessageBox.confirm(t('formEvents.removeConfirm'), t('formEvents.removeTitle'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
    })
    ensureActions().splice(index, 1)
    reindex(ensureActions())
  } catch {
    // 取消保留动作。
  }
}

function validateAll() {
  return validateFormEvents(events.value)
}

defineExpose({ validateAll })
</script>

<template>
  <section class="events-panel" data-testid="form-events-panel">
    <header class="events-panel__head">
      <div>
        <h2>{{ t('formEvents.title') }}</h2>
        <p>{{ t('formEvents.subtitle') }}</p>
      </div>
      <el-button type="primary" @click="addAction">{{ t('formEvents.addAction') }}</el-button>
    </header>
    <el-alert :title="activeHint" type="info" :closable="false" show-icon />
    <el-tabs v-model="active" class="events-panel__tabs">
      <el-tab-pane
        v-for="item in eventDefs"
        :key="item.name"
        :name="item.name"
        :label="item.label"
      />
    </el-tabs>
    <div v-if="actions.length" class="events-panel__list">
      <article v-for="(action, index) in actions" :key="action.id" class="events-panel__row">
        <span class="events-panel__order">{{ index + 1 }}</span>
        <el-input
          v-model="action.name"
          class="events-panel__name"
          :aria-label="t('formEvents.actionName')"
        />
        <el-input
          v-model="action.confirmMessage"
          class="events-panel__confirm"
          :placeholder="t('formEvents.confirmPlaceholder')"
          :aria-label="t('formEvents.confirmPlaceholder')"
        />
        <el-switch v-model="action.enabled" :active-text="t('formEvents.enabled')" />
        <span class="events-panel__id">{{ action.id }}</span>
        <el-button link type="primary" @click="openEditor(action.id)">{{
          t('formEvents.editScript')
        }}</el-button>
        <el-button link :disabled="index === 0" @click="move(index, -1)">{{
          t('formEvents.moveUp')
        }}</el-button>
        <el-button link :disabled="index === actions.length - 1" @click="move(index, 1)">{{
          t('formEvents.moveDown')
        }}</el-button>
        <el-button link type="danger" @click="remove(index)">{{ t('common.delete') }}</el-button>
      </article>
    </div>
    <el-empty v-else :description="t('formEvents.empty')" />
    <p class="events-panel__budget">{{ t('formEvents.budget') }}</p>
    <ScriptDialog
      v-model:visible="editorVisible"
      :title="t('formEvents.scriptTitle')"
      :functions="FORM_SCRIPT_FUNCTIONS"
      :code="editing?.script ?? ''"
      @save="saveScript"
    />
  </section>
</template>

<style scoped>
.events-panel {
  padding: 24px;
  background: var(--el-bg-color);
  min-height: 100%;
}
.events-panel__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 18px;
}
.events-panel__head h2 {
  margin: 0 0 8px;
  font-size: 18px;
}
.events-panel__head p,
.events-panel__budget {
  margin: 0;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}
.events-panel__tabs {
  margin-top: 18px;
}
.events-panel__list {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  overflow: hidden;
}
.events-panel__row {
  display: grid;
  grid-template-columns:
    32px minmax(150px, 1fr) minmax(150px, 1fr) 92px minmax(140px, 0.7fr) auto auto
    auto auto;
  gap: 12px;
  align-items: center;
  min-height: 56px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.events-panel__row:last-child {
  border-bottom: 0;
}
.events-panel__order {
  color: var(--el-text-color-secondary);
  text-align: center;
}
.events-panel__id {
  color: var(--el-text-color-placeholder);
  font-family: monospace;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.events-panel__confirm {
  min-width: 150px;
}
.events-panel__budget {
  margin-top: 16px;
  font-size: 13px;
}
@media (max-width: 900px) {
  .events-panel__row {
    grid-template-columns: 24px 1fr 90px;
  }
  .events-panel__id,
  .events-panel__row > .el-button {
    grid-column: auto;
  }
}
</style>
