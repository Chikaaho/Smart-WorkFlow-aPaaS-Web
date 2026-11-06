<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * IotRuleList — 事件规则管理（P21 A5）。
 *
 * 属性变化/阈值/事件/上下线规则配置（条件、防抖、冷却、连续次数）、
 * 流程模板绑定与表单字段映射（JSON）、发布/停用、触发记录回查。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import {
  ListActionsColumn,
  ListFilterItem,
  StandardListTemplate,
  useClientList,
} from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import {
  listRules,
  createRule,
  updateRule,
  publishRule,
  disableRule,
  listRuleTriggers,
  listEligibleDevices,
  type IotEventRule,
  type IotDevice,
  type IotProcessTriggerRecord,
} from '../api'
import { listPublishedGraphOptions } from '@/adapters/agent-graph-catalog'

const loading = ref(false)
/** 本次加载的失败原因；非空时页面显示错误态而不是空态。 */
const loadError = ref('')
const list = ref<IotEventRule[]>([])
const devices = ref<IotDevice[]>([])
/** 已发布 Agent 图（0.2.4：Agent 图联动下拉可选，避免手抄图 key）。 */
const publishedGraphs = ref<{ label: string; value: string }[]>([])

const {
  keyword,
  pageNum,
  pageSize,
  pagedRows,
  total,
  handleQuery,
  handleReset,
  handlePageNumChange,
  handlePageSizeChange,
} = useClientList(list, {
  searchFields: (row) => [row.code, row.name, row.ruleType, row.conditionJson],
})

const dialogVisible = ref(false)
/** 编辑中的规则 ID；null = 新建 */
const editingId = ref<number | null>(null)
/**
 * 研判参数（0.2.4 S3-01）：以「键=值」维护，保存时写入研判输入映射的 fixed 条目。
 * 业务判定阈值/窗口/斜率等可调参数走这里，避免业务人员直接编辑整段映射 JSON。
 */
const agentParams = ref<{ key: string; value: string }[]>([])
const form = reactive({
  code: '',
  name: '',
  deviceId: undefined as number | undefined,
  ruleType: 'THRESHOLD',
  conditionJson: '{"propertyId":"temperature","op":"GT","threshold":30}',
  debounceMs: 0,
  cooldownMs: 0,
  continuousCount: 1,
  processEnabled: 1,
  processTemplateKey: '',
  formMappingJson: '[{"field":"deviceKey","source":"DEVICE_KEY","required":true}]',
  agentEnabled: 0,
  agentGraphKey: '',
  agentInputMappingJson:
    '[{"field":"value","source":"PROPERTY_VALUE"},{"field":"reportTime","source":"REPORT_TIME"}]',
  agentFailureTemplateKey: '',
  agentFailureConfigJson: '',
})

type MappingItem = { field?: string; source?: string; fixed?: unknown }

function parseMappingItems(json: string): MappingItem[] | null {
  try {
    const parsed: unknown = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as MappingItem[]) : null
  } catch {
    return null
  }
}

/** 打开编辑时把固定参数从映射里抽到键值编辑器（其余映射保持原样）。 */
function syncAgentParamsFromMapping() {
  const items = parseMappingItems(form.agentInputMappingJson) ?? []
  agentParams.value = items
    .filter((item) => !item.source || item.source === 'fixed')
    .filter((item) => item.field)
    .map((item) => ({
      key: String(item.field),
      value: item.fixed == null ? '' : String(item.fixed),
    }))
}

/** 保存前把键值编辑器合并回映射 JSON（替换全部 fixed 条目，保留其它来源）。 */
function mergeAgentParamsIntoMapping() {
  const items = parseMappingItems(form.agentInputMappingJson)
  if (!items) return
  const kept = items.filter((item) => item.source && item.source !== 'fixed')
  for (const param of agentParams.value) {
    const key = param.key.trim()
    if (!key) continue
    kept.push({ field: key, source: 'fixed', fixed: param.value })
  }
  form.agentInputMappingJson = JSON.stringify(kept)
}

function addAgentParam() {
  agentParams.value.push({ key: '', value: '' })
}

function removeAgentParam(index: number) {
  agentParams.value.splice(index, 1)
}

/** 已发布图选项（下拉）：value=graphKey，label=名称（key） */
const publishedGraphOptions = computed(() => publishedGraphs.value)

