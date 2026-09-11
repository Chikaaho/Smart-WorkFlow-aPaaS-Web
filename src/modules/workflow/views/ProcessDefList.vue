<script setup lang="ts">
/**
 * ProcessDefList — 流程定义列表页（页型 B）。
 *
 * 只读分页列表，套 StandardListTemplate。
 * I3：查看流程图走自研渲染内核（ProcessGraphView）；设计入口进入第一方设计器；
 * 发布/删除沿用；查看流程图与设计由第一方渲染内核与设计器承担。
 */
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { StandardListTemplate } from '@/components/page-layout'
import {
  pageProcessDefs,
  getProcessDefDefinition,
  publishProcessDef,
  deleteProcessDef,
} from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import ProcessGraphView from './ProcessGraphView.vue'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import type { ProcessGraphDocument } from '@/contracts/process-graph'
import CreateProcessDefDialog from './CreateProcessDefDialog.vue'

// ─── 状态映射（与 FormDefStatus 完全对称） ───

const PROCESS_DEF_STATUS_MAP: Record<
  ProcessDef['status'],
  { label: string; type: 'success' | 'warning' | 'info' | 'danger' }
> = {
  DRAFT: { label: '草稿', type: 'info' },
  PUBLISHED: { label: '已发布', type: 'success' },
}

function getStatusLabel(status: ProcessDef['status']): string {
  return PROCESS_DEF_STATUS_MAP[status]?.label ?? status
}

function getStatusType(status: ProcessDef['status']): 'success' | 'warning' | 'info' | 'danger' {
  return PROCESS_DEF_STATUS_MAP[status]?.type ?? 'info'
}

// ─── 列表状态 ───

const list = ref<ProcessDef[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

// ─── 查看流程图对话框 ───
const viewerVisible = ref(false)
const viewerLoading = ref(false)
const viewerError = ref('')
const currentDefName = ref('')
const viewerGraph = ref<ProcessGraphDocument | null>(null)

// ─── 发布流程定义 ───
const publishingId = ref<number | null>(null)

// ─── 删除流程定义 ───
const deletingId = ref<number | null>(null)

// ─── 创建流程定义 ───
const createDialogVisible = ref(false)

// ─── 表单工作台回跳上下文（P52） ───
const route = useRoute()
const router = useRouter()
const returnFormId = computed(() =>
  route.query.from === 'form-workbench' && typeof route.query.formId === 'string'
    ? route.query.formId
    : '',
)

function backToWorkbench() {
  if (!returnFormId.value) return
  router.push({ path: `/form/designer/${returnFormId.value}`, query: { tab: 'processes' } })
}

// ─── 设计器入口 ───
const editingDef = ref<ProcessDef | null>(null)

function openDesigner(row: ProcessDef) {
  editingDef.value = row
  void router.push(`/workflow/defs/${row.id}/design`)
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageProcessDefs(pageQuery)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载流程定义列表失败'
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

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数
function statusRow(r: unknown) {
  return r as ProcessDef
}

// ─── 查看流程图 ───

/** 打开查看流程图对话框（自研渲染内核直接消费已保存 ProcessGraph） */
async function openViewer(row: ProcessDef) {
  currentDefName.value = row.name
  viewerVisible.value = true
  viewerLoading.value = true
  viewerError.value = ''
  viewerGraph.value = null
  try {
    const definition = await getProcessDefDefinition(row.id)
    viewerGraph.value = {
      processKey: definition.processKey,
      name: definition.name ?? '',
      formKey: definition.formKey ?? '',
      version: definition.version,
      contractVersion: (definition as { contractVersion?: number }).contractVersion,
      elements: (definition.elements ??
        []) as import('@/contracts/process-graph').ProcessGraphElement[],
      canvas: definition.canvas ?? {},
    }
  } catch (e: unknown) {
    viewerError.value =
      (e as Record<string, string>)?.msg || (e as Error)?.message || '流程图加载失败'
  } finally {
    viewerLoading.value = false
  }
}

/** 关闭对话框 */
function closeViewer() {
  viewerVisible.value = false
  viewerError.value = ''
  viewerLoading.value = false
  viewerGraph.value = null
}

// ─── 发布流程定义 ───

/** 发布流程定义（带确认对话框） */
async function handlePublish(row: ProcessDef) {
  publishingId.value = row.id
  try {
    await publishProcessDef(row.id)
    ElMessage.success('发布成功')
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('发布失败')
    }
  } finally {
    publishingId.value = null
  }
}

/** 删除流程定义（带确认对话框，仅 DRAFT 状态可删除） */
async function handleDelete(row: ProcessDef) {
  if (row.status !== 'DRAFT') {
    ElMessage.warning('只有草稿状态的流程定义可以删除')
    return
  }

  deletingId.value = row.id
  try {
    await deleteProcessDef(row.id)
    ElMessage.success('删除成功')
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('删除失败')
    }
  } finally {
    deletingId.value = null
  }
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="流程定义"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏操作按钮 -->
    <template #toolbar-actions>
      <el-button v-if="returnFormId" @click="backToWorkbench">返回表单工作台</el-button>
      <el-button type="primary" @click="createDialogVisible = true">
        <el-icon><Plus /></el-icon>
        创建流程定义
      </el-button>
    </template>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button type="primary" @click="createDialogVisible = true">
        <el-icon><Plus /></el-icon>
        创建流程定义
      </el-button>
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
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="name" label="流程名称" min-width="160" />
      <el-table-column prop="processKey" label="流程标识" min-width="160" />
      <el-table-column prop="formKey" label="关联表单" min-width="140" />
      <el-table-column prop="defVersion" label="版本" width="80" align="center" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType(statusRow(row).status)" size="small">
            {{ getStatusLabel(statusRow(row).status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updateTime" label="更新时间" width="180" />
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="openViewer(row as ProcessDef)">
            查看流程图
          </el-button>
          <el-button size="small" link type="warning" @click="openDesigner(row as ProcessDef)">
            设计
          </el-button>
          <el-button
            size="small"
            link
            type="success"
            :loading="publishingId === (row as ProcessDef).id"
            @click="handlePublish(row as ProcessDef)"
          >
            发布
          </el-button>
          <el-button
            size="small"
            link
            type="danger"
            :disabled="(row as ProcessDef).status !== 'DRAFT'"
            @click="handleDelete(row as ProcessDef)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>

  <!-- 查看流程图对话框 -->
  <el-dialog
    v-model="viewerVisible"
    :title="`流程图 - ${currentDefName}`"
    :close-on-click-modal="false"
    destroy-on-close
    width="900px"
    @closed="closeViewer"
  >
    <div v-loading="viewerLoading" class="pg-wrapper">
      <el-result
        v-if="viewerError"
        icon="error"
        :title="viewerError"
        :sub-title="'请确认流程定义有可查看的图数据'"
      />
      <ProcessGraphView v-else :graph="viewerGraph" :height="480" />
    </div>
  </el-dialog>

  <!-- 创建流程定义对话框 -->
  <CreateProcessDefDialog v-model:visible="createDialogVisible" @saved="loadList" />
</template>

<style scoped>
/* 操作列禁用态按钮：与已发布行蓝色可点链接形成清晰视觉反差 */
:deep(.el-button.is-link.is-disabled) {
  color: #c0c4cc !important;
  cursor: not-allowed;
  text-decoration: none;
}

.pg-wrapper {
  min-height: 480px;
  position: relative;
}
</style>
