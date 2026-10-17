<script setup lang="ts">
/**
 * ApprovalFormList — 审批意见表单维护页（BF20261013-020）。
 *
 * 低代码表单自本版起分类型（元数据 form_type 区分）：业务表单留在「表单管理」，
 * 审批意见表单在本页（流程管理域）单独维护；流程节点的表单绑定只列审批意见表单。
 * 复用表单设计器（/form/designer/:id）与分页端点（formType=APPROVAL_COMMENT 过滤）。
 */
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import {
  pageFormDefs,
  createFormDef,
  saveFormConfig,
  disableFormDef,
  enableFormDef,
  getFormDefStatusLabel,
  getFormDefStatusType,
} from '@/adapters/form-catalog'
import type { FormDefListItem } from '@/adapters/form-catalog'
import type { PageQuery } from '@/contracts/common'
import { useI18n } from '@/locales'
import { ListFilterItem, StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'

const { t } = useI18n()
const router = useRouter()

/** 审批意见表单的固定类型（服务端元数据）。 */
const FORM_TYPE = 'APPROVAL_COMMENT'

const list = ref<FormDefListItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const keyword = ref('')
const currentKeyword = ref('')

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageFormDefs(pageQuery, currentKeyword.value || undefined, FORM_TYPE)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : '加载审批意见表单列表失败'
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  currentKeyword.value = keyword.value.trim()
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  keyword.value = ''
  currentKeyword.value = ''
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

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

/** 展示层时间格式：ISO → YYYY-MM-DD HH:mm（仅显示，不改数据）。 */
function formatDateTime(value: string | null): string {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 16)
}

/**
 * 新建审批意见表单：弹窗输入名称 → createFormDef（formType=APPROVAL_COMMENT）→
 * 写入空定义（设计器对无定义草稿返回 CONFIG_NOT_FOUND，需先落空 schema）→ 进设计器。
 */
async function goCreate() {
  let name: string
  try {
    const { value } = await ElMessageBox.prompt('表单名称', '新建审批意见表单', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      inputPlaceholder: '表单名称',
      inputValidator: (v: string) => (v && v.trim() ? true : '请输入表单名称'),
    })
    name = value.trim()
  } catch {
    return // 用户取消/关闭
  }
  try {
    const created = await createFormDef({
      formKey: 'form_' + Date.now().toString(36),
      name,
      formType: FORM_TYPE,
    })
    await saveFormConfig(created.id, JSON.stringify({ title: name, fields: [] }))
    ElMessage.success('草稿已保存')
    void router.push(`/form/designer/${created.id}`)
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '保存失败')
  }
}

function goEdit(row: FormDefListItem) {
  void router.push(`/form/designer/${row.id}`)
}

// I2 生命周期：停用/启用（PUBLISHED ↔ DISABLED），成功后刷新列表
async function toggleLifecycleRow(r: unknown, action: 'disable' | 'enable') {
  const row = r as FormDefListItem
  try {
    if (action === 'disable') {
      await disableFormDef(row.id, '管理员停用')
      ElMessage.success('已停用')
    } else {
      await enableFormDef(row.id, '管理员启用')
      ElMessage.success('已启用')
    }
    await loadList()
  } catch (err) {
    ElMessage.error(
      err instanceof ApiError ? err.msg : action === 'disable' ? '停用失败' : '启用失败',
    )
  }
}

function rowActions(r: unknown): ListAction[] {
  const row = r as FormDefListItem
  return [
    {
      key: 'edit',
      label: '编辑',
      onClick: () => goEdit(row),
    },
    {
      key: 'disable',
      label: '停用',
      type: 'danger',
      visible: row.status === 'PUBLISHED',
      onClick: () => toggleLifecycleRow(row, 'disable'),
    },
    {
      key: 'enable',
      label: '启用',
      type: 'success',
      visible: row.status === 'DISABLED',
      onClick: () => toggleLifecycleRow(row, 'enable'),
    },
  ]
}

onMounted(loadList)
</script>

<template>
  <div class="approval-form-page">
    <StandardListTemplate
      title="审批意见表单"
      large
      :total="total"
      :page-num="pageNum"
      :page-size="pageSize"
      :empty="isEmpty"
      @update:page-num="handlePageNumChange"
      @update:page-size="handlePageSizeChange"
    >
      <template #toolbar-actions>
        <el-button type="primary" @click="goCreate">{{ t('common.create') }}</el-button>
      </template>

      <template #filter>
        <ListFilterItem :label="t('common.formName')">
          <el-input
            v-model="keyword"
            :placeholder="t('common.pleaseInput')"
            clearable
            @keyup.enter="handleQuery"
          />
        </ListFilterItem>
      </template>
      <template #filter-actions>
        <el-button type="primary" @click="handleQuery">查询</el-button>
        <el-button @click="handleReset">重置</el-button>
      </template>

      <el-alert
        v-if="errorMsg"
        :title="errorMsg"
        type="error"
        :closable="false"
        show-icon
        style="margin-bottom: 12px"
      />
      <el-table v-loading="loading" :data="list" stripe>
        <el-table-column prop="name" label="表单名称" min-width="180" />
        <el-table-column prop="createByName" label="创建人" width="120">
          <template #default="{ row }">
            {{ row.createByName || '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="createTime" label="创建时间" width="170">
          <template #default="{ row }">
            {{ formatDateTime(row.createTime) }}
          </template>
        </el-table-column>
        <el-table-column prop="updateTime" label="更新时间" width="170">
          <template #default="{ row }">
            {{ formatDateTime(row.updateTime) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="发布状态" width="110">
          <template #default="{ row }">
            <el-tag :type="getFormDefStatusType(row.status)" size="small">
              {{ getFormDefStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <ListActionsColumn :actions="rowActions" :width="160" />
      </el-table>

      <template #empty-action>
        <el-button type="primary" @click="goCreate">{{ t('common.create') }}</el-button>
      </template>
    </StandardListTemplate>
  </div>
</template>

<style scoped>
.approval-form-page__hint {
  margin: 0 0 12px;
  font-size: var(--sw-font-size-sm, 13px);
  color: var(--sw-text-secondary, #6b7280);
}
</style>
