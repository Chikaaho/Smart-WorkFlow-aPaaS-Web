<script setup lang="ts">
/**
 * MobileWorkspace — 移动端统一工作台（I4 §3.7，响应式 H5 正式形态）。
 * 覆盖：待办详情（任务/业务表单数据回显）、正式意见表单动态渲染（必填/显隐/初值）、
 * 发起入口、草稿、结果查询。与 PC 同一业务对象/API/权限（foundation/request +
 * 服务端当前身份），复杂意见表单在 H5 内原生完成，不以静态页或桌面跳转代替。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  queryTodoTasks,
  myDrafts,
  myInstances,
  acceptTaskAction,
  pollCommandStatus,
  queryTaskDetail,
} from '@/modules/workflow/api'
import type { PageQuery } from '@/contracts/common'
import type { TaskDetail } from '@/contracts/bpm'
import { ApiError } from '@/foundation/request'
import { getFormData, getFormDefinition } from '@/modules/form/api/form'
import type { FormSchema } from '@/contracts/form-schema'

type MobileTab = 'todo' | 'initiated' | 'drafts'

const router = useRouter()
const activeTab = ref<MobileTab>('todo')
const loading = ref(false)
const errorMsg = ref('')

interface Row {
  taskId?: string
  id?: string | number
  name?: string
  processDefinitionKey?: string
  formKey?: string
  status?: string
  createTime?: string
}

const rows = ref<Row[]>([])

// ─── 详情面板状态（R5：任务详情 + 业务表单数据 + 正式意见表单） ───
const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<TaskDetail | null>(null)
const formRecord = ref<Record<string, unknown> | null>(null)
const formSchema = ref<FormSchema | null>(null)
/** REFERENCE 字段显示名缓存（id→可读关联对象信息，授权单查解析，取不到回退 id）。 */
const refDisplayMap = ref<Record<string, string>>({})
const opinionData = ref<Record<string, unknown>>({})
const submitting = ref(false)
const submitError = ref('')

/** 表单宽表的系统列：与业务数据无关，不在详情展示（与 PC TaskDetail 同一口径）。 */
const SYSTEM_COLUMNS = new Set([
  'id',
  'create_by',
  'create_time',
  'update_by',
  'update_time',
  'del_flag',
  'tenant_id',
  'version',
])

const isEmpty = computed(() => !loading.value && !errorMsg.value && rows.value.length === 0)

type OpinionField = NonNullable<NonNullable<TaskDetail['opinionForm']>['fields']>[number]

async function loadTab(tab: MobileTab) {
  loading.value = true
  errorMsg.value = ''
  const page: PageQuery = { pageNum: 1, pageSize: 20 }
  try {
    if (tab === 'todo') {
      rows.value = (await queryTodoTasks(page)).list as unknown as Row[]
    } else if (tab === 'initiated') {
      rows.value = (await myInstances(page)).list as unknown as Row[]
    } else {
      rows.value = (await myDrafts(page)).list as unknown as Row[]
    }
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : '加载失败'
  } finally {
    loading.value = false
  }
}

async function resolveRefDisplays() {
  refDisplayMap.value = {}
  if (!formSchema.value || !formRecord.value) return
  const { resolveReferenceDisplay } = await import('@/modules/form/utils/resolve-reference-display')
  for (const field of formSchema.value.fields) {
    if (field.type !== 'REFERENCE') continue
    const refId = formRecord.value['ref_' + field.name + '_id']
    if (refId == null || refId === '') continue
    try {
      refDisplayMap.value[field.name] = await resolveReferenceDisplay(String(field.targetFormId ?? ''), String(refId))
    } catch {
      refDisplayMap.value[field.name] = String(refId)
    }
  }
}

