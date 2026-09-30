<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * TxnActionList — 事务动作管理（P62 首事务阶段，页型B）。
 *
 * 设计者可为已发布表单配置受控事务动作（预占/确认/释放/数量调整）：
 * 配置 → 发布校验（结构化错误定位）→ 业务调用 → 结果/预占/台账回查；
 * 并提供表单级「关键数据保护（C1）」开关。
 *
 * 呈现原则：只按等级选择时效（不暴露原始秒数）；不展示队列、租约、
 * 请求指纹等内部概念；内部标识仅在业务回查确需处（调用标识）出现。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'
import { StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { pageFormDefs, getFormDefinitionById } from '@/modules/form/api/form-def'
import {
  listTxnActions,
  createTxnAction,
  updateTxnAction,
  validateTxnAction,
  publishTxnAction,
  disableTxnAction,
  enableTxnAction,
  getC1Policy,
  saveC1Policy,
  invokeTxnAction,
  pageTxnInvocations,
  pageTxnReservations,
  pageTxnLedger,
  type TxnActionView,
  type TxnActionType,
  type TxnActionSaveReq,
  type TxnPublishError,
  type TxnInvokeResult,
  type TxnInvocationView,
  type TxnReservationView,
  type TxnLedgerView,
  type C1PolicyModel,
} from '@/modules/form/api/txn-action'
import {
  ACTION_TYPE_MAP,
  ACTION_STATUS_MAP,
  INVOCATION_STATUS_MAP,
  RESERVATION_STATUS_MAP,
  LEDGER_TYPE_MAP,
  TIMELINESS_TIERS,
  tierKeyOfSeconds,
  secondsOfTierKey,
  type TimelinessTier,
} from '@/modules/form/utils/txn-action-status'

/* ─── 表单选择 ─── */

interface FormOption {
  id: string
  name: string
}
const forms = ref<FormOption[]>([])
const selectedFormId = ref('')
const selectedFormName = computed(
  () => forms.value.find((f) => f.id === selectedFormId.value)?.name ?? '',
)

interface FieldOption {
  name: string
  label: string
  type: string
}
const allFields = ref<FieldOption[]>([])
const numberFields = computed(() => allFields.value.filter((f) => f.type === 'NUMBER'))
const keyFieldOptions = computed(() => allFields.value.filter((f) => f.type !== 'TABLE'))

async function loadForms() {
  try {
    const page = await pageFormDefs({ pageNum: 1, pageSize: 200 })
    forms.value = page.list
      .filter((f) => f.status === 'PUBLISHED')
      .map((f) => ({ id: f.id, name: f.name || f.formKey }))
    if (!selectedFormId.value && forms.value.length > 0) {
      selectedFormId.value = forms.value[0].id
    }
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('txnAction.loadFormsFailed')
  }
}

async function loadFields() {
  allFields.value = []
  if (!selectedFormId.value) return
  try {
    const schema = await getFormDefinitionById(selectedFormId.value)
    allFields.value = (schema.fields ?? [])
      .filter((f) => f.type !== 'TABLE')
      .map((f) => ({ name: f.name, label: f.label || f.name, type: f.type }))
  } catch {
    allFields.value = []
  }
}

/* ─── 动作列表 ─── */

const actions = ref<TxnActionView[]>([])
const loading = ref(false)
const errorMsg = ref('')

async function loadActions() {
  if (!selectedFormId.value) {
    actions.value = []
    return
  }
  loading.value = true
  errorMsg.value = ''
  try {
    actions.value = await listTxnActions(selectedFormId.value)
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('txnAction.loadFailed')
  } finally {
    loading.value = false
  }
}

function handleFormChange() {
  loadActions()
  loadFields()
  loadC1()
  resetInvoke()
}

function can(type: 'manage' | 'publish' | 'invoke'): boolean {
  return hasPerm(`form:action:${type}`)
}

function rowActions(r: unknown): ListAction[] {
  const row = r as TxnActionView
  return [
    { key: 'edit', label: t('common.edit'), visible: can('manage'), onClick: () => openEdit(row) },
    {
      key: 'publish',
      label: t('txnAction.publish'),
      type: 'primary',
      visible: can('publish') && row.status !== 'PUBLISHED',
      onClick: () => doPublish(row, true),
    },
    {
      key: 'invoke',
      label: t('txnAction.invoke'),
      visible: can('invoke'),
      onClick: () => openInvoke(row),
    },
    {
      key: 'records',
      label: t('txnAction.records'),
      visible: can('invoke'),
      onClick: () => openRecords(row),
    },
    {
      key: 'reservations',
      label: t('txnAction.reservations'),
      visible: can('invoke'),
      onClick: () => openReservations(row),
    },
    {
      key: 'ledger',
      label: t('txnAction.ledger'),
      visible: can('invoke'),
      onClick: () => openLedger(row),
    },
    {
      key: 'disable',
      label: t('common.disable'),
      type: 'danger',
      visible: can('manage') && row.status === 'PUBLISHED',
      onClick: () => toggle(row, 'disable'),
    },
    {
      key: 'enable',
      label: t('common.enable'),
      type: 'success',
      visible: can('manage') && row.status === 'DISABLED',
      onClick: () => toggle(row, 'enable'),
    },
  ]
}

async function toggle(row: TxnActionView, op: 'disable' | 'enable') {
  try {
    if (op === 'disable') {
      await disableTxnAction(row.id)
      ElMessage.success(t('txnAction.disabledHint'))
    } else {
      await enableTxnAction(row.id)
      ElMessage.success(t('common.enable'))
    }
    await loadActions()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('txnAction.operateFailed'))
  }
}

