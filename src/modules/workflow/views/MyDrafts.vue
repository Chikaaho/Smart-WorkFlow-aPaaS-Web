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
import { ArrowDown } from '@element-plus/icons-vue'
import { StandardListTemplate, ListFilterItem } from '@/components/page-layout'
import { pageFormDefs } from '@/adapters/form-catalog'
import { myDrafts, deleteDraft, submitDraft, pollCommandStatus } from '@/modules/workflow/api'
import type { BpmDraft, BpmDraftStatus } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import BusinessDetailDialog from '@/components/business-detail/BusinessDetailDialog.vue'

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

/** 278:1437：标题关键字过滤既有真实记录（仅展示层，不改数据） */
const titleFilter = ref('')
const displayList = computed(() => {
  const kw = titleFilter.value.trim().toLowerCase()
  if (!kw) return list.value
  return list.value.filter((row) => (row.title ?? '').toLowerCase().includes(kw))
})

/** 展示层时间格式：ISO → YYYY-MM-DD HH:mm（仅显示，不改数据） */
function formatDateTime(value: string | null): string {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

/** 278:1437：表单显示名走既有表单目录元数据；元数据缺失时保留真实 formKey。 */
const formNames = ref<Map<string, string>>(new Map())

async function loadFormNames() {
  try {
    const page = await pageFormDefs({ pageNum: 1, pageSize: 500 }, undefined, 'BUSINESS')
    formNames.value = new Map(page.list.map((item) => [item.formKey, item.name]))
  } catch {
    formNames.value = new Map()
  }
}

function formNameOf(formKey: string): string {
  return formNames.value.get(formKey) || formKey
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

/** 查看：与其它列表共用只读详情弹窗；草稿内容取本地 payload，不触发整页跳转。 */
const detailVisible = ref(false)
const detailFormKey = ref('')
const detailProcessKey = ref('')
const detailRecord = ref<Record<string, unknown> | null>(null)

function openDetail(row: BpmDraft) {
  detailFormKey.value = row.formKey
  detailProcessKey.value = row.processDefKey ?? ''
  try {
    const parsed = JSON.parse(row.payload || '{}')
    detailRecord.value =
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null
  } catch {
    detailRecord.value = null
  }
  detailVisible.value = true
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

/** 278:1437：操作首项继续编辑；查看/提交/删除收进「更多」，逐项完整可达。 */
function onDraftCommand(command: string, row: BpmDraft) {
  if (command === 'view') openDetail(row)
  else if (command === 'submit') void handleSubmit(row)
  else if (command === 'delete') void handleDelete(row)
}

onMounted(() => {
  void loadFormNames()
  void loadList()
})
</script>

<template>
  <StandardListTemplate
    class="drafts-page"
    appearance="design"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 筛选容器（278:1437 执行提示18）：标签“草稿”、输入 x309/w364；过滤既有真实记录 -->
    <template #filter>
      <ListFilterItem class="drafts-page__filter" :label="t('common.statusDraft')">
        <el-input
          v-model="titleFilter"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="loadList"
        />
      </ListFilterItem>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="loadList">{{ t('common.query') }}</el-button>
      <el-button
        @click="
          (() => {
            titleFilter = ''
            void loadList()
          })()
        "
      >
        {{ t('common.reset') }}
      </el-button>
    </template>

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

    <!-- 表格（278:1437 执行提示18）：标题/表单名称/状态/失败原因/更新时间/操作 六列 -->
    <el-table v-loading="loading" :data="displayList" stripe style="width: 100%">
      <el-table-column :label="t('common.title')" width="632">
        <template #default="{ row }">
          {{ row.title ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.formName')" width="351">
        <template #default="{ row }">{{ formNameOf(row.formKey) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="112">
        <template #default="{ row }">
          <el-tag :type="STATUS_TAG[row.status as BpmDraftStatus]?.type ?? 'info'" size="small">
            {{ STATUS_TAG[row.status as BpmDraftStatus]?.label ?? row.status }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.failureReason')" width="232">
        <template #default="{ row }">
          {{ row.lastError ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column width="237">
        <template #header>{{ t('common.updateTime') }}</template>
        <template #default="{ row }">{{ formatDateTime(row.updateTime) }}</template>
      </el-table-column>
      <el-table-column
        :label="t('common.actions')"
        width="78"
        fixed="right"
        class-name="drafts-actions-cell"
      >
        <template #default="{ row }">
          <div class="drafts-actions">
            <el-button link type="primary" @click.stop="openEdit(row as BpmDraft)">{{
              t('common.edit')
            }}</el-button>
            <el-dropdown
              trigger="click"
              popper-class="sw-op-menu"
              @command="(command: string) => onDraftCommand(command, row as BpmDraft)"
            >
              <button type="button" class="drafts-actions__more" @click.stop>
                <el-icon :size="12"><ArrowDown /></el-icon>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="view">{{ t('common.view') }}</el-dropdown-item>
                  <el-dropdown-item command="submit" :disabled="submittingId !== null">{{
                    t('common.submit')
                  }}</el-dropdown-item>
                  <el-dropdown-item command="delete" divided class="sw-op-menu__danger">{{
                    t('common.delete')
                  }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>

  <!-- 278:1437：流程 ID 并入行详情 -->
  <BusinessDetailDialog
    v-model="detailVisible"
    :title="t('common.detail')"
    :form-key="detailFormKey"
    :record="detailRecord"
    :process-definition-key="detailProcessKey"
  />
</template>

<style scoped>
/* 278:1437（执行提示18）：筛选标签“草稿”，输入 x309/w364；六列表格与行内操作 */
.drafts-page :deep(.list-filter-bar__fields) {
  display: flex;
  flex-wrap: nowrap;
  gap: 12px;
}
.drafts-page :deep(.list-filter-bar__fields > *) {
  flex: 0 0 auto;
}
.drafts-page :deep(.list-filter-bar__actions) {
  margin-left: auto;
}
.drafts-page__filter {
  grid-template-columns: 29px 364px !important;
  width: max-content;
}
.drafts-page :deep(.drafts-actions-cell) .cell {
  padding: 0 8px;
}
.drafts-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 32px;
}
.drafts-actions :deep(.el-button.is-link) {
  min-width: 0;
  padding: 0 2px;
  font-size: 14px;
  font-weight: 500;
}
.drafts-actions__more {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--sw-color-primary, #409eff);
  cursor: pointer;
}
</style>