async function openTask(row: Row) {
  const taskId = String(row.taskId ?? '')
  if (!taskId) return
  detailVisible.value = true
  detailLoading.value = true
  detail.value = null
  formRecord.value = null
  formSchema.value = null
  opinionData.value = {}
  submitError.value = ''
  try {
    detail.value = await queryTaskDetail(taskId)
    initializeOpinionData()
    if (detail.value?.formKey && detail.value?.businessKey) {
      try {
        formRecord.value = await getFormData(
          detail.value.formKey,
          detail.value.businessKey,
        )
        try {
          formSchema.value = await getFormDefinition(detail.value.formKey)
        } catch {
          formSchema.value = null
        }
        await resolveRefDisplays()
      } catch {
        formRecord.value = null
      }
    }
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.msg : '加载任务详情失败'
  } finally {
    detailLoading.value = false
  }
}

/** 表单数据行：按 schema 字段顺序输出业务标签（外键/业务值经只读接口授权回显）。 */
const formFieldRows = computed(() => {
  if (!formRecord.value) return []
  const out: { key: string; label: string; value: string; attachments?: { storageKey: string; name: string }[] }[] = []
  const seen = new Set<string>()
  if (formSchema.value) {
    for (const field of formSchema.value.fields) {
      const recordKey = field.type === 'REFERENCE' ? 'ref_' + field.name + '_id' : field.name
      if (SYSTEM_COLUMNS.has(field.name) || !(recordKey in formRecord.value)) continue
      seen.add(field.name)
      const v = formRecord.value[recordKey]
      // ATTACHMENT/IMAGE 字段：除 storageKey 原始值外，给出授权下载入口（文件名 + key 元数据）
      let attachments: { storageKey: string; name: string }[] | undefined
      if (field.type === 'ATTACHMENT' || field.type === 'IMAGE') {
        try {
          const parsed = typeof v === 'string' ? JSON.parse(v) : v
          if (Array.isArray(parsed)) {
            // 契约值 = storageKey 字符串数组；兼容携带文件名的对象数组
            attachments = parsed
              .map((it): { storageKey: string; name: string } | null => {
                if (typeof it === 'string' && it !== '') {
                  const seg = it.split('/').pop() ?? it
                  return { storageKey: it, name: seg }
                }
                if (it && typeof it === 'object' && typeof (it as { storageKey?: unknown }).storageKey === 'string') {
                  const key = it.storageKey as string
                  const name = (it as { name?: unknown }).name
                  return typeof name === 'string' && name !== '' ? { storageKey: key, name } : { storageKey: key, name: key.split('/').pop() ?? key }
                }
                return null
              })
              .filter((it): it is { storageKey: string; name: string } => it !== null)
          }
        } catch {
          attachments = undefined
        }
      }
      out.push({ key: field.name, label: field.label || field.name, value: v == null || v === '' ? '-' : (field.type === 'REFERENCE' ? refDisplayMap.value[field.name] ?? String(v) : String(v)), attachments })
    }
  }
  for (const [k, v] of Object.entries(formRecord.value)) {
    if (SYSTEM_COLUMNS.has(k) || seen.has(k)) continue
    out.push({ key: k, label: k, value: v == null || v === '' ? '-' : String(v) })
  }
  return out
})

/** 下载入口与详情同源：按记录（businessKey）对象权限放行，未授权由后端拒绝。 */
const attachmentBase = '/api'

function attachmentDownloadUrl(storageKey: string, name: string): string {
  return `${attachmentBase}/workflow/attachments/${detail.value?.businessKey ?? ''}/download?storageKey=${encodeURIComponent(storageKey)}&name=${encodeURIComponent(name)}`
}

// ─── 正式意见表单：动态字段渲染（与 PC 同一配置与校验口径） ───
const opinionFields = computed(() => detail.value?.opinionForm?.fields ?? [])
const hasOpinionForm = computed(() => (detail.value?.opinionForm?.fields ?? []).length > 0)

function resolveOpinionVariable(expression: string): unknown {
  const variables = detail.value?.processVariables ?? {}
  const dot = expression.indexOf('.')
  if (expression.startsWith('variable.') && dot > 0) {
    const key = expression.slice(dot + 1)
    return (variables as Record<string, unknown>)[key]
  }
  return (variables as Record<string, unknown>)[expression]
}