/* ─── 新建 / 编辑 ─── */

const dialogVisible = ref(false)
const editingId = ref('')
const saving = ref(false)
const dialogError = ref('')
const form = ref<{
  name: string
  actionKey: string
  actionType: TxnActionType
  description: string
  balanceField: string
  reservedField: string
  tierKey: TimelinessTier['key']
  keyFields: string[]
  nonNegative: boolean
}>(blankForm())

function blankForm() {
  return {
    name: '',
    actionKey: '',
    actionType: 'RESERVE' as TxnActionType,
    description: '',
    balanceField: '',
    reservedField: '',
    tierKey: 'PROMPT' as TimelinessTier['key'],
    keyFields: [] as string[],
    nonNegative: true,
  }
}

const editingStatus = computed(
  () => actions.value.find((a) => a.id === editingId.value)?.status ?? 'DRAFT',
)
const needReserved = computed(() => form.value.actionType !== 'ADJUST')
const needTier = computed(() => form.value.actionType === 'RESERVE')

function openCreate() {
  editingId.value = ''
  form.value = blankForm()
  dialogError.value = ''
  dialogVisible.value = true
}

function openEdit(row: TxnActionView) {
  editingId.value = row.id
  dialogError.value = ''
  let config: Record<string, unknown>
  try {
    config = row.configJson ? (JSON.parse(row.configJson) as Record<string, unknown>) : {}
  } catch {
    config = {}
  }
  form.value = {
    name: row.name,
    actionKey: row.actionKey,
    actionType: row.actionType,
    description: row.description ?? '',
    balanceField: (config.balanceField as string) ?? '',
    reservedField: (config.reservedField as string) ?? '',
    tierKey: tierKeyOfSeconds(config.expiresInSeconds as number | undefined),
    keyFields: (config.keyFields as string[]) ?? [],
    nonNegative: config.nonNegativeAvailable !== false,
  }
  dialogVisible.value = true
}

async function save() {
  dialogError.value = ''
  if (!form.value.name.trim() || !form.value.actionKey.trim()) {
    dialogError.value = t('txnAction.nameAndKeyRequired')
    return
  }
  if (!form.value.balanceField) {
    dialogError.value = t('txnAction.balanceRequired')
    return
  }
  if (needReserved.value && !form.value.reservedField) {
    dialogError.value = t('txnAction.reservedRequired')
    return
  }
  const body: TxnActionSaveReq = {
    actionKey: form.value.actionKey.trim(),
    name: form.value.name.trim(),
    actionType: form.value.actionType,
    description: form.value.description || null,
    config: {
      balanceField: form.value.balanceField,
      reservedField: needReserved.value ? form.value.reservedField : undefined,
      keyFields: form.value.keyFields.length > 0 ? form.value.keyFields : undefined,
      expiresInSeconds: needTier.value ? secondsOfTierKey(form.value.tierKey) : undefined,
      nonNegativeAvailable: form.value.nonNegative,
    },
  }
  saving.value = true
  try {
    if (editingId.value) {
      await updateTxnAction(editingId.value, body)
    } else {
      await createTxnAction(selectedFormId.value, body)
    }
    ElMessage.success(t('common.saveSuccess'))
    dialogVisible.value = false
    await loadActions()
  } catch (err) {
    dialogError.value = err instanceof ApiError ? err.msg : t('txnAction.saveFailed')
  } finally {
    saving.value = false
  }
}

