<script setup lang="ts">
/**
 * HUMAN 节点面板（G3-1）：说明、填写字段、决策按钮、处理人、超时。
 *
 * 配置写入 graph_json 的 config（后端不透明透传）：
 *   instructions / fields[{name,label,type,required,options}] /
 *   buttons[{keyword,label}] / assigneeUserIds[] / assigneeRoleCodes[] /
 *   timeoutSeconds / timeoutKeyword
 * 每个按钮 keyword 必须有一条对应出边（连线关键词），发布时服务端校验。
 */
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/locales'
import {
  NODE_CONFIG_KEY_HUMAN_ASSIGNEE_ROLE_CODES,
  NODE_CONFIG_KEY_HUMAN_ASSIGNEE_USER_IDS,
  NODE_CONFIG_KEY_HUMAN_BUTTONS,
  NODE_CONFIG_KEY_HUMAN_FIELDS,
  NODE_CONFIG_KEY_HUMAN_INSTRUCTIONS,
  NODE_CONFIG_KEY_HUMAN_TIMEOUT_KEYWORD,
  NODE_CONFIG_KEY_HUMAN_TIMEOUT_SECONDS,
  type HumanButton,
  type HumanField,
} from '@/modules/agent/utils/graphAdapter'
import type { NodePanelProps } from './node-panel-registry'
import VariablePicker from './VariablePicker.vue'

const props = defineProps<NodePanelProps>()

const emit = defineEmits<{
  updateNodeData: [key: string, value: unknown]
}>()

const { t } = useI18n()

const FIELD_TYPES: Array<{ value: HumanField['type']; labelKey: string }> = [
  { value: 'text', labelKey: 'agent.humanFieldText' },
  { value: 'number', labelKey: 'agent.humanFieldNumber' },
  { value: 'select', labelKey: 'agent.humanFieldSelect' },
]

const instructions = computed(() =>
  typeof props.node.data?.[NODE_CONFIG_KEY_HUMAN_INSTRUCTIONS] === 'string'
    ? (props.node.data?.[NODE_CONFIG_KEY_HUMAN_INSTRUCTIONS] as string)
    : '',
)

function readFields(): HumanField[] {
  const raw = props.node.data?.[NODE_CONFIG_KEY_HUMAN_FIELDS]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object')
    .map((f) => ({
      name: String(f.name ?? ''),
      label: String(f.label ?? ''),
      type: (['text', 'number', 'select'] as const).includes(f.type as HumanField['type'])
        ? (f.type as HumanField['type'])
        : 'text',
      required: f.required === true,
      options: typeof f.options === 'string' ? f.options : '',
    }))
}

function readButtons(): HumanButton[] {
  const raw = props.node.data?.[NODE_CONFIG_KEY_HUMAN_BUTTONS]
  if (!Array.isArray(raw)) return []
  return raw
    .filter((b): b is Record<string, unknown> => !!b && typeof b === 'object')
    .map((b) => ({ keyword: String(b.keyword ?? ''), label: String(b.label ?? '') }))
}

function readStringList(key: string): string[] {
  const raw = props.node.data?.[key]
  return Array.isArray(raw) ? raw.map((v) => String(v)).filter((v) => v !== '') : []
}

const fieldRows = ref<HumanField[]>(readFields())
const buttonRows = ref<HumanButton[]>(readButtons())
const assigneeUserIds = ref<string[]>(readStringList(NODE_CONFIG_KEY_HUMAN_ASSIGNEE_USER_IDS))
const roleCodesText = ref(readStringList(NODE_CONFIG_KEY_HUMAN_ASSIGNEE_ROLE_CODES).join(', '))

watch(
  () => props.node.id,
  () => {
    fieldRows.value = readFields()
    buttonRows.value = readButtons()
    assigneeUserIds.value = readStringList(NODE_CONFIG_KEY_HUMAN_ASSIGNEE_USER_IDS)
    roleCodesText.value = readStringList(NODE_CONFIG_KEY_HUMAN_ASSIGNEE_ROLE_CODES).join(', ')
  },
)

const timeoutSeconds = computed<number | ''>(() => {
  const raw = props.node.data?.[NODE_CONFIG_KEY_HUMAN_TIMEOUT_SECONDS]
  return typeof raw === 'number' && raw > 0 ? raw : ''
})

