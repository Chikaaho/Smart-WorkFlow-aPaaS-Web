<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * NotifyRuleList — 通知规则管理页（I6）。
 * 事件开关、接收人规则、渠道顺序与失败策略；启停即时生效且构造请求受服务端拒绝。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import type { NotifyRule, NotifyRuleSaveReq } from '@/contracts/notify'
import {
  pageNotifyRules,
  createNotifyRule,
  updateNotifyRule,
  deleteNotifyRule,
  toggleNotifyRule,
} from '@/modules/notify/api'

const list = ref<NotifyRule[]>([])
const total = ref(0)
const loading = ref(false)
const errorMsg = ref('')
const pageNum = ref(1)
const pageSize = ref(20)

const filterEventType = ref('')

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

const EVENT_OPTIONS = [
  'TODO_CREATED',
  'PROCESS_APPROVED',
  'PROCESS_REJECTED',
  'PROCESS_RETURNED',
  'PROCESS_WITHDRAWN',
  'PROCESS_DISAPPROVED',
  'PROCESS_DISCARDED',
  'TASK_TRANSFERRED',
  'TASK_DELEGATED',
  'TASK_COMMUNICATED',
  'TASK_SIGN_REQUESTED',
  'TASK_DEADLINE_ALERT',
  'TASK_URGE',
]

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageNotifyRules(pageQuery, {
      eventType: filterEventType.value || undefined,
    })
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
      ElMessage.error(err.msg)
    } else {
      errorMsg.value = t('notify.rulesLoadFailed')
      ElMessage.error(t('notify.rulesLoadFailed'))
    }
  } finally {
    loading.value = false
  }
}

const editing = ref(false)
const saving = ref(false)
const form = ref<NotifyRuleSaveReq>(emptyForm())

function emptyForm(): NotifyRuleSaveReq {
  return {
    ruleCode: '',
    name: '',
    eventType: 'TODO_CREATED',
    channelPriority: 'IN_APP',
    recipientRule: 'ASSIGNEE',
    requiredFlag: false,
    failurePolicy: 'RETRY',
    enabled: true,
    remark: '',
  }
}

function openCreate() {
  editing.value = false
  form.value = emptyForm()
}

function openEdit(row: NotifyRule) {
  editing.value = true
  form.value = {
    ruleCode: row.ruleCode,
    name: row.name,
    eventType: row.eventType,
    channelPriority: row.channelPriority,
    recipientRule: row.recipientRule,
    requiredFlag: row.requiredFlag,
    failurePolicy: row.failurePolicy,
    enabled: row.enabled,
    remark: row.remark ?? '',
  }
}

async function submitForm() {
  saving.value = true
  try {
    if (editing.value) {
      await updateNotifyRule(currentId, form.value)
    } else {
      await createNotifyRule(form.value)
    }
    ElMessage.success(t('common.saveSuccess'))
    dialogVisible.value = false
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error(t('common.saveFailed'))
  } finally {
    saving.value = false
  }
}

let currentId = 0
const dialogVisible = ref(false)

function handleCreate() {
  openCreate()
  dialogVisible.value = true
}

function handleEdit(row: NotifyRule) {
  openEdit(row)
  currentId = row.id
  dialogVisible.value = true
}

async function handleToggle(row: NotifyRule, enabled: boolean) {
  try {
    await toggleNotifyRule(row.id, enabled)
    ElMessage.success(t('common.updated'))
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error(t('common.operationFailed'))
    await loadList()
  }
}

async function handleDelete(row: NotifyRule) {
  try {
    await ElMessageBox.confirm(
      t('notify.confirmDeleteRule', { ruleCode: row.ruleCode }),
      t('common.deleteConfirmTitle'),
      {
        type: 'warning',
      },
    )
  } catch {
    return
  }
  try {
    await deleteNotifyRule(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error(t('common.deleteFailed'))
  }
}

/** 统一操作列（V012-BUG-002）：启停走行内开关列，此处仅编辑/删除 */
function rowActions(r: unknown): ListAction[] {
  const row = r as NotifyRule
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      onClick: () => handleEdit(row),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      onClick: () => handleDelete(row),
    },
  ]
}

function handlePageNumChange(p: number) {
  pageNum.value = p
  void loadList()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
  void loadList()
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('notify.rules')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #page-action>
      <el-button type="primary" @click="handleCreate">{{ t('common.newRule') }}</el-button>
    </template>
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <el-table v-loading="loading" :data="list" stripe style="width: 100%">
      <el-table-column prop="ruleCode" :label="t('notify.ruleCode')" width="180" />
      <el-table-column prop="name" :label="t('common.name')" min-width="150" />
      <el-table-column prop="eventType" :label="t('common.event')" min-width="160" />
      <el-table-column prop="channelPriority" :label="t('notify.channelOrder')" min-width="140" />
      <el-table-column prop="recipientRule" :label="t('notify.recipientRule')" min-width="140" />
      <el-table-column :label="t('notify.mustDeliver')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.requiredFlag ? 'danger' : 'info'" size="small" disable-transitions>
            {{ row.requiredFlag ? t('notify.requiredTag') : t('notify.optionalTag') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.enable')" width="90">
        <template #default="{ row }">
          <el-switch
            :model-value="row.enabled"
            @update:model-value="(v: unknown) => handleToggle(row as NotifyRule, v === true)"
          />
        </template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :width="120" />
    </el-table>

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? t('notify.editRule') : t('common.newRule')"
      width="560px"
    >
      <el-form label-width="100px">
        <el-form-item :label="t('notify.ruleCode')" required>
          <el-input
            v-model="form.ruleCode"
            :disabled="editing"
            :placeholder="t('notify.ruleCodePlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('common.name')" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('common.event')" required>
          <el-select v-model="form.eventType" filterable style="width: 100%">
            <el-option v-for="e in EVENT_OPTIONS" :key="e" :label="e" :value="e" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('notify.channelOrder')" required>
          <el-input
            v-model="form.channelPriority"
            :placeholder="t('notify.channelOrderPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('notify.recipientRule')" required>
          <el-input
            v-model="form.recipientRule"
            :placeholder="t('notify.recipientRulePlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('notify.mustDeliver')">
          <el-switch v-model="form.requiredFlag" />
        </el-form-item>
        <el-form-item :label="t('notify.failurePolicy')">
          <el-select v-model="form.failurePolicy" style="width: 100%">
            <el-option :label="t('notify.failurePolicyRetry')" value="RETRY" />
            <el-option :label="t('notify.failurePolicyManual')" value="MANUAL" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.enable')">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item :label="t('common.remark')">
          <el-input v-model="form.remark" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">{{
          t('common.save')
        }}</el-button>
      </template>
    </el-dialog>
  </StandardListTemplate>
</template>
