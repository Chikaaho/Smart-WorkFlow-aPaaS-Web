<script setup lang="ts">
/**
 * NotifyRuleList — 通知规则管理页（I6）。
 * 事件开关、接收人规则、渠道顺序与失败策略；启停即时生效且构造请求受服务端拒绝。
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
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
      errorMsg.value = '加载通知规则失败'
      ElMessage.error('加载通知规则失败')
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
    ElMessage.success('保存成功')
    dialogVisible.value = false
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error('保存失败')
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
    ElMessage.success('已更新')
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error('操作失败')
    await loadList()
  }
}

async function handleDelete(row: NotifyRule) {
  try {
    await ElMessageBox.confirm(`确定删除通知规则 ${row.ruleCode} 吗？`, '删除确认', {
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteNotifyRule(row.id)
    ElMessage.success('删除成功')
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error('删除失败')
  }
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="通知规则"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
  >
    <template #page-action>
      <el-button type="primary" @click="handleCreate">新建规则</el-button>
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
      <el-table-column prop="ruleCode" label="规则编码" width="180" />
      <el-table-column prop="name" label="名称" min-width="150" />
      <el-table-column prop="eventType" label="事件" min-width="160" />
      <el-table-column prop="channelPriority" label="渠道顺序" min-width="140" />
      <el-table-column prop="recipientRule" label="接收人规则" min-width="140" />
      <el-table-column label="必须送达" width="100">
        <template #default="{ row }">
          <el-tag :type="row.requiredFlag ? 'danger' : 'info'" size="small" disable-transitions>
            {{ row.requiredFlag ? '必须' : '可选' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="启用" width="90">
        <template #default="{ row }">
          <el-switch
            :model-value="row.enabled"
            @update:model-value="(v: unknown) => handleToggle(row as NotifyRule, v === true)"
          />
        </template>
      </el-table-column>
      <el-table-column label="操作" width="140" fixed="right">
        <template #default="{ row }">
          <el-button size="small" text type="primary" @click="handleEdit(row as NotifyRule)"
            >编辑</el-button
          >
          <el-button size="small" text type="danger" @click="handleDelete(row as NotifyRule)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editing ? '编辑规则' : '新建规则'" width="560px">
      <el-form label-width="100px">
        <el-form-item label="规则编码" required>
          <el-input v-model="form.ruleCode" :disabled="editing" placeholder="字母开头，2-99 位" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="事件" required>
          <el-select v-model="form.eventType" filterable style="width: 100%">
            <el-option v-for="e in EVENT_OPTIONS" :key="e" :label="e" :value="e" />
          </el-select>
        </el-form-item>
        <el-form-item label="渠道顺序" required>
          <el-input v-model="form.channelPriority" placeholder="如 IN_APP,EMAIL" />
        </el-form-item>
        <el-form-item label="接收人规则" required>
          <el-input
            v-model="form.recipientRule"
            placeholder="如 ASSIGNEE / ROLE:admin / INITIATOR"
          />
        </el-form-item>
        <el-form-item label="必须送达">
          <el-switch v-model="form.requiredFlag" />
        </el-form-item>
        <el-form-item label="失败策略">
          <el-select v-model="form.failurePolicy" style="width: 100%">
            <el-option label="自动重试（RETRY）" value="RETRY" />
            <el-option label="人工处理（MANUAL）" value="MANUAL" />
          </el-select>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitForm">保存</el-button>
      </template>
    </el-dialog>
  </StandardListTemplate>
</template>
