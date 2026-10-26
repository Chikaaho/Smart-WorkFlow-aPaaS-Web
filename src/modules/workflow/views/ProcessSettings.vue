<script setup lang="ts">
/* global AbortSignal */
/**
 * 流程设置（50:88）：结束通知对象/渠道/其他接收人，保存进 ProcessGraph.notification，
 * 随流程定义发布冻结；旧定义缺省保持原通知行为。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { useI18n } from '@/locales'
import UserRemoteSelect from '@/components/UserRemoteSelect.vue'
import ScriptDialog from '@/components/ScriptDialog.vue'
import { PROCESS_SCRIPT_FUNCTIONS } from '@/components/script-catalog'
import {
  getProcessDefDefinition,
  previewProcessScript,
  saveProcessDefGraph,
  type ProcessGraphPayload,
} from '@/modules/workflow/api'
import type { TriggerConfig } from '@/contracts/p64'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const defId = computed(() => String(route.params.defId ?? ''))
const activeTab = ref<'notify' | 'listeners'>('notify')
const loading = ref(false)
const saving = ref(false)
const graph = ref<ProcessGraphPayload | null>(null)
const legacy = ref(true)
const form = reactive({
  initiator: true,
  approvers: false,
  channels: ['IN_APP'] as string[],
  otherRecipientIds: [] as string[],
})

function isProcessEvent(event: string): boolean {
  return event === 'PROCESS_START' || event === 'PROCESS_COMPLETED'
}

const processListeners = computed(() =>
  (graph.value?.triggers ?? []).filter((trigger) => isProcessEvent(trigger.event)),
)

const nodeListenerCount = computed(
  () => (graph.value?.triggers ?? []).length - processListeners.value.length,
)

function eventLabel(event: string): string {
  return event === 'PROCESS_COMPLETED'
    ? t('workflow.processSettingsEventEnd')
    : t('workflow.processSettingsEventStart')
}

interface ListenerDraft {
  triggerId: string
  name: string
  event: 'PROCESS_START' | 'PROCESS_COMPLETED'
  enabled: boolean
  script: string
}

const listenerDialogVisible = ref(false)
const listenerScriptVisible = ref(false)
const listenerEditId = ref<string | null>(null)
const listenerDraft = reactive<ListenerDraft>({
  triggerId: '',
  name: '',
  event: 'PROCESS_START',
  enabled: true,
  script: 'return null;',
})

function newListenerId(): string {
  const base = `trg_${Date.now().toString(36)}`
  const existing = new Set((graph.value?.triggers ?? []).map((trigger) => trigger.triggerId))
  let id = base
  let seq = 1
  while (existing.has(id)) {
    id = `${base}_${seq++}`
  }
  return id
}

function openListenerEditor(trigger?: TriggerConfig): void {
  if (trigger) {
    listenerEditId.value = trigger.triggerId
    listenerDraft.triggerId = trigger.triggerId
    listenerDraft.name = trigger.name || trigger.triggerId
    listenerDraft.event =
      trigger.event === 'PROCESS_COMPLETED' ? 'PROCESS_COMPLETED' : 'PROCESS_START'
    listenerDraft.enabled = trigger.enabled !== false
    listenerDraft.script = trigger.script || 'return null;'
  } else {
    listenerEditId.value = null
    listenerDraft.triggerId = newListenerId()
    listenerDraft.name = ''
    listenerDraft.event = 'PROCESS_START'
    listenerDraft.enabled = true
    listenerDraft.script = 'return null;'
  }
  listenerDialogVisible.value = true
}

function saveListenerDraft(): void {
  if (!graph.value) return
  if (!listenerDraft.name.trim()) {
    ElMessage.warning(t('workflow.processSettingsListenerNameRequired'))
    return
  }
  const triggers = [...(graph.value.triggers ?? [])]
  const index = listenerEditId.value
    ? triggers.findIndex((trigger) => trigger.triggerId === listenerEditId.value)
    : -1
  if (index >= 0) {
    triggers[index] = {
      ...triggers[index],
      name: listenerDraft.name.trim(),
      enabled: listenerDraft.enabled,
      event: listenerDraft.event,
      script: listenerDraft.script,
    }
  } else {
    triggers.push({
      triggerId: listenerDraft.triggerId,
      name: listenerDraft.name.trim(),
      enabled: listenerDraft.enabled,
      event: listenerDraft.event,
      script: listenerDraft.script,
      variables: [],
      branches: [],
      unmatchedDisposition: 'IGNORE',
      errorDisposition: 'IGNORE',
    })
  }
  graph.value = { ...graph.value, triggers }
  listenerDialogVisible.value = false
  ElMessage.success(t('workflow.processSettingsListenerDraftSaved'))
}

function removeListener(trigger: TriggerConfig): void {
  if (!graph.value) return
  graph.value = {
    ...graph.value,
    triggers: (graph.value.triggers ?? []).filter((item) => item.triggerId !== trigger.triggerId),
  }
  ElMessage.success(t('workflow.processSettingsListenerDeleted'))
}

function setListenerEnabled(trigger: TriggerConfig, value: boolean): void {
  if (!graph.value) return
  graph.value = {
    ...graph.value,
    triggers: (graph.value.triggers ?? []).map((item) =>
      item.triggerId === trigger.triggerId ? { ...item, enabled: value } : item,
    ),
  }
}

function moveListener(trigger: TriggerConfig, offset: number): void {
  if (!graph.value) return
  const triggers = [...(graph.value.triggers ?? [])]
  const index = triggers.findIndex((item) => item.triggerId === trigger.triggerId)
  if (index < 0) return
  let swap = -1
  for (let i = index + offset; i >= 0 && i < triggers.length; i += offset) {
    if (isProcessEvent(triggers[i].event)) {
      swap = i
      break
    }
  }
  if (swap < 0) return
  ;[triggers[index], triggers[swap]] = [triggers[swap], triggers[index]]
  graph.value = { ...graph.value, triggers }
}

async function simulateListener(
  code: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean; value?: unknown; log: string[]; error?: string }> {
  try {
    const result = await previewProcessScript(code, [], signal)
    return {
      ok: !result.errorMessage,
      value: result.value,
      log: [`${result.typeName ?? 'unknown'} · ${result.durationMs ?? 0}ms`],
      error: result.errorMessage ?? undefined,
    }
  } catch (error) {
    return { ok: false, log: [], error: errorText(error, t('common.unknownError')) }
  }
}

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const payload = await getProcessDefDefinition(defId.value)
    graph.value = payload
    const notification = payload.notification
    legacy.value = !notification
    if (notification) {
      form.initiator = notification.initiator === true
      form.approvers = notification.approvers === true
      form.channels =
        notification.channels && notification.channels.length > 0
          ? [...notification.channels]
          : ['IN_APP']
      form.otherRecipientIds = (notification.otherRecipientIds ?? []).map(String)
    }
  } catch (error) {
    ElMessage.error(errorText(error, t('workflow.processSettingsLoadFailed')))
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!graph.value) return
  if (!form.initiator && !form.approvers && form.otherRecipientIds.length === 0) {
    ElMessage.warning(t('workflow.processSettingsNoTarget'))
    return
  }
  if (form.channels.length === 0) {
    ElMessage.warning(t('workflow.processSettingsNoChannel'))
    return
  }
  const otherRecipientIds = form.otherRecipientIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)
  saving.value = true
  try {
    const payload: ProcessGraphPayload = {
      ...graph.value,
      notification: {
        initiator: form.initiator,
        approvers: form.approvers,
        channels: [...form.channels],
        otherRecipientIds,
      },
    }
    await saveProcessDefGraph(defId.value, payload)
    graph.value = payload
    legacy.value = false
    ElMessage.success(t('workflow.processSettingsSaved'))
  } catch (error) {
    ElMessage.error(errorText(error, t('workflow.processSettingsSaveFailed')))
  } finally {
    saving.value = false
  }
}

function backToDesigner(): void {
  void router.push(`/workflow/defs/${defId.value}/design`)
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="ps-page">
    <header class="ps-header">
      <button type="button" class="ps-back" @click="backToDesigner">
        <el-icon :size="16"><ArrowLeft /></el-icon>
        <span>{{ t('common.back') }}</span>
      </button>
      <h1>{{ t('workflow.processSettings') }}</h1>
      <el-button type="primary" :loading="saving" @click="save">
        {{ t('common.save') }}
      </el-button>
    </header>

    <div class="ps-body">
      <aside class="ps-nav">
        <button
          type="button"
          class="ps-nav__item"
          :class="{ 'is-active': activeTab === 'notify' }"
          @click="activeTab = 'notify'"
        >
          {{ t('workflow.processSettingsNotify') }}
        </button>
        <button
          type="button"
          class="ps-nav__item"
          :class="{ 'is-active': activeTab === 'listeners' }"
          @click="activeTab = 'listeners'"
        >
          {{ t('workflow.processSettingsListeners') }}
        </button>
      </aside>

      <section v-if="activeTab === 'notify'" class="ps-card">
        <h2>{{ t('workflow.processSettingsNotify') }}</h2>
        <p v-if="legacy" class="ps-hint">{{ t('workflow.processSettingsLegacyHint') }}</p>

        <div class="ps-field">
          <span class="ps-label">{{ t('workflow.processSettingsEndEvent') }}</span>
          <div class="ps-checkrow">
            <el-checkbox v-model="form.initiator">
              {{ t('workflow.processSettingsInitiator') }}
            </el-checkbox>
            <el-checkbox v-model="form.approvers">
              {{ t('workflow.processSettingsApprovers') }}
            </el-checkbox>
          </div>
        </div>

        <div class="ps-field">
          <span class="ps-label">{{ t('workflow.processSettingsChannels') }}</span>
          <div class="ps-checkrow">
            <el-checkbox-group v-model="form.channels">
              <el-checkbox label="IN_APP">{{
                t('workflow.processSettingsChannelInApp')
              }}</el-checkbox>
              <el-checkbox label="EMAIL">{{
                t('workflow.processSettingsChannelEmail')
              }}</el-checkbox>
            </el-checkbox-group>
          </div>
          <p class="ps-hint">{{ t('workflow.processSettingsEmailHint') }}</p>
        </div>

        <div class="ps-field">
          <span class="ps-label">{{ t('workflow.processSettingsOtherRecipients') }}</span>
          <UserRemoteSelect
            v-model="form.otherRecipientIds"
            multiple
            :placeholder="t('workflow.processSettingsOtherPlaceholder')"
          />
        </div>
      </section>

      <section v-else class="ps-card">
        <h2>{{ t('workflow.processSettingsListeners') }}</h2>
        <p class="ps-hint">{{ t('workflow.processSettingsListenersHint') }}</p>
        <div class="ps-listener-actions">
          <el-button type="primary" @click="openListenerEditor()">
            {{ t('workflow.processSettingsAddListener') }}
          </el-button>
          <span class="ps-hint">{{ t('workflow.processSettingsListenerSaveHint') }}</span>
        </div>
        <p v-if="processListeners.length === 0" class="ps-empty">
          {{ t('workflow.processSettingsNoListeners') }}
        </p>
        <el-table v-else :data="processListeners" size="small">
          <el-table-column :label="t('workflow.processSettingsListenerName')" min-width="180">
            <template #default="{ row }">{{ row.name || row.triggerId }}</template>
          </el-table-column>
          <el-table-column :label="t('workflow.processSettingsListenerEvent')" width="120">
            <template #default="{ row }">{{ eventLabel(row.event) }}</template>
          </el-table-column>
          <el-table-column :label="t('workflow.processSettingsListenerEnabled')" width="90">
            <template #default="{ row }">
              <el-switch
                :model-value="row.enabled !== false"
                @update:model-value="
                  (value: string | number | boolean) =>
                    setListenerEnabled(row as TriggerConfig, Boolean(value))
                "
              />
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="260">
            <template #default="{ row, $index }">
              <el-button
                link
                size="small"
                :disabled="$index === 0"
                @click="moveListener(row as TriggerConfig, -1)"
                >{{ t('common.moveUp') }}</el-button
              >
              <el-button
                link
                size="small"
                :disabled="$index === processListeners.length - 1"
                @click="moveListener(row as TriggerConfig, 1)"
                >{{ t('common.moveDown') }}</el-button
              >
              <el-button
                link
                size="small"
                type="primary"
                @click="openListenerEditor(row as TriggerConfig)"
              >
                {{ t('common.edit') }}
              </el-button>
              <el-button
                link
                size="small"
                type="danger"
                @click="removeListener(row as TriggerConfig)"
              >
                {{ t('common.delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <p v-if="nodeListenerCount > 0" class="ps-hint">
          {{ t('workflow.processSettingsNodeListenersHint', { count: nodeListenerCount }) }}
        </p>
        <el-button class="ps-listener-back" @click="backToDesigner">{{
          t('workflow.processSettingsOpenDesigner')
        }}</el-button>
      </section>
    </div>

    <el-dialog
      v-model="listenerDialogVisible"
      :title="
        listenerEditId
          ? t('workflow.processSettingsEditListener')
          : t('workflow.processSettingsAddListener')
      "
      width="520px"
      append-to-body
    >
      <el-form label-position="top" size="small">
        <el-form-item :label="t('workflow.processSettingsListenerName')">
          <el-input v-model="listenerDraft.name" maxlength="60" />
        </el-form-item>
        <el-form-item :label="t('workflow.processSettingsListenerEvent')">
          <el-select v-model="listenerDraft.event" style="width: 100%">
            <el-option :label="t('workflow.processSettingsEventStart')" value="PROCESS_START" />
            <el-option :label="t('workflow.processSettingsEventEnd')" value="PROCESS_COMPLETED" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('workflow.processSettingsListenerEnabled')">
          <el-switch v-model="listenerDraft.enabled" />
        </el-form-item>
        <el-form-item :label="t('workflow.processSettingsListenerScript')">
          <el-button @click="listenerScriptVisible = true">
            {{
              listenerDraft.script.trim()
                ? t('workflow.processSettingsListenerScriptEdit')
                : t('workflow.processSettingsListenerScriptWrite')
            }}
          </el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="listenerDialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveListenerDraft">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <ScriptDialog
      v-model:visible="listenerScriptVisible"
      :title="t('workflow.processSettingsListenerScript')"
      :code="listenerDraft.script"
      :functions="PROCESS_SCRIPT_FUNCTIONS"
      :simulate="simulateListener"
      @save="(code: string) => (listenerDraft.script = code)"
    />
  </div>
</template>

<style scoped>
.ps-page {
  box-sizing: border-box;
  min-height: 100%;
  padding: 20px 20px 32px;
  background: var(--sw-surface-page);
  color: var(--sw-text-primary);
}
.ps-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
}
.ps-header h1 {
  flex: 1;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.ps-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sw-color-primary);
  font-size: 14px;
  cursor: pointer;
}
.ps-body {
  display: flex;
  align-items: flex-start;
  gap: 36px;
}
.ps-nav {
  box-sizing: border-box;
  display: flex;
  flex: 0 0 188px;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: var(--sw-radius-card, 10px);
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
}
.ps-nav__item {
  height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--sw-radius-base);
  background: transparent;
  color: var(--sw-text-primary);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.ps-nav__item.is-active {
  background: var(--sw-color-primary);
  color: #fff;
  font-weight: 500;
}
.ps-card {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  max-width: 1158px;
  padding: 24px;
  border-radius: var(--sw-radius-card, 10px);
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
}
.ps-card h2 {
  margin: 0 0 20px;
  font-size: 16px;
  font-weight: 600;
}
.ps-field {
  margin-bottom: 24px;
}
.ps-label {
  display: block;
  margin-bottom: 10px;
  font-size: 14px;
  color: var(--sw-text-secondary);
}
.ps-checkrow {
  display: flex;
  align-items: center;
  gap: 28px;
  min-height: 32px;
}
.ps-hint {
  margin: 8px 0 0;
  color: var(--sw-text-tertiary, var(--sw-text-secondary));
  font-size: 12px;
  line-height: 18px;
}
.ps-empty {
  margin: 18px 0;
  color: var(--sw-text-secondary);
  font-size: 13px;
}
.ps-listener-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
}
.ps-listener-actions .ps-hint {
  margin: 0;
}
.ps-listener-back {
  margin-top: 16px;
}
.ps-listeners {
  margin: 12px 0 20px;
  padding: 0;
  list-style: none;
}
.ps-listeners li {
  display: grid;
  grid-template-columns: 1fr 160px 60px;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--sw-border-light);
  font-size: 13px;
}
.ps-listeners li span {
  color: var(--sw-text-secondary);
}
</style>