function isOpinionFieldVisible(field: OpinionField): boolean {
  const visibleWhen = field.visibleWhen
  if (!visibleWhen) return true
  // 受控表达式仅支持「variable.<key> == <值>」单比较，与 PC 可见性口径一致；无法解析不展示
  const match = /^(variable\.[A-Za-z0-9_]+)\s*==\s*(.+)$/.exec(visibleWhen)
  if (!match) return true
  const actual = resolveOpinionVariable(match[1])
  const expected = match[2].trim().replace(/^['"]|['"]$/g, '')
  return String(actual) === expected
}

const visibleOpinionFields = computed(() => opinionFields.value.filter(isOpinionFieldVisible))

function initializeOpinionData() {
  const initial: Record<string, unknown> = {}
  for (const field of detail.value?.opinionForm?.fields ?? []) {
    if (!field.initialExpression || !isOpinionFieldVisible(field)) continue
    const value = resolveOpinionVariable(field.initialExpression)
    if (value !== undefined) initial[field.key] = value
  }
  opinionData.value = { ...initial }
}

function opinionFieldValue(field: OpinionField): unknown {
  return opinionData.value[field.key]
}

function setOpinionFieldValue(key: string, value: unknown) {
  opinionData.value[key] = value
}

function opinionRequiredMissing(): boolean {
  return visibleOpinionFields.value.some((field) => {
    if (!field.required || field.type === 'NOTE') return false
    const value = opinionData.value[field.key]
    return value == null || (typeof value === 'string' && value.trim() === '')
  })
}

async function submitHandle(action: 'APPROVE' | 'DISAPPROVE') {
  if (!detail.value) return
  // 反向：缺必填在 H5 内确定拒绝（后端 ApprovalOpinionValidator 同口径二次把关）
  if (hasOpinionForm.value && opinionRequiredMissing()) {
    ElMessage.warning('请填写必填审批意见')
    return
  }
  submitting.value = true
  submitError.value = ''
  try {
    const payload: Record<string, unknown> = hasOpinionForm.value
      ? {
          opinionFormId: detail.value.opinionForm?.formId,
          opinionFormVersion: detail.value.opinionForm?.version,
          opinionData: { ...opinionData.value },
        }
      : { comment: '' }
    // 与 PC 同一命令受理链：受理后轮询命令终态，不以受理代替成功
    const accepted = await acceptTaskAction(
      detail.value.taskId,
      action === 'APPROVE' ? 'complete' : 'reject',
      payload,
    )
    const finalStatus = await pollCommandStatus(accepted.commandId)
    if (finalStatus?.status === 'COMPLETED') {
      ElMessage.success('已办理')
      detailVisible.value = false
      await loadTab('todo')
    } else if (finalStatus?.status === 'FAILED') {
      submitError.value = finalStatus.failureReason || '办理失败（命令执行失败）'
    } else {
      ElMessage.info('处理中，请稍后在列表确认')
      detailVisible.value = false
    }
  } catch (err) {
    submitError.value = err instanceof ApiError ? err.msg : '办理失败'
  } finally {
    submitting.value = false
  }
}

function rowTitle(row: Row): string {
  return row.name || row.processDefinitionKey || String(row.taskId ?? row.id ?? '')
}

function handleTabChange(tab: string | number) {
  void loadTab(tab as MobileTab)
}

function opinionInputType(field: OpinionField): string {
  if (field.type === 'NUMBER') return 'number'
  if (field.type === 'DATETIME') return 'datetime-local'
  return 'text'
}

onMounted(() => void loadTab('todo'))
</script>

<template>
  <div class="mobile-workspace">
    <header class="m-header">
      <h1 class="m-title">工作台</h1>
      <el-button link type="primary" @click="router.push('/m/form/leave_form')"> 发起 </el-button>
    </header>

    <el-tabs v-model="activeTab" @tab-change="handleTabChange">
      <el-tab-pane label="待办" name="todo" />
      <el-tab-pane label="我发起的" name="initiated" />
      <el-tab-pane label="草稿" name="drafts" />
    </el-tabs>

    <el-alert v-if="errorMsg" :title="errorMsg" type="error" :closable="false" />

    <ul v-loading="loading" class="m-list">
      <li
        v-for="(row, index) in rows"
        :key="row.taskId ?? row.id ?? index"
        class="m-item"
        @click="activeTab === 'todo' ? openTask(row) : undefined"
      >
        <div class="m-item-title">{{ rowTitle(row) }}</div>
        <div class="m-item-meta">
          <span>{{ row.status || (activeTab === 'todo' ? '待办理' : '—') }}</span>
          <span>{{ row.createTime || '' }}</span>
        </div>
      </li>
      <li v-if="isEmpty" class="m-item m-empty">暂无数据</li>
    </ul>

    <!-- 详情面板：任务/业务表单详情 + 正式意见表单 -->
    <el-drawer v-model="detailVisible" size="92%" direction="btt" class="m-detail">
      <template #title>
        <span class="m-detail-title">{{ detail?.taskName || '任务详情' }}</span>
      </template>
      <div v-loading="detailLoading" class="m-detail-body">
        <el-alert v-if="submitError" :title="submitError" type="error" :closable="false" />

        <template v-if="detail">
          <section class="m-section">
            <h3 class="m-section-title">任务信息</h3>
            <div class="m-kv"><span>流程名称</span><b>{{ detail.processName || detail.processDefinitionKey }}</b></div>
            <div class="m-kv"><span>发起人</span><b>{{ detail.initiatorName || detail.initiatorId || '—' }}</b></div>
            <div class="m-kv"><span>当前办理人</span><b>{{ detail.assigneeName || detail.assignee || '—' }}</b></div>
            <div class="m-kv"><span>业务单号</span><b>{{ detail.businessKey || '—' }}</b></div>
            <div class="m-kv"><span>创建时间</span><b>{{ detail.createTime || '—' }}</b></div>
          </section>

          <section class="m-section">
            <h3 class="m-section-title">表单数据（本次提交）</h3>
            <template v-if="formFieldRows.length">
              <div v-for="row in formFieldRows" :key="row.key" class="m-kv">
                <span>{{ row.label }}</span>
                <span v-if="row.attachments" class="m-att-list">
                  <a
                    v-for="att in row.attachments"
                    :key="att.storageKey"
                    class="m-att-link"
                    :href="attachmentDownloadUrl(att.storageKey, att.name)"
                    target="_blank"
                  >{{ att.name }}</a>
                </span>
                <b v-else>{{ row.value }}</b>
              </div>
            </template>
            <p v-else class="m-empty-line">表单记录加载失败或已不存在</p>
          </section>

          <section class="m-section">
            <h3 class="m-section-title">{{ hasOpinionForm ? '审批意见（正式意见表单）' : '审批意见' }}</h3>
            <div v-for="field in visibleOpinionFields" :key="field.key" class="m-opinion-field">
              <template v-if="field.type === 'NOTE'">
                <span class="m-opinion-note">{{ field.label }}</span>
              </template>
              <template v-else>
                <label :for="`op-${field.key}`" class="m-opinion-label">
                  {{ field.label || field.key }}<span v-if="field.required" class="m-required"> *</span>
                </label>
                <textarea
                  v-if="field.type === 'TEXTAREA'"
                  :id="`op-${field.key}`"
                  class="m-input"
                  rows="3"
                  :maxlength="field.maxLength"
                  :value="(opinionFieldValue(field) as string) ?? ''"
                  @input="setOpinionFieldValue(field.key, ($event.target as HTMLTextAreaElement).value)"
                />
                <select
                  v-else-if="field.type === 'SELECT'"
                  :id="`op-${field.key}`"
                  class="m-input"
                  :value="String(opinionFieldValue(field) ?? '')"
                  @change="setOpinionFieldValue(field.key, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">请选择</option>
                  <option v-for="option in field.options ?? []" :key="option" :value="option">
                    {{ option }}
                  </option>
                </select>
                <div v-else-if="field.type === 'RADIO'" class="m-opinion-options">
                  <label v-for="option in field.options ?? []" :key="option" class="m-opinion-option">
                    <input
                      type="radio"
                      :name="`op-${field.key}`"
                      :value="option"
                      :checked="opinionFieldValue(field) === option"
                      @change="setOpinionFieldValue(field.key, option)"
                    />
                    {{ option }}
                  </label>
                </div>
                <div v-else-if="field.type === 'CHECKBOX'" class="m-opinion-options">
                  <label
                    v-for="option in field.options ?? []"
                    :key="option"
                    class="m-opinion-option"
                  >
                    <input
                      type="checkbox"
                      :name="`op-${field.key}`"
                      :value="option"
                      :checked="Array.isArray(opinionFieldValue(field)) && (opinionFieldValue(field) as unknown[]).includes(option)"
                      @change="
                        (e) => {
                          const current = Array.isArray(opinionFieldValue(field))
                            ? [...(opinionFieldValue(field) as unknown[])]
                            : []
                          const target = e.target as HTMLInputElement
                          const next = target.checked
                            ? [...current, option]
                            : current.filter((v) => v !== option)
                          setOpinionFieldValue(field.key, next)
                        }
                      "
                    />
                    {{ option }}
                  </label>
                </div>
                <input
                  v-else
                  :id="`op-${field.key}`"
                  class="m-input"
                  :type="opinionInputType(field)"
                  :value="(opinionFieldValue(field) as string | number) ?? ''"
                  :min="field.min"
                  :max="field.max"
                  :maxlength="field.maxLength"
                  @input="
                    setOpinionFieldValue(
                      field.key,
                      field.type === 'NUMBER'
                        ? Number(($event.target as HTMLInputElement).value)
                        : ($event.target as HTMLInputElement).value,
                    )
                  "
                />
              </template>
            </div>
          </section>

          <div class="m-actions">
            <el-button :disabled="submitting" @click="detailVisible = false">取消</el-button>
            <el-button type="danger" :loading="submitting" @click="submitHandle('DISAPPROVE')">
              不通过
            </el-button>
            <el-button type="primary" :loading="submitting" @click="submitHandle('APPROVE')">
              通过
            </el-button>
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.mobile-workspace {
  max-width: 720px;
  margin: 0 auto;
  padding: 12px 14px;
}
.m-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.m-title {
  font-size: 20px;
  font-weight: 600;
  color: #303133;
}
.m-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.m-item {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 10px;
  background: #fff;
}
.m-item-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}
.m-item-meta {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: #909399;
}
.m-empty {
  text-align: center;
  color: #909399;
}
.m-detail-title {
  font-size: 16px;
  font-weight: 600;
}
.m-detail-body {
  padding-bottom: 12px;
}
.m-section {
  margin-bottom: 16px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 10px 12px;
  background: #fff;
}
.m-section-title {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: #7e306b;
  border-bottom: 1px solid #ebeef5;
  padding-bottom: 6px;
}
.m-kv {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  padding: 4px 0;
}
.m-kv span {
  color: #909399;
}
.m-kv b {
  color: #303133;
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}
.m-empty-line {
  color: #909399;
  font-size: 13px;
}
.m-att-list {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  min-width: 0;
}
.m-att-link {
  font-size: 13px;
  color: var(--el-color-primary);
  word-break: break-all;
  text-align: right;
}
.m-opinion-field {
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
}
.m-opinion-label {
  font-size: 13px;
  color: #606266;
  margin-bottom: 4px;
}
.m-required {
  color: #f56c6c;
}
.m-input {
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 8px;
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
}
.m-opinion-note {
  font-size: 12px;
  color: #909399;
}
.m-opinion-options {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.m-opinion-option {
  font-size: 13px;
  color: #303133;
}
.m-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}
</style>