/* ─── 发布（结构化错误定位） ─── */

const publishErrors = ref<TxnPublishError[]>([])
const publishErrorVisible = ref(false)
const publishing = ref(false)

async function doPublish(row: TxnActionView, withValidate: boolean) {
  publishing.value = true
  try {
    if (withValidate) {
      const errors = await validateTxnAction(row.id)
      if (errors.length > 0) {
        publishErrors.value = errors
        publishErrorAction.value = row
        publishErrorVisible.value = true
        return
      }
    }
    const updated = await publishTxnAction(row.id)
    ElMessage.success(t('txnAction.publishedHint', { version: updated.currentVersion }))
    await loadActions()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('txnAction.publishFailed'))
  } finally {
    publishing.value = false
  }
}

/** 发布错误字段路径 → 可读标签（不暴露内部 JSON 路径给业务用户）。 */
function locatePublishField(fieldPath: string): string {
  const map: Record<string, string> = {
    'config.balanceField': t('txnAction.balanceField'),
    'config.reservedField': t('txnAction.reservedField'),
    'config.expiresInSeconds': t('txnAction.timelinessTier'),
    'config.quantityScale': t('txnAction.quantityScale'),
    name: t('common.formName'),
    actionType: t('txnAction.actionType'),
  }
  if (fieldPath.startsWith('config.keyFields')) {
    return t('txnAction.traceFields')
  }
  return map[fieldPath] ?? fieldPath
}

/* ─── 调用与结果 ─── */

const invokeVisible = ref(false)
const invokeAction = ref<TxnActionView | null>(null)
const invokeForm = ref({ recordId: '', reservationId: '', quantity: '', invocationKey: '' })
const invokeResult = ref<TxnInvokeResult | null>(null)
const invoking = ref(false)

function resetInvoke() {
  invokeForm.value = { recordId: '', reservationId: '', quantity: '', invocationKey: '' }
  invokeResult.value = null
}

function openInvoke(row: TxnActionView) {
  invokeAction.value = row
  resetInvoke()
  invokeVisible.value = true
}

async function doInvoke() {
  if (!invokeAction.value) return
  invoking.value = true
  invokeResult.value = null
  try {
    invokeResult.value = await invokeTxnAction(invokeAction.value.id, {
      recordId: invokeForm.value.recordId || undefined,
      reservationId: invokeForm.value.reservationId || undefined,
      quantity: invokeForm.value.quantity || undefined,
      invocationKey: invokeForm.value.invocationKey || undefined,
    })
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('txnAction.invokeFailedHint'))
  } finally {
    invoking.value = false
  }
}

const invokeNeedsRecord = computed(
  () => invokeAction.value?.actionType === 'RESERVE' || invokeAction.value?.actionType === 'ADJUST',
)
const invokeNeedsReservation = computed(
  () =>
    invokeAction.value?.actionType === 'CONFIRM' || invokeAction.value?.actionType === 'RELEASE',
)

/** 调用结果 → el-alert 类型（状态映射面用 el-tag 的 danger，el-alert 需要 error）。 */
function invocationAlertType(status: TxnInvokeResult['status']): 'success' | 'warning' | 'error' {
  if (status === 'SUCCEEDED') return 'success'
  if (status === 'REJECTED') return 'warning'
  return 'error'
}

/* ─── 记录 / 预占 / 台账 ─── */

const drawerVisible = ref(false)
const drawerTitle = ref('')
const drawerKind = ref<'records' | 'reservations' | 'ledger'>('records')
const drawerAction = ref<TxnActionView | null>(null)
const drawLoading = ref(false)

const invocations = ref<TxnInvocationView[]>([])
const reservations = ref<TxnReservationView[]>([])
const ledgers = ref<TxnLedgerView[]>([])

