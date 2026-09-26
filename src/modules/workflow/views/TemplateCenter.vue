<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * TemplateCenter — 流程模板中心（I4 §3.2）。
 * 分类/状态/关键词筛选；启用/停用；复制后编辑并发布（创建 DRAFT 定义跳设计器）。
 * 无权模板服务端拒绝（列表即不可见）；复制不改动来源模板与运行实例。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ListActionsColumn, StandardListTemplate } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import {
  pageTemplates,
  changeTemplateStatus,
  copyTemplateToDefinition,
} from '@/modules/workflow/api/i4'
import type { BpmTemplate } from '@/modules/workflow/api/i4'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'

const router = useRouter()

const list = ref<BpmTemplate[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')
const keyword = ref('')
const category = ref('')
const status = ref('')

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageTemplates(pageQuery, {
      keyword: keyword.value || undefined,
      category: category.value || undefined,
      status: status.value || undefined,
    })
    list.value = result.list
    total.value = result.total
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('workflow.templateListLoadFailed')
  } finally {
    loading.value = false
  }
}

const togglingId = ref<number | null>(null)

async function handleToggle(row: BpmTemplate) {
  togglingId.value = row.id
  try {
    await changeTemplateStatus(row.id, row.status === 'DISABLED')
    ElMessage.success(
      row.status === 'DISABLED' ? t('common.statusEnabled') : t('common.statusDisabled'),
    )
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.operationFailed'))
  } finally {
    togglingId.value = null
  }
}

const copyingId = ref<number | null>(null)

/** 复制后编辑并发布：受控来源 → 新 DRAFT 定义 → 设计器。 */
async function handleCopy(row: BpmTemplate) {
  copyingId.value = row.id
  try {
    const def = await copyTemplateToDefinition(
      row.id,
      t('workflow.templateCopyName', { name: row.name }),
    )
    ElMessage.success(t('workflow.templateCopiedToDraft'))
    await router.push(`/workflow/defs/${def.id}/design`)
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.copyFailed'))
  } finally {
    copyingId.value = null
  }
}

function statusType(s: BpmTemplate['status']): 'success' | 'info' {
  return s === 'ENABLED' ? 'success' : 'info'
}

function statusLabel(s: BpmTemplate['status']): string {
  return s === 'ENABLED' ? t('common.enable') : t('common.disable')
}

/** 操作列（V012-BUG-002）：复制后编辑并发布 / 启用停用，保留原状态 disabled 与行级 loading */
function rowActions(row: unknown): ListAction[] {
  const item = row as BpmTemplate | undefined
  if (!item) return []
  return [
    {
      key: 'copy',
      label: t('workflow.copyCreateDefinition'),
      type: 'primary',
      disabled: item.status !== 'ENABLED',
      loading: copyingId.value === item.id,
      onClick: () => void handleCopy(item),
    },
    {
      key: 'toggle',
      label: item.status === 'ENABLED' ? t('common.disable') : t('common.enable'),
      loading: togglingId.value === item.id,
      onClick: () => void handleToggle(item),
    },
  ]
}

function search() {
  pageNum.value = 1
  void loadList()
}

function resetFilters() {
  keyword.value = ''
  category.value = ''
  status.value = ''
  pageNum.value = 1
  void loadList()
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
    :title="t('router.processTemplateCenter')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #filter>
      <el-input
        v-model="keyword"
        :placeholder="t('workflow.templateKeywordPlaceholder')"
        clearable
        style="width: 200px"
        @keyup.enter="search"
      />
      <el-input
        v-model="category"
        :placeholder="t('common.category')"
        clearable
        style="width: 140px"
        @keyup.enter="search"
      />
      <el-select v-model="status" :placeholder="t('common.status')" clearable style="width: 120px">
        <el-option :label="t('common.enable')" value="ENABLED" />
        <el-option :label="t('common.disable')" value="DISABLED" />
      </el-select>
      <el-button type="primary" @click="search">{{ t('common.query') }}</el-button>
      <el-button @click="resetFilters">{{ t('common.reset') }}</el-button>
    </template>

    <el-table v-loading="loading" :data="list">
      <el-table-column :label="t('workflow.templateName')" min-width="160">
        <template #default="{ row }">{{ row?.name }}</template>
      </el-table-column>
      <el-table-column :label="t('common.category')" min-width="100">
        <template #default="{ row }">{{ row?.category || '—' }}</template>
      </el-table-column>
      <el-table-column :label="t('workflow.boundForm')" min-width="140">
        <template #default="{ row }">{{ row?.formKey }}</template>
      </el-table-column>
      <el-table-column :label="t('common.version')" width="70">
        <template #default="{ row }">V{{ row?.templateVersion }}</template>
      </el-table-column>
      <el-table-column :label="t('workflow.scope')" width="90">
        <template #default="{ row }">{{
          row?.scopeType === 'DEPT' ? t('workflow.scopeDept') : t('workflow.scopeGlobal')
        }}</template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="90">
        <template #default="{ row }">
          <el-tag v-if="row" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :width="120" />
      <template #empty>{{ t('workflow.noVisibleTemplates') }}</template>
    </el-table>
  </StandardListTemplate>
</template>
