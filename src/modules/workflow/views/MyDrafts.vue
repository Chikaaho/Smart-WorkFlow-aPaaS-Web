<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * MyDrafts — 我的草稿列表页（页型 B）。
 *
 * V012-BUG-014：草稿页只保留普通草稿列表，原页内「可发起的已发布表单」
 * 发起入口已移除（流程发起统一走流程中心）。
 * 列表增删 + 提交走异步命令通道：submit 受理 → 轮询命令状态。
 * - 编辑：/form/form-render/{formKey}?mode=draft&draftId={id}
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ListActionsColumn, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { myDrafts, deleteDraft, submitDraft, pollCommandStatus } from '@/modules/workflow/api'
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

// el-table row slot 的 DefaultRow 类型不兼容，桥接为类型化行操作（V012-BUG-002 操作列工厂）
function draftActions(row: unknown): ListAction[] {
  const item = row as BpmDraft
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      type: 'primary',
      onClick: () => openEdit(item),
    },
    {
      key: 'submit',
      label: t('common.submit'),
      type: 'success',
      loading: submittingId.value === item.id,
      disabled: submittingId.value !== null,
      onClick: () => void handleSubmit(item),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      onClick: () => void handleDelete(item),
    },
  ]
}

onMounted(loadList)
</script>

<template>
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
      <span />
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
      <ListActionsColumn :actions="draftActions" :width="150" />
    </el-table>
  </StandardListTemplate>
</template>