const triggerVisible = ref(false)
const triggers = ref<IotProcessTriggerRecord[]>([])
const triggerLoading = ref(false)
const triggerDetailVisible = ref(false)
const selectedTrigger = ref<IotProcessTriggerRecord | null>(null)
const triggerDetailJson = computed(() =>
  selectedTrigger.value ? JSON.stringify(selectedTrigger.value, null, 2) : '',
)

const isEmpty = computed(() => !loading.value && !loadError.value && list.value.length === 0)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    list.value = await listRules()
    devices.value = await listEligibleDevices()
    try {
      publishedGraphs.value = await listPublishedGraphOptions()
    } catch {
      // 图列表加载失败不阻塞规则管理：Agent 联动退化为手输图 key
      publishedGraphs.value = []
    }
    pageNum.value = 1
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.msg : t('common.loadFailed')
  } finally {
    loading.value = false
  }
}

// ─── 客户端分页 + 关键词筛选（V012-BUG-003）：一次拉全量，前端切片 ───

function deviceName(deviceId: number): string {
  const d = devices.value.find((x) => x.id === deviceId)
  return d ? d.name : String(deviceId)
}

function openCreate() {
  editingId.value = null
  agentParams.value = []
  Object.assign(form, {
    code: '',
    name: '',
    deviceId: undefined,
    ruleType: 'THRESHOLD',
    conditionJson: '{"propertyId":"temperature","op":"GT","threshold":30}',
    debounceMs: 0,
    cooldownMs: 0,
    continuousCount: 1,
    processEnabled: 1,
    processTemplateKey: '',
    formMappingJson: '[{"field":"deviceKey","source":"DEVICE_KEY","required":true}]',
    agentEnabled: 0,
    agentGraphKey: '',
    agentInputMappingJson:
      '[{"field":"value","source":"PROPERTY_VALUE"},{"field":"reportTime","source":"REPORT_TIME"}]',
    agentFailureTemplateKey: '',
    agentFailureConfigJson: '',
  })
  dialogVisible.value = true
}

function openEdit(row: IotEventRule) {
  editingId.value = row.id
  Object.assign(form, {
    code: row.code,
    name: row.name,
    deviceId: row.deviceId,
    ruleType: row.ruleType,
    conditionJson: row.conditionJson,
    debounceMs: row.debounceMs,
    cooldownMs: row.cooldownMs,
    continuousCount: row.continuousCount,
    processEnabled: row.processEnabled,
    processTemplateKey: row.processTemplateKey ?? '',
    formMappingJson: row.formMappingJson ?? '',
    agentEnabled: row.agentEnabled,
    agentGraphKey: row.agentGraphKey ?? '',
    agentInputMappingJson: row.agentInputMappingJson ?? '',
    agentFailureTemplateKey: row.agentFailureTemplateKey ?? '',
    agentFailureConfigJson: row.agentFailureConfigJson ?? '',
  })
  syncAgentParamsFromMapping()
  dialogVisible.value = true
}

function failureConfigIsValid(): boolean {
  const text = form.agentFailureConfigJson.trim()
  if (!text) return true
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
  } catch {
    return false
  }
}

async function save() {
  if (form.agentEnabled === 1) {
    if (parseMappingItems(form.agentInputMappingJson) === null) {
      ElMessage.error(t('iot.agentInputMappingInvalid'))
      return
    }
    mergeAgentParamsIntoMapping()
  }
  if (!failureConfigIsValid()) {
    ElMessage.error(t('iot.agentFailureConfigInvalid'))
    return
  }
  const payload = { ...form, agentFailureConfigJson: form.agentFailureConfigJson.trim() }
  if (editingId.value === null) {
    await createRule(payload)
    ElMessage.success(t('iot.ruleCreatedDraft'))
  } else {
    await updateRule(editingId.value, payload)
    ElMessage.success(t('iot.ruleUpdated'))
  }
  dialogVisible.value = false
  void load()
}

async function handlePublish(row: IotEventRule) {
  await publishRule(row.id)
  ElMessage.success(t('common.statusPublished'))
  void load()
}

async function handleDisable(row: IotEventRule) {
  await disableRule(row.id)
  ElMessage.success(t('common.statusDisabled'))
  void load()
}

async function openTriggers(row: IotEventRule) {
  triggerLoading.value = true
  triggerVisible.value = true
  try {
    triggers.value = await listRuleTriggers(row.id)
  } finally {
    triggerLoading.value = false
  }
}

function openTriggerDetail(row: IotProcessTriggerRecord) {
  selectedTrigger.value = row
  triggerDetailVisible.value = true
}

