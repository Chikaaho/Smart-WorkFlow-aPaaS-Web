<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * MyDrafts — 我的草稿列表页（页型 B）。
 *
 * 发起入口（D3/P4 业务纠正）：页内展示本人可见的已发布表单列表，点"发起"进入
 * 该表单的真实填报页；流程由服务端按绑定解析，用户不选择/填写流程标识。
 * 列表增删 + 提交走异步命令通道：submit 受理 → 轮询命令状态。
 * - 发起：/form/form-render/{formKey}?mode=draft（无 draftId：保存时 createDraft）
 * - 编辑：/form/form-render/{formKey}?mode=draft&draftId={id}
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
import {
  myDrafts,
  deleteDraft,
  submitDraft,
  pollCommandStatus,
  publishedFormDefs,
} from '@/modules/workflow/api'
import type { BpmDraft, BpmDraftStatus } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'

const router = useRouter()

// ─── 列表状态 ───
const list = ref<BpmDraft[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')
const submittingId = ref<number | null>(null) // 正在提交的草稿 ID（按钮 loading，防重复）

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

const STATUS_TAG: Record<
  BpmDraftStatus,
  { label: string; type: 'info' | 'warning' | 'success' | 'danger' }
> = {
  EDITING: {
    get label() {
      return t('common.statusEditing')
    },
    type: 'info',
  },
  SUBMITTING: {
    get label() {
      return t('common.statusSubmitting')
    },
    type: 'warning',
  },
  SUBMITTED: {
    get label() {
      return t('common.statusSubmitted')
    },
    type: 'success',
  },
  FAILED: {
    get label() {
      return t('common.submitFailed')
    },
    type: 'danger',
  },
}

// 可发起的已发布表单：GET /form/def/published（服务端按可见范围过滤，仅 PUBLISHED）
interface FormOption {
  formKey: string
  name: string
}
const initiateForms = ref<FormOption[]>([])

async function loadOptions(): Promise<void> {
  try {
    const forms = await publishedFormDefs()
    initiateForms.value = forms.map((f) => ({ formKey: f.formKey, name: f.name }))
  } catch {
    ElMessage.error(t('common.loadFailed'))
    // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
    // 发起列表加载失败不阻断草稿页；不提供任意流程标识输入。
  }
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await myDrafts(pageQuery)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('workflow.draftsLoadFailed')
    }
  } finally {
    loading.value = false
  }
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

// ─── 发起：从已发布表单列表进入真实填报页 ───
function fillDraftUrl(formKey: string): string {
  return `/form/form-render/${formKey}?mode=draft`
}

/** 点击"发起"：进入该已发布表单的真实填报（无 draftId：保存时 createDraft） */
function startFromForm(formKey: string) {
  void router.push(fillDraftUrl(formKey))
}

/** 编辑：跳转表单填报页 draft 模式并携带 draftId（挂载后读草稿反填控件） */
function openEdit(row: BpmDraft) {
  const params: string[] = ['mode=draft', `draftId=${row.id}`]
  void router.push(`/form/form-render/${row.formKey}?${params.join('&')}`)
}

// ─── 删除 ───
async function handleDelete(row: BpmDraft) {
  try {
    await ElMessageBox.confirm(t('workflow.deleteDraftConfirm'), t('common.deleteConfirmTitle'), {
      get confirmButtonText() {
        return t('common.delete')
      },
      get cancelButtonText() {
        return t('common.cancel')
      },
      type: 'warning',
    })
  } catch {
    return
  }
  try {
    await deleteDraft(row.id)
    ElMessage.success(t('workflow.draftDeleted'))
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('workflow.draftDeleteFailed'))
  }
}

// ─── 提交（受理 + 轮询） ───
async function handleSubmit(row: BpmDraft) {
  if (submittingId.value !== null) return
  try {
    await ElMessageBox.confirm(t('workflow.submitDraftConfirm'), t('workflow.submitConfirmTitle'), {
      get confirmButtonText() {
        return t('common.submit')
      },
      get cancelButtonText() {
        return t('common.cancel')
      },
      type: 'info',
    })
  } catch {
    return
  }
  submittingId.value = row.id
  try {
    const accept = await submitDraft(row.id)
    const finalStatus = await pollCommandStatus(accept.commandId)
    if (finalStatus?.status === 'COMPLETED') {
      ElMessage.success(t('common.submitSuccess'))
    } else if (finalStatus?.status === 'FAILED') {
      ElMessage.error(finalStatus.failureReason ?? t('common.submitFailed'))
    } else {
      // 超时未终态：如实提示，不伪装成功
      ElMessage.warning(t('common.processingCheckLater'))
    }
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.submitFailed'))
  } finally {
    submittingId.value = null
    await loadList()
  }
}

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数（对齐 TodoList 写法）
function openEditRow(r: unknown) {
  openEdit(r as BpmDraft)
}

function deleteRow(r: unknown) {
  void handleDelete(r as BpmDraft)
}

function submitRow(r: unknown) {
  void handleSubmit(r as BpmDraft)
}

onMounted(() => {
  void loadList()
  void loadOptions()
})
</script>

<template>
  <!-- 发起入口：可见的已发布表单 → 发起 → 填报（流程由服务端解析）。
       置于列表模板之外：0 草稿的空态下发起入口仍可见（A2 首次发起可用）。 -->
  <el-card shadow="never" class="initiate-card" data-testid="initiate-forms">
    <template #header>
      <span>{{ t('workflow.startableForms') }}</span>
    </template>
    <el-table :data="initiateForms" size="small" :empty-text="t('workflow.noStartableForms')">
      <el-table-column prop="name" :label="t('common.formName')" min-width="160" />
      <el-table-column prop="formKey" :label="t('common.formKey')" min-width="160" />
      <el-table-column :label="t('common.actions')" width="90">
        <template #default="{ row }">
          <el-button type="primary" size="small" @click="startFromForm(row.formKey)">{{
            t('common.start')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <p class="draft-flow-hint">{{ t('workflow.autoResolveProcessHint') }}</p>
  </el-card>

  <StandardListTemplate
    :title="t('workflow.myDrafts')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 空态 -->
    <template #empty-action>
      <span class="draft-flow-hint">{{ t('workflow.startFromListHint') }}</span>
    </template>

    <!-- 错误提示 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <!-- 表格 -->
    <el-table v-loading="loading" :data="list" stripe style="width: 100%">
      <el-table-column :label="t('common.title')" min-width="140">
        <template #default="{ row }">
          {{ row.title ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="formKey" :label="t('common.formKey')" min-width="130" />
      <el-table-column :label="t('common.process')" min-width="140">
        <template #default="{ row }">
          {{ row.processDefKey ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG[row.status as BpmDraftStatus]?.type ?? 'info'" size="small">
            {{ STATUS_TAG[row.status as BpmDraftStatus]?.label ?? row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.failureReason')" min-width="160">
        <template #default="{ row }">
          {{ row.lastError ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="updateTime" :label="t('common.updateTime')" min-width="170" />
      <el-table-column :label="t('common.actions')" width="190" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" link @click="openEditRow(row)">{{
            t('common.edit')
          }}</el-button>
          <el-button
            size="small"
            type="success"
            link
            :loading="submittingId === row.id"
            :disabled="submittingId !== null"
            @click="submitRow(row)"
            >{{ t('common.submit') }}</el-button
          >
          <el-button size="small" type="danger" link @click="deleteRow(row)">{{
            t('common.delete')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>
</template>

<style scoped>
.initiate-card {
  margin-bottom: 12px;
}
.draft-flow-hint {
  margin: 8px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