async function openDrawer(row: TxnActionView, kind: typeof drawerKind.value) {
  drawerAction.value = row
  drawerKind.value = kind
  drawerTitle.value = `${row.name} · ${
    kind === 'records'
      ? t('txnAction.records')
      : kind === 'reservations'
        ? t('txnAction.reservations')
        : t('txnAction.ledger')
  }`
  drawerVisible.value = true
  await loadDrawer()
}

async function loadDrawer() {
  if (!drawerAction.value) return
  drawLoading.value = true
  try {
    if (drawerKind.value === 'records') {
      invocations.value = (await pageTxnInvocations(drawerAction.value.id, { size: 50 })).list
    } else if (drawerKind.value === 'reservations') {
      reservations.value = (await pageTxnReservations(drawerAction.value.id, { size: 50 })).list
    } else {
      ledgers.value = (await pageTxnLedger(drawerAction.value.id, { size: 50 })).list
    }
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('txnAction.loadFailed'))
  } finally {
    drawLoading.value = false
  }
}

const openRecords = (row: TxnActionView) => openDrawer(row, 'records')
const openReservations = (row: TxnActionView) => openDrawer(row, 'reservations')
const openLedger = (row: TxnActionView) => openDrawer(row, 'ledger')

/* ─── C1 关键数据保护 ─── */

const c1Visible = ref(false)
const c1Saving = ref(false)
const c1Error = ref('')
const c1Form = ref<C1PolicyModel>({
  enabled: false,
  protectedFields: [],
  balanceField: '',
  reservedField: '',
  nonNegativeAvailable: true,
})

async function loadC1() {
  if (!selectedFormId.value) return
  try {
    const view = await getC1Policy(selectedFormId.value)
    let policy: C1PolicyModel = { enabled: plain(view.enabled) }
    if (view.policyJson) {
      try {
        policy = JSON.parse(view.policyJson) as C1PolicyModel
      } catch {
        // 保留 enabled 回退
      }
    }
    c1Form.value = {
      enabled: plain(view.enabled),
      protectedFields: policy.protectedFields ?? [],
      balanceField: policy.balanceField ?? '',
      reservedField: policy.reservedField ?? '',
      nonNegativeAvailable: policy.nonNegativeAvailable !== false,
    }
  } catch {
    // 无策略行时保持默认
  }
}

const plain = (v: boolean) => v === true

function openC1() {
  c1Error.value = ''
  c1Visible.value = true
  loadC1()
}

async function saveC1() {
  c1Error.value = ''
  c1Saving.value = true
  try {
    await saveC1Policy(selectedFormId.value, {
      enabled: c1Form.value.enabled,
      protectedFields: c1Form.value.protectedFields ?? [],
      balanceField: c1Form.value.balanceField || null,
      reservedField: c1Form.value.reservedField || null,
      nonNegativeAvailable: c1Form.value.nonNegativeAvailable,
    })
    ElMessage.success(t('txnAction.c1Saved'))
    c1Visible.value = false
  } catch (err) {
    c1Error.value = err instanceof ApiError ? err.msg : t('txnAction.c1SaveFailed')
  } finally {
    c1Saving.value = false
  }
}

/* ─── 展示工具 ─── */

function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  return value.replace('T', ' ').slice(0, 16)
}

/** 列表中展示动作的时效等级（仅预占动作；不暴露原始秒数）。 */
function tierSummary(row: { configJson?: string | null; actionType?: string }): string {
  if (row.actionType !== 'RESERVE') return '—'
  try {
    const cfg = row.configJson ? (JSON.parse(row.configJson) as { expiresInSeconds?: number }) : {}
    const tier = TIMELINESS_TIERS.find((it) => it.seconds === cfg.expiresInSeconds)
    return tier ? t(tier.labelKey) : '—'
  } catch {
    return '—'
  }
}

/** 发布校验错误对应的动作（用于错误弹窗的「编辑」定位）。 */
const publishErrorAction = ref<TxnActionView | null>(null)

/** 从发布校验错误弹窗进入编辑定位。 */
function editFromPublishError() {
  publishErrorVisible.value = false
  if (publishErrorAction.value) {
    openEdit(publishErrorAction.value)
  }
}

const isEmpty = computed(() => !loading.value && actions.value.length === 0)

onMounted(async () => {
  await loadForms()
  await loadActions()
  await loadFields()
  await loadC1()
})
</script>