const timeoutKeyword = computed(() =>
  typeof props.node.data?.[NODE_CONFIG_KEY_HUMAN_TIMEOUT_KEYWORD] === 'string'
    ? (props.node.data?.[NODE_CONFIG_KEY_HUMAN_TIMEOUT_KEYWORD] as string)
    : '',
)

/** 按钮关键词候选（超时分支从这里选，保证与某条出边关键词一致） */
const buttonKeywords = computed(() =>
  buttonRows.value.map((b) => b.keyword.trim()).filter((k) => k !== ''),
)

function onInsertVariable(reference: string) {
  const next = instructions.value.trim() ? `${instructions.value} ${reference}` : reference
  emit('updateNodeData', NODE_CONFIG_KEY_HUMAN_INSTRUCTIONS, next)
}

function commitFields() {
  emit(
    'updateNodeData',
    NODE_CONFIG_KEY_HUMAN_FIELDS,
    fieldRows.value.map((row) => ({ ...row })),
  )
}

function addField() {
  fieldRows.value = [
    ...fieldRows.value,
    { name: '', label: '', type: 'text', required: false, options: '' },
  ]
  commitFields()
}

function removeField(index: number) {
  fieldRows.value = fieldRows.value.filter((_, i) => i !== index)
  commitFields()
}

function commitButtons() {
  emit(
    'updateNodeData',
    NODE_CONFIG_KEY_HUMAN_BUTTONS,
    buttonRows.value.map((row) => ({ ...row })),
  )
}

function addButton() {
  buttonRows.value = [...buttonRows.value, { keyword: '', label: '' }]
  commitButtons()
}

function removeButton(index: number) {
  buttonRows.value = buttonRows.value.filter((_, i) => i !== index)
  commitButtons()
}

function commitAssignees() {
  emit('updateNodeData', NODE_CONFIG_KEY_HUMAN_ASSIGNEE_USER_IDS, [...assigneeUserIds.value])
}

function commitRoles() {
  const roles = roleCodesText.value
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r !== '')
  emit('updateNodeData', NODE_CONFIG_KEY_HUMAN_ASSIGNEE_ROLE_CODES, roles)
}

function commitTimeout(value: number | undefined) {
  emit(
    'updateNodeData',
    NODE_CONFIG_KEY_HUMAN_TIMEOUT_SECONDS,
    typeof value === 'number' && value > 0 ? value : undefined,
  )
}

function commitTimeoutKeyword(value: string) {
  emit('updateNodeData', NODE_CONFIG_KEY_HUMAN_TIMEOUT_KEYWORD, value || undefined)
}
</script>

