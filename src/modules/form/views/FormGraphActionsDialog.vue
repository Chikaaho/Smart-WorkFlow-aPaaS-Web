<template>
  <el-dialog
    :model-value="modelValue"
    :title="t('form.graphActionsTitle')"
    width="720px"
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
    @open="hydrateDraft"
  >
    <div class="actions-toolbar">
      <el-button type="primary" size="small" @click="addAction">{{
        t('form.graphActionAdd')
      }}</el-button>
      <span class="hint">{{ t('form.graphActionsHint') }}</span>
    </div>

    <el-empty v-if="draft.length === 0" :description="t('form.graphActionEmpty')" />

    <el-card v-for="(action, index) in draft" :key="action.id" class="action-card" shadow="never">
      <div class="action-head">
        <el-input
          v-model="action.name"
          :placeholder="t('form.graphActionName')"
          size="small"
          style="width: 180px"
        />
        <el-select v-model="action.trigger" size="small" style="width: 130px">
          <el-option :label="t('form.graphTriggerBeforeSubmit')" value="BEFORE_SUBMIT" />
          <el-option :label="t('form.graphTriggerButton')" value="BUTTON" />
        </el-select>
        <el-select
          :model-value="String(action.graphDefId ?? '')"
          filterable
          size="small"
          style="width: 220px"
          :placeholder="t('form.graphActionGraph')"
          @update:model-value="onGraphChange(action, String($event))"
        >
          <el-option
            v-for="graph in graphs"
            :key="graph.id"
            :value="String(graph.id)"
            :label="`${graph.name} (${graph.graphKey})`"
          />
        </el-select>
        <el-select
          :model-value="String(action.graphDefVersion ?? '')"
          :disabled="!action.graphDefId"
          size="small"
          style="width: 130px"
          :placeholder="t('form.graphActionVersion')"
          @update:model-value="onVersionChange(action, String($event))"
        >
          <el-option
            v-for="version in versionsOf(action)"
            :key="version.defVersion"
            :value="String(version.defVersion)"
            :label="`v${version.defVersion}`"
          />
        </el-select>
        <el-button size="small" type="danger" link @click="draft.splice(index, 1)">
          {{ t('common.delete') }}
        </el-button>
      </div>

      <el-alert
        v-if="bindingOf(action)?.containsHumanNode"
        type="warning"
        :closable="false"
        :title="t('form.graphActionHumanWarning')"
      />
      <el-alert v-if="errorsOf(action)" type="error" :closable="false" :title="errorsOf(action)" />

      <template v-if="bindingOf(action)">
        <div class="mapping-title">{{ t('form.graphActionInputTitle') }}</div>
        <div v-for="param in bindingOf(action)!.startParams" :key="param.name" class="mapping-row">
          <span class="mapping-name" :class="{ 'is-required': param.required }">
            {{ param.name }}{{ param.required ? ' *' : '' }}
          </span>
          ←
          <el-select
            :model-value="inputFieldOf(action, param.name)"
            filterable
            allow-create
            default-first-option
            size="small"
            style="width: 220px"
            :placeholder="t('form.graphActionFieldPlaceholder')"
            @update:model-value="setInputField(action, param.name, String($event))"
          >
            <el-option v-for="field in fieldNames" :key="field" :value="field" :label="field" />
          </el-select>
        </div>
        <div class="mapping-title">{{ t('form.graphActionOutputTitle') }}</div>
        <div v-for="output in bindingOf(action)!.endParams" :key="output.name" class="mapping-row">
          <el-select
            :model-value="outputFieldOf(action, output.name)"
            filterable
            allow-create
            default-first-option
            size="small"
            style="width: 220px"
            :placeholder="t('form.graphActionFieldPlaceholder')"
            @update:model-value="setOutputField(action, output.name, String($event))"
          >
            <el-option v-for="field in fieldNames" :key="field" :value="field" :label="field" />
          </el-select>
          ←
          <span class="mapping-name">{{ output.name }}</span>
        </div>
        <div class="timeout-row">
          {{ t('form.graphActionTimeout') }}
          <el-input-number
            :model-value="action.timeoutSeconds ?? undefined"
            :min="1"
            :max="bindingOf(action)!.executionTimeoutSeconds"
            size="small"
            @update:model-value="action.timeoutSeconds = $event ?? undefined"
          />
          s（≤ {{ bindingOf(action)!.executionTimeoutSeconds }}s）
        </div>
      </template>
      <div v-else class="binding-loading">{{ t('form.graphActionBindingNeeded') }}</div>
    </el-card>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="confirm">{{ t('common.confirm') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
/**
 * FormGraphActionsDialog — 1.2.0 P67（E1-6）「调用 Graph」动作配置弹窗。
 *
 * 动作声明随表单定义版本化（schema.graphActions）：绑定已发布图 + 固定版本，
 * 入参/出参映射行由版本绑定声明驱动（参数名从声明选、字段从表单字段选，不手写）。
 * 数据源经 agent-graph-catalog 接缝（模块边界 ESLint 门禁之外）。
 */
import { ref } from 'vue'
import { useI18n } from '@/locales'
import type { FormGraphActionConfig } from '@/contracts/form-schema'
import type {
  AgentGraphDef,
  AgentGraphSnapshot,
  AgentGraphVersionBinding,
} from '@/adapters/agent-graph-catalog'
import {
  getGraphVersionBinding,
  listGraphVersions,
  listPublishedGraphDefs,
} from '@/adapters/agent-graph-catalog'

const props = defineProps<{
  modelValue: boolean
  actions: FormGraphActionConfig[]
  fieldNames: string[]
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [actions: FormGraphActionConfig[]]
}>()

const { t } = useI18n()

const draft = ref<FormGraphActionConfig[]>([])
const graphs = ref<AgentGraphDef[]>([])
const versionsByGraph = ref<Record<string, AgentGraphSnapshot[]>>({})
const bindingByGraphVersion = ref<Record<string, AgentGraphVersionBinding>>({})
const errorsByAction = ref<Record<string, string>>({})

function hydrateDraft() {
  draft.value = props.actions.map((action) => ({
    ...action,
    inputMappings: [...action.inputMappings],
    outputMappings: [...action.outputMappings],
  }))
  errorsByAction.value = {}
  if (graphs.value.length === 0) {
    void listPublishedGraphDefs()
      .then((list) => {
        graphs.value = list
      })
      .catch(() => {
        graphs.value = []
      })
  }
  for (const action of draft.value) {
    if (action.graphDefId && !versionsByGraph.value[String(action.graphDefId)])
      void loadVersions(action.graphDefId)
    if (action.graphDefId && action.graphDefVersion)
      void loadBinding(action.graphDefId, action.graphDefVersion)
  }
}

async function loadVersions(graphDefId: number) {
  try {
    versionsByGraph.value[String(graphDefId)] = await listGraphVersions(graphDefId)
  } catch {
    versionsByGraph.value[String(graphDefId)] = []
  }
}

async function loadBinding(graphDefId: number, version: number) {
  try {
    bindingByGraphVersion.value[`${graphDefId}#${version}`] = await getGraphVersionBinding(
      graphDefId,
      version,
    )
  } catch (err) {
    bindingByGraphVersion.value[`${graphDefId}#${version}`] = {
      graphDefId,
      graphKey: '',
      name: '',
      defVersion: version,
      executionTimeoutSeconds: 3600,
      containsHumanNode: false,
      startParams: [],
      endParams: [],
    }
    errorsByAction.value[`${graphDefId}#${version}`] =
      err instanceof Error ? err.message : String(err)
  }
}

function versionsOf(action: FormGraphActionConfig): AgentGraphSnapshot[] {
  return versionsByGraph.value[String(action.graphDefId)] ?? []
}

function bindingOf(action: FormGraphActionConfig): AgentGraphVersionBinding | null {
  return bindingByGraphVersion.value[`${action.graphDefId}#${action.graphDefVersion}`] ?? null
}

function errorsOf(action: FormGraphActionConfig): string {
  return errorsByAction.value[`${action.graphDefId}#${action.graphDefVersion}`] ?? ''
}

async function onGraphChange(action: FormGraphActionConfig, id: string) {
  action.graphDefId = Number(id)
  action.graphDefVersion = 0
  action.inputMappings = []
  action.outputMappings = []
  if (!versionsByGraph.value[id]) await loadVersions(Number(id))
}

async function onVersionChange(action: FormGraphActionConfig, version: string) {
  action.graphDefVersion = Number(version)
  action.inputMappings = []
  action.outputMappings = []
  await loadBinding(action.graphDefId, action.graphDefVersion)
}

function inputFieldOf(action: FormGraphActionConfig, paramName: string): string {
  return action.inputMappings.find((mapping) => mapping.name === paramName)?.field ?? ''
}

function setInputField(action: FormGraphActionConfig, paramName: string, field: string) {
  action.inputMappings = [
    ...action.inputMappings.filter((mapping) => mapping.name !== paramName),
    ...(field ? [{ name: paramName, field }] : []),
  ]
}

function outputFieldOf(action: FormGraphActionConfig, outputName: string): string {
  return action.outputMappings.find((mapping) => mapping.source === outputName)?.field ?? ''
}

function setOutputField(action: FormGraphActionConfig, outputName: string, field: string) {
  action.outputMappings = [
    ...action.outputMappings.filter((mapping) => mapping.source !== outputName),
    ...(field ? [{ field, source: outputName }] : []),
  ]
}

function addAction() {
  draft.value = [
    ...draft.value,
    {
      id: `ga_${Date.now().toString(36)}`,
      name: '',
      trigger: 'BEFORE_SUBMIT',
      graphDefId: 0,
      graphDefVersion: 0,
      inputMappings: [],
      outputMappings: [],
    },
  ]
}

function confirm() {
  emit(
    'save',
    draft.value.filter((action) => action.graphDefId && action.graphDefVersion),
  )
  emit('update:modelValue', false)
}
</script>

<style scoped>
.actions-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.action-card {
  margin-bottom: 12px;
}

.action-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

.mapping-title {
  font-weight: 600;
  font-size: 13px;
  margin: 10px 0 6px;
}

.mapping-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.mapping-name {
  font-family: var(--el-font-family-mono, monospace);
}

.is-required {
  font-weight: 700;
}

.timeout-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.binding-loading {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  padding: 8px 0;
}
</style>