<template>
  <div class="txn-action-page">
    <StandardListTemplate
      :title="t('txnAction.title')"
      large
      :total="actions.length"
      :page-num="1"
      :page-size="20"
      :empty="isEmpty"
    >
      <template #toolbar-actions>
        <el-select
          v-model="selectedFormId"
          :placeholder="t('txnAction.selectForm')"
          style="width: 260px; margin-right: 12px"
          @change="handleFormChange"
        >
          <el-option v-for="f in forms" :key="f.id" :label="f.name" :value="f.id" />
        </el-select>
        <el-button type="primary" :disabled="!selectedFormId" @click="openCreate">
          {{ t('txnAction.newAction') }}
        </el-button>
        <el-button v-if="can('publish')" :disabled="!selectedFormId" @click="openC1">
          {{ t('txnAction.c1Protection') }}
        </el-button>
      </template>

      <el-alert
        v-if="errorMsg"
        :title="errorMsg"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      />
      <el-table v-loading="loading" :data="actions" stripe>
        <el-table-column prop="name" :label="t('txnAction.actionName')" min-width="160" />
        <el-table-column :label="t('txnAction.actionType')" width="120">
          <template #default="{ row }">{{
            ACTION_TYPE_MAP[row.actionType as TxnActionType]
          }}</template>
        </el-table-column>
        <el-table-column :label="t('txnAction.status')" width="100">
          <template #default="{ row }">
            <el-tag
              :type="ACTION_STATUS_MAP[row.status as keyof typeof ACTION_STATUS_MAP]?.type"
              size="small"
            >
              {{ ACTION_STATUS_MAP[row.status as keyof typeof ACTION_STATUS_MAP]?.label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('txnAction.version')" width="90">
          <template #default="{ row }">
            {{
              row.currentVersion
                ? t('txnAction.versionValue', { version: row.currentVersion })
                : '—'
            }}
          </template>
        </el-table-column>
        <el-table-column :label="t('txnAction.timelinessTier')" width="130">
          <template #default="{ row }">
            {{ tierSummary(row) }}
          </template>
        </el-table-column>
        <el-table-column prop="updateTime" :label="t('common.updateTime')" width="160">
          <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
        </el-table-column>
        <ListActionsColumn :actions="rowActions" :width="260" />
      </el-table>

      <template #empty-action>
        <span>{{ t('txnAction.emptyHint') }}</span>
      </template>
    </StandardListTemplate>

    <!-- 新建/编辑 -->
    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? t('txnAction.editAction') : t('txnAction.newAction')"
      width="560px"
    >
      <el-alert
        v-if="dialogError"
        :title="dialogError"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      />
      <el-form label-width="120px">
        <el-form-item :label="t('txnAction.actionName')" required>
          <el-input v-model="form.name" maxlength="200" />
        </el-form-item>
        <el-form-item :label="t('txnAction.actionKey')" required>
          <el-input
            v-model="form.actionKey"
            :disabled="!!editingId"
            :placeholder="t('txnAction.actionKeyHint')"
          />
        </el-form-item>
        <el-form-item :label="t('txnAction.actionType')" required>
          <el-select
            v-model="form.actionType"
            :disabled="!!editingId && editingStatus !== 'DRAFT'"
            style="width: 100%"
          >
            <el-option
              v-for="(label, key) in ACTION_TYPE_MAP"
              :key="key"
              :label="label"
              :value="key"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('txnAction.balanceField')" required>
          <el-select v-model="form.balanceField" style="width: 100%">
            <el-option v-for="f in numberFields" :key="f.name" :label="f.label" :value="f.name" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="needReserved" :label="t('txnAction.reservedField')" required>
          <el-select v-model="form.reservedField" style="width: 100%">
            <el-option v-for="f in numberFields" :key="f.name" :label="f.label" :value="f.name" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="needTier" :label="t('txnAction.timelinessTier')">
          <el-select v-model="form.tierKey" style="width: 100%">
            <el-option
              v-for="tier in TIMELINESS_TIERS"
              :key="tier.key"
              :label="t(tier.labelKey)"
              :value="tier.key"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('txnAction.traceFields')">
          <el-select v-model="form.keyFields" multiple clearable style="width: 100%">
            <el-option
              v-for="f in keyFieldOptions"
              :key="f.name"
              :label="f.label"
              :value="f.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('txnAction.nonNegative')">
          <el-switch v-model="form.nonNegative" />
        </el-form-item>
        <el-form-item :label="t('txnAction.description')">
          <el-input v-model="form.description" type="textarea" :rows="2" maxlength="500" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 发布校验错误定位 -->
    <el-dialog v-model="publishErrorVisible" :title="t('txnAction.publishBlocked')" width="520px">
      <el-alert type="warning" :closable="false" show-icon style="margin-bottom: 12px">
        {{ t('txnAction.publishBlockedHint') }}
      </el-alert>
      <ul class="txn-action-page__errors">
        <li v-for="(e, i) in publishErrors" :key="i">
          <el-tag type="danger" size="small">{{ locatePublishField(e.field) }}</el-tag>
          <span>{{ e.message }}</span>
        </li>
      </ul>
      <template #footer>
        <el-button @click="publishErrorVisible = false">{{ t('common.close') }}</el-button>
        <el-button type="primary" @click="editFromPublishError">{{ t('common.edit') }}</el-button>
      </template>
    </el-dialog>

    <!-- 调用 -->
    <el-dialog
      v-model="invokeVisible"
      :title="`${t('txnAction.invoke')} · ${invokeAction?.name ?? ''}`"
      width="520px"
    >
      <el-form label-width="110px">
        <el-form-item v-if="invokeNeedsRecord" :label="t('txnAction.targetRecord')" required>
          <el-input v-model="invokeForm.recordId" :placeholder="t('txnAction.targetRecordHint')" />
        </el-form-item>
        <el-form-item v-if="invokeNeedsReservation" :label="t('txnAction.reservationId')" required>
          <el-input
            v-model="invokeForm.reservationId"
            :placeholder="t('txnAction.reservationIdHint')"
          />
        </el-form-item>
        <el-form-item
          v-if="
            invokeAction &&
            invokeAction.actionType !== 'CONFIRM' &&
            invokeAction.actionType !== 'RELEASE'
          "
          :label="t('txnAction.quantity')"
          required
        >
          <el-input v-model="invokeForm.quantity" :placeholder="t('txnAction.quantityHint')" />
        </el-form-item>
        <el-form-item :label="t('txnAction.invocationKey')">
          <el-input
            v-model="invokeForm.invocationKey"
            :placeholder="t('txnAction.invocationKeyHint')"
          />
        </el-form-item>
      </el-form>
      <el-alert
        v-if="invokeResult"
        :title="`${INVOCATION_STATUS_MAP[invokeResult.status].label}${invokeResult.replay ? `（${t('txnAction.replayed')}）` : ''}`"
        :type="invocationAlertType(invokeResult.status)"
        :closable="false"
        show-icon
      >
        <div v-if="invokeResult.errorMsg">{{ invokeResult.errorMsg }}</div>
        <div v-else>
          <span>{{ t('txnAction.quantity') }}：{{ invokeResult.quantity ?? '—' }}</span>
          <span style="margin-left: 12px"
            >{{ t('txnAction.balanceAfter') }}：{{ invokeResult.balanceAfter ?? '—' }}</span
          >
          <span style="margin-left: 12px"
            >{{ t('txnAction.reservedAfter') }}：{{ invokeResult.reservedAfter ?? '—' }}</span
          >
        </div>
        <div class="txn-action-page__invocation-id">
          {{ t('txnAction.invocationId') }}：{{ invokeResult.invocationId }}
        </div>
        <div v-if="invokeResult.reservationId" class="txn-action-page__invocation-id">
          {{ t('txnAction.reservationId') }}：{{ invokeResult.reservationId }}
        </div>
      </el-alert>
      <template #footer>
        <el-button @click="invokeVisible = false">{{ t('common.close') }}</el-button>
        <el-button type="primary" :loading="invoking" @click="doInvoke">{{
          t('txnAction.invokeNow')
        }}</el-button>
      </template>
    </el-dialog>

    <!-- 记录 / 预占 / 台账 -->
    <el-drawer v-model="drawerVisible" :title="drawerTitle" size="620px">
      <div v-loading="drawLoading">
        <el-table v-if="drawerKind === 'records'" :data="invocations" stripe>
          <el-table-column prop="createTime" :label="t('common.createTime')" width="150">
            <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
          </el-table-column>
          <el-table-column
            prop="invocationKey"
            :label="t('txnAction.invocationKey')"
            min-width="140"
          />
          <el-table-column :label="t('txnAction.status')" width="100">
            <template #default="{ row }">
              <el-tag
                :type="
                  INVOCATION_STATUS_MAP[row.status as keyof typeof INVOCATION_STATUS_MAP]?.type
                "
                size="small"
              >
                {{ INVOCATION_STATUS_MAP[row.status as keyof typeof INVOCATION_STATUS_MAP]?.label }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="errorMsg" :label="t('txnAction.resultNote')" min-width="160" />
        </el-table>
        <el-table v-else-if="drawerKind === 'reservations'" :data="reservations" stripe>
          <el-table-column prop="createTime" :label="t('common.createTime')" width="150">
            <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
          </el-table-column>
          <el-table-column prop="id" :label="t('txnAction.reservationId')" min-width="170" />
          <el-table-column prop="recordId" :label="t('txnAction.targetRecord')" min-width="120" />
          <el-table-column prop="quantity" :label="t('txnAction.quantity')" width="100" />
          <el-table-column :label="t('txnAction.status')" width="100">
            <template #default="{ row }">
              <el-tag
                :type="
                  RESERVATION_STATUS_MAP[row.status as keyof typeof RESERVATION_STATUS_MAP]?.type
                "
                size="small"
              >
                {{
                  RESERVATION_STATUS_MAP[row.status as keyof typeof RESERVATION_STATUS_MAP]?.label
                }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="expiresAt" :label="t('txnAction.expiresAt')" width="150">
            <template #default="{ row }">{{ formatDateTime(row.expiresAt) }}</template>
          </el-table-column>
        </el-table>
        <el-table v-else :data="ledgers" stripe>
          <el-table-column prop="createTime" :label="t('common.createTime')" width="150">
            <template #default="{ row }">{{ formatDateTime(row.createTime) }}</template>
          </el-table-column>
          <el-table-column :label="t('txnAction.ledgerType')" width="100">
            <template #default="{ row }">{{
              LEDGER_TYPE_MAP[row.entryType as TxnLedgerView['entryType']]
            }}</template>
          </el-table-column>
          <el-table-column prop="quantity" :label="t('txnAction.quantity')" width="100" />
          <el-table-column prop="balanceAfter" :label="t('txnAction.balanceAfter')" width="110" />
          <el-table-column prop="reservedAfter" :label="t('txnAction.reservedAfter')" width="110" />
          <el-table-column prop="recordId" :label="t('txnAction.targetRecord')" min-width="120" />
        </el-table>
      </div>
    </el-drawer>

    <!-- C1 关键数据保护 -->
    <el-dialog
      v-model="c1Visible"
      :title="`${t('txnAction.c1Protection')} · ${selectedFormName}`"
      width="560px"
    >
      <el-alert type="info" :closable="false" show-icon style="margin-bottom: 12px">
        {{ t('txnAction.c1Hint') }}
      </el-alert>
      <el-alert
        v-if="c1Error"
        :title="c1Error"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      />
      <el-form label-width="130px">
        <el-form-item :label="t('txnAction.c1Enable')">
          <el-switch v-model="c1Form.enabled" />
        </el-form-item>
        <el-form-item :label="t('txnAction.c1ProtectedFields')">
          <el-select
            v-model="c1Form.protectedFields"
            multiple
            clearable
            style="width: 100%"
            :disabled="!c1Form.enabled"
          >
            <el-option v-for="f in allFields" :key="f.name" :label="f.label" :value="f.name" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('txnAction.balanceField')">
          <el-select
            v-model="c1Form.balanceField"
            clearable
            style="width: 100%"
            :disabled="!c1Form.enabled"
          >
            <el-option v-for="f in numberFields" :key="f.name" :label="f.label" :value="f.name" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('txnAction.reservedField')">
          <el-select
            v-model="c1Form.reservedField"
            clearable
            style="width: 100%"
            :disabled="!c1Form.enabled"
          >
            <el-option v-for="f in numberFields" :key="f.name" :label="f.label" :value="f.name" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('txnAction.nonNegative')">
          <el-switch v-model="c1Form.nonNegativeAvailable" :disabled="!c1Form.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="c1Visible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="c1Saving" @click="saveC1">{{
          t('common.save')
        }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.txn-action-page__errors {
  margin: 0;
  padding-left: 18px;
}
.txn-action-page__errors li {
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.txn-action-page__invocation-id {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  word-break: break-all;
}
</style>
