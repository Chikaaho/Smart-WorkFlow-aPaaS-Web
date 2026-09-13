<script setup lang="ts">
/**
 * TemplateCenter — 流程模板中心（I4 §3.2）。
 * 分类/状态/关键词筛选；启用/停用；复制后编辑并发布（创建 DRAFT 定义跳设计器）。
 * 无权模板服务端拒绝（列表即不可见）；复制不改动来源模板与运行实例。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
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
    errorMsg.value = err instanceof ApiError ? err.msg : '加载模板列表失败'
  } finally {
    loading.value = false
  }
}

const togglingId = ref<number | null>(null)

async function handleToggle(row: BpmTemplate) {
  togglingId.value = row.id
  try {
    await changeTemplateStatus(row.id, row.status === 'DISABLED')
    ElMessage.success(row.status === 'DISABLED' ? '已启用' : '已停用')
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '操作失败')
  } finally {
    togglingId.value = null
  }
}

const copyingId = ref<number | null>(null)

/** 复制后编辑并发布：受控来源 → 新 DRAFT 定义 → 设计器。 */
async function handleCopy(row: BpmTemplate) {
  copyingId.value = row.id
  try {
    const def = await copyTemplateToDefinition(row.id, `${row.name}-副本`)
    ElMessage.success('已复制为流程定义草稿，可继续编辑发布')
    await router.push(`/workflow/defs/${def.id}/design`)
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '复制失败')
  } finally {
    copyingId.value = null
  }
}

function statusType(s: BpmTemplate['status']): 'success' | 'info' {
  return s === 'ENABLED' ? 'success' : 'info'
}

function statusLabel(s: BpmTemplate['status']): string {
  return s === 'ENABLED' ? '启用' : '停用'
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
    title="流程模板中心"
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
        placeholder="模板名称/描述"
        clearable
        style="width: 200px"
        @keyup.enter="search"
      />
      <el-input
        v-model="category"
        placeholder="分类"
        clearable
        style="width: 140px"
        @keyup.enter="search"
      />
      <el-select v-model="status" placeholder="状态" clearable style="width: 120px">
        <el-option label="启用" value="ENABLED" />
        <el-option label="停用" value="DISABLED" />
      </el-select>
      <el-button type="primary" @click="search">查询</el-button>
      <el-button @click="resetFilters">重置</el-button>
    </template>

    <el-table v-loading="loading" :data="list">
      <el-table-column label="模板名称" min-width="160">
        <template #default="{ row }">{{ row?.name }}</template>
      </el-table-column>
      <el-table-column label="分类" min-width="100">
        <template #default="{ row }">{{ row?.category || '—' }}</template>
      </el-table-column>
      <el-table-column label="绑定表单" min-width="140">
        <template #default="{ row }">{{ row?.formKey }}</template>
      </el-table-column>
      <el-table-column label="版本" width="70">
        <template #default="{ row }">V{{ row?.templateVersion }}</template>
      </el-table-column>
      <el-table-column label="范围" width="90">
        <template #default="{ row }">{{ row?.scopeType === 'DEPT' ? '本部门' : '全局' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag v-if="row" :type="statusType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <template v-if="row">
            <el-button
              link
              type="primary"
              :disabled="row.status !== 'ENABLED'"
              :loading="copyingId === row.id"
              @click="handleCopy(row as BpmTemplate)"
            >
              复制创建定义
            </el-button>
            <el-button
              link
              :loading="togglingId === row.id"
              @click="handleToggle(row as BpmTemplate)"
            >
              {{ row.status === 'ENABLED' ? '停用' : '启用' }}
            </el-button>
          </template>
        </template>
      </el-table-column>
      <template #empty>暂无可见模板</template>
    </el-table>
  </StandardListTemplate>
</template>