<template>
  <div class="human-panel">
    <div class="field-row">
      <div class="field-label">
        {{ t('agent.humanInstructions') }}
        <VariablePicker :groups="variableGroups ?? []" @pick="onInsertVariable" />
      </div>
      <div class="panel-hint">{{ t('agent.humanInstructionsHint') }}</div>
      <el-input
        :model-value="instructions"
        type="textarea"
        :rows="3"
        :placeholder="t('agent.humanInstructionsPlaceholder')"
        maxlength="2000"
        @change="(v) => emit('updateNodeData', NODE_CONFIG_KEY_HUMAN_INSTRUCTIONS, v)"
      />
    </div>

    <div class="panel-section-title">{{ t('agent.humanFieldsTitle') }}</div>
    <div class="panel-hint">{{ t('agent.humanFieldsHint') }}</div>
    <div v-if="fieldRows.length === 0" class="panel-empty">{{ t('agent.humanFieldsEmpty') }}</div>
    <div v-for="(row, index) in fieldRows" :key="index" class="mapping-row">
      <div class="mapping-row__grid">
        <el-input
          v-model="row.name"
          size="small"
          :placeholder="t('agent.humanFieldName')"
          @change="commitFields"
        />
        <el-input
          v-model="row.label"
          size="small"
          :placeholder="t('agent.humanFieldLabel')"
          @change="commitFields"
        />
        <el-select v-model="row.type" size="small" @change="commitFields">
          <el-option
            v-for="opt in FIELD_TYPES"
            :key="opt.value"
            :label="t(opt.labelKey)"
            :value="opt.value"
          />
        </el-select>
        <el-checkbox v-model="row.required" size="small" @change="commitFields">
          {{ t('agent.humanFieldRequired') }}
        </el-checkbox>
        <el-button
          size="small"
          type="danger"
          plain
          :aria-label="t('agent.removeParamRow')"
          @click="removeField(index)"
        >
          ×
        </el-button>
      </div>
      <el-input
        v-if="row.type === 'select'"
        v-model="row.options"
        size="small"
        :placeholder="t('agent.humanFieldOptionsHint')"
        @change="commitFields"
      />
    </div>
    <el-button size="small" plain class="add-param-btn" @click="addField">
      {{ t('agent.humanAddField') }}
    </el-button>

    <div class="panel-section-title">{{ t('agent.humanButtonsTitle') }}</div>
    <div class="panel-hint">{{ t('agent.humanButtonsHint') }}</div>
    <div v-if="buttonRows.length === 0" class="panel-empty">{{ t('agent.humanButtonsEmpty') }}</div>
    <div v-for="(row, index) in buttonRows" :key="index" class="mapping-row">
      <div class="mapping-row__grid">
        <el-input
          v-model="row.keyword"
          size="small"
          :placeholder="t('agent.humanButtonKeyword')"
          @change="commitButtons"
        />
        <el-input
          v-model="row.label"
          size="small"
          :placeholder="t('agent.humanButtonLabel')"
          @change="commitButtons"
        />
        <el-button
          size="small"
          type="danger"
          plain
          :aria-label="t('agent.removeParamRow')"
          @click="removeButton(index)"
        >
          ×
        </el-button>
      </div>
    </div>
    <el-button size="small" plain class="add-param-btn" @click="addButton">
      {{ t('agent.humanAddButton') }}
    </el-button>

    <div class="field-row">
      <div class="field-label">{{ t('agent.humanAssigneesTitle') }}</div>
      <div class="panel-hint">{{ t('agent.humanAssigneesHint') }}</div>
      <el-select
        v-model="assigneeUserIds"
        multiple
        filterable
        size="small"
        :placeholder="t('agent.humanAssigneeUsersPlaceholder')"
        style="width: 100%"
        @change="commitAssignees"
      >
        <el-option v-for="u in userOptions ?? []" :key="u.id" :label="u.label" :value="u.id" />
      </el-select>
      <el-input
        v-model="roleCodesText"
        size="small"
        :placeholder="t('agent.humanAssigneeRolesPlaceholder')"
        @change="commitRoles"
      />
    </div>

    <div class="field-row">
      <div class="field-label">{{ t('agent.humanTimeoutTitle') }}</div>
      <div class="mapping-row__grid">
        <el-input-number
          :model-value="timeoutSeconds === '' ? undefined : timeoutSeconds"
          :min="1"
          :max="86400"
          size="small"
          controls-position="right"
          @change="(v) => commitTimeout(typeof v === 'number' ? v : undefined)"
        />
        <el-select
          :model-value="timeoutKeyword"
          size="small"
          clearable
          filterable
          allow-create
          default-first-option
          :placeholder="t('agent.humanTimeoutKeywordPlaceholder')"
          @change="(v) => commitTimeoutKeyword(String(v ?? ''))"
        >
          <el-option
            v-for="keyword in buttonKeywords"
            :key="keyword"
            :label="keyword"
            :value="keyword"
          />
        </el-select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-section-title {
  font-size: 13px;
  font-weight: 600;
  margin: 12px 0 4px;
}

.panel-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  line-height: 18px;
}

.panel-empty {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding: 8px 0 12px;
}

.field-row {
  margin-bottom: 12px;
}

.field-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin-bottom: 6px;
}

.mapping-row {
  margin-bottom: 8px;
}

.mapping-row__grid {
  display: flex;
  align-items: center;
  gap: 6px;
}

.mapping-row__grid :deep(.el-input),
.mapping-row__grid :deep(.el-select) {
  flex: 1;
  min-width: 0;
}

.add-param-btn {
  margin-bottom: 8px;
}
</style>