onMounted(() => void load())

/** 统一操作列（V012-BUG-002）：发布/停用按规则状态互斥显隐 */
function rowActions(r: unknown): ListAction[] {
  const row = r as IotEventRule
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      onClick: () => openEdit(row),
    },
    {
      key: 'publish',
      label: t('common.publish'),
      type: 'success',
      visible: row.status !== 'PUBLISHED',
      onClick: () => void handlePublish(row),
    },
    {
      key: 'disable',
      label: t('common.disable'),
      type: 'danger',
      visible: row.status === 'PUBLISHED',
      onClick: () => void handleDisable(row),
    },
    {
      key: 'triggers',
      label: t('iot.triggerRecords'),
      onClick: () => void openTriggers(row),
    },
  ]
}
</script>

<template>
  <StandardListTemplate
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <el-button type="primary" @click="openCreate">{{ t('common.newRule') }}</el-button>
    </template>

    <template #filter>
      <ListFilterItem :label="t('common.keyword')">
        <el-input
          v-model="keyword"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="handleQuery"
          @clear="handleReset"
        />
      </ListFilterItem>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>

    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      show-icon
      :closable="false"
      class="load-error"
    >
      <template #default>
        <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
      </template>
    </el-alert>

    <el-table v-else v-loading="loading" :data="pagedRows" stripe>
      <el-table-column prop="code" :label="t('common.code')" min-width="110" />
      <el-table-column prop="name" :label="t('common.name')" min-width="130" />
      <el-table-column :label="t('common.device')" min-width="120">
        <template #default="{ row }">{{ deviceName(row.deviceId) }}</template>
      </el-table-column>
      <el-table-column prop="ruleType" :label="t('common.type')" width="150" />
      <el-table-column
        prop="conditionJson"
        :label="t('common.condition')"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column :label="t('iot.processLinkage')" width="90">
        <template #default="{ row }">
          <el-tag :type="row.processEnabled === 1 ? 'success' : 'info'" size="small">
            {{ row.processEnabled === 1 ? row.processTemplateKey : '—' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('iot.agentLinkage')" width="90">
        <template #default="{ row }">
          <el-tag :type="row.agentEnabled === 1 ? 'success' : 'info'" size="small">
            {{ row.agentEnabled === 1 ? row.agentGraphKey : '—' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="90">
        <template #default="{ row }">
          <el-tag
            :type="
              row.status === 'PUBLISHED' ? 'success' : row.status === 'DISABLED' ? 'danger' : 'info'
            "
            size="small"
            >{{ enumLabel('IOT_RELEASE_STATE', row.status) }}</el-tag
          >
        </template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :width="210" />
    </el-table>
  </StandardListTemplate>

  <el-dialog
    v-model="dialogVisible"
    :title="editingId === null ? t('common.newRule') : t('common.edit')"
    width="680px"
  >
    <el-form label-width="100px">
      <el-form-item :label="t('common.code')" required
        ><el-input v-model="form.code"
      /></el-form-item>
      <el-form-item :label="t('common.name')" required
        ><el-input v-model="form.name"
      /></el-form-item>
      <el-form-item :label="t('common.device')" required>
        <el-select v-model="form.deviceId" :placeholder="t('iot.eligibleDevicesPlaceholder')">
          <el-option
            v-for="d in devices"
            :key="d.id"
            :label="`${d.name} (${d.deviceKey})`"
            :value="d.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('iot.ruleType')">
        <el-select v-model="form.ruleType">
          <el-option :label="t('iot.ruleTypeThreshold')" value="THRESHOLD" />
          <el-option :label="t('iot.ruleTypePropertyChanged')" value="PROPERTY_CHANGED" />
          <el-option :label="t('iot.ruleTypeEventOccur')" value="EVENT_OCCUR" />
          <el-option :label="t('iot.ruleTypeOnline')" value="ONLINE" />
          <el-option :label="t('iot.ruleTypeOffline')" value="OFFLINE" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('iot.conditionJson')" required>
        <el-input v-model="form.conditionJson" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item :label="t('iot.debounceMs')"
        ><el-input-number v-model="form.debounceMs" :min="0" :step="500"
      /></el-form-item>
      <el-form-item :label="t('iot.cooldownMs')"
        ><el-input-number v-model="form.cooldownMs" :min="0" :step="1000"
      /></el-form-item>
      <el-form-item :label="t('iot.consecutiveCount')"
        ><el-input-number v-model="form.continuousCount" :min="1" :max="100"
      /></el-form-item>
      <el-form-item :label="t('iot.processLinkage')">
        <el-switch v-model="form.processEnabled" :active-value="1" :inactive-value="0" />
      </el-form-item>
      <el-form-item v-if="form.processEnabled === 1" :label="t('iot.processTemplate')" required>
        <el-input
          v-model="form.processTemplateKey"
          :placeholder="t('iot.processTemplateKeyPlaceholder')"
        />
      </el-form-item>
      <el-form-item v-if="form.processEnabled === 1" :label="t('iot.formMapping')">
        <el-input v-model="form.formMappingJson" type="textarea" :rows="4" />
      </el-form-item>
      <el-form-item :label="t('iot.agentLinkage')">
        <el-switch v-model="form.agentEnabled" :active-value="1" :inactive-value="0" />
      </el-form-item>
      <el-form-item v-if="form.agentEnabled === 1" :label="t('iot.agentGraph')" required>
        <el-select
          v-model="form.agentGraphKey"
          :placeholder="t('iot.agentGraphPlaceholder')"
          filterable
          allow-create
          default-first-option
        >
          <el-option
            v-for="g in publishedGraphOptions"
            :key="g.value"
            :label="g.label"
            :value="g.value"
          />
        </el-select>
      </el-form-item>
      <el-form-item
        v-if="form.agentEnabled === 1"
        :label="t('iot.agentJudgmentParams')"
        class="agent-params"
      >
        <div class="agent-params__list">
          <div v-for="(param, index) in agentParams" :key="index" class="agent-params__row">
            <el-input v-model="param.key" :placeholder="t('iot.agentParamName')" />
            <el-input v-model="param.value" :placeholder="t('iot.agentParamValue')" />
            <el-button link type="danger" @click="removeAgentParam(index)">
              {{ t('common.delete') }}
            </el-button>
          </div>
          <el-button size="small" @click="addAgentParam">{{ t('iot.agentParamAdd') }}</el-button>
          <div class="agent-params__hint">{{ t('iot.agentJudgmentParamsHint') }}</div>
        </div>
      </el-form-item>
      <el-form-item v-if="form.agentEnabled === 1" :label="t('iot.agentInputMapping')">
        <el-input v-model="form.agentInputMappingJson" type="textarea" :rows="3" />
      </el-form-item>
      <el-form-item v-if="form.agentEnabled === 1" :label="t('iot.agentFailureTemplate')">
        <el-input
          v-model="form.agentFailureTemplateKey"
          :placeholder="t('iot.agentFailureTemplatePlaceholder')"
        />
      </el-form-item>
      <el-form-item v-if="form.agentEnabled === 1" :label="t('iot.agentFailureConfig')">
        <el-input
          v-model="form.agentFailureConfigJson"
          type="textarea"
          :rows="4"
          :placeholder="t('iot.agentFailureConfigPlaceholder')"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="triggerVisible" :title="t('iot.triggerRecordsTitle')" width="760px">
    <el-table
      v-loading="triggerLoading"
      :data="triggers"
      stripe
      size="small"
      @row-click="openTriggerDetail"
    >
      <el-table-column
        prop="idempotentKey"
        :label="t('iot.idempotencyKey')"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column prop="status" :label="t('common.status')" width="90">
        <template #default="{ row }">
          <el-tag
            :type="
              row.status === 'SUCCESS' ? 'success' : row.status === 'FAILED' ? 'danger' : 'warning'
            "
            size="small"
          >
            {{ enumLabel('IOT_RELEASE_STATE', row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="processInstanceId"
        :label="t('common.processInstance')"
        min-width="140"
      />
      <el-table-column
        prop="error"
        :label="t('common.failureReason')"
        min-width="160"
        show-overflow-tooltip
      />
      <el-table-column prop="triggerTime" :label="t('iot.triggeredAt')" min-width="150" />
    </el-table>
  </el-dialog>
  <el-dialog v-model="triggerDetailVisible" :title="t('iot.triggerRecordDetail')" width="680px">
    <pre
      style="
        max-height: 55vh;
        overflow: auto;
        margin: 0;
        padding: 12px;
        background: var(--el-fill-color-light);
        white-space: pre-wrap;
        word-break: break-word;
      "
      >{{ triggerDetailJson }}</pre
    >
  </el-dialog>
</template>

<style scoped>
.agent-params__list {
  width: 100%;
}
.agent-params__row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}
.agent-params__hint {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}
</style>
