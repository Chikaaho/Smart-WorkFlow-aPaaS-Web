<script setup lang="ts">
/* global Element, HTMLElement */
/**
 * ProcessDefList — 流程定义列表页（页型 B）。
 *
 * 只读分页列表，套 StandardListTemplate。
 * 不提供创建/编辑/删除/发布操作（非本功能范围）。
 */
import { ref, computed, onMounted, nextTick, onBeforeUnmount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { StandardListTemplate } from '@/components/page-layout'
import {
  pageProcessDefs,
  getProcessDefGraph,
  publishProcessDef,
  deleteProcessDef,
} from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import { mountBpmnViewer } from '@/adapters/bpmn'
import type { BpmnViewerInstance } from '@/adapters/bpmn'
import { ElMessageBox, ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import CreateProcessDefDialog from './CreateProcessDefDialog.vue'
import EditProcessDefDialog from './EditProcessDefDialog.vue'

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
const bpmnContainerRef = ref<Element | null>(null)
let viewerInstance: BpmnViewerInstance | null = null

// ─── 发布流程定义 ───
const publishingId = ref<number | null>(null)

// ─── 删除流程定义 ───
const deletingId = ref<number | null>(null)

// ─── 创建流程定义 ───
const createDialogVisible = ref(false)

// ─── 表单工作台回跳上下文（P52） ───
// 从表单工作台「关联流程」区进入时带 from=form-workbench&formId=...，
// 顶部显示返回入口，返回后恢复原表单与「关联流程」工作区。
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

// ─── 编辑流程定义 ───
const editDialogVisible = ref(false)
const editingDef = ref<ProcessDef | null>(null)

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

/** 打开查看流程图对话框 */
async function openViewer(row: ProcessDef) {
  currentDefName.value = row.name
  viewerVisible.value = true
  viewerLoading.value = true
  viewerError.value = ''

  // 等待 DOM 更新后容器元素就位
  await nextTick()

  try {
    const xml = await getProcessDefGraph(row.id)
    if (!bpmnContainerRef.value) {
      viewerError.value = '渲染容器未找到'
      return
    }
    viewerInstance = await mountBpmnViewer(bpmnContainerRef.value as HTMLElement, xml)
    // bpmn-js 渲染完成后自适应画布（try-fit：即使尺寸未就位也不影响外层错误态）
    await nextTick()
    try {
      viewerInstance.fitViewport()
    } catch {
      // 对话框动画可能尚未完成 → 由 @opened 事件重试
    }
  } catch (e: unknown) {
    viewerError.value =
      (e as Record<string, string>)?.msg || (e as Error)?.message || '流程图加载失败'
  } finally {
    viewerLoading.value = false
  }
}

/** 对话框打开动画完成后重试 fitViewport（容器在动画结束前可能尺寸为 0） */
function onDialogOpened() {
  if (viewerInstance) {
    try {
      viewerInstance.fitViewport()
    } catch {
      // 静默忽略：初始渲染位置已由 mountBpmnViewer 确定
    }
  }
}

/** 关闭对话框并清理 bpmn viewer 实例 */
function closeViewer() {
  if (viewerInstance) {
    viewerInstance.destroy()
    viewerInstance = null
  }
  viewerVisible.value = false
  viewerError.value = ''
  viewerLoading.value = false
}

// ─── 发布流程定义 ───

/** 发布流程定义（带确认对话框） */
async function handlePublish(row: ProcessDef) {
  try {
    await ElMessageBox.confirm(
      `确定要发布流程定义「${row.name}」吗？发布后将无法修改。`,
      '发布确认',
      {
        confirmButtonText: '确定发布',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    // 用户取消
    return
  }

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

  try {
    await ElMessageBox.confirm(
      `确定要删除流程定义「${row.name}」吗？此操作不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    // 用户取消
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

/** 编辑流程定义 */
function handleEdit(row: ProcessDef) {
  editingDef.value = row
  editDialogVisible.value = true
}

// 组件卸载时防御性清理
onBeforeUnmount(() => {
  if (viewerInstance) {
    viewerInstance.destroy()
    viewerInstance = null
  }
})

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
      <el-table-column label="操作" width="260" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            link
            type="primary"
            :disabled="(row as ProcessDef).status === 'DRAFT'"
            @click="openViewer(row as ProcessDef)"
          >
            查看流程图
          </el-button>
          <el-button
            size="small"
            link
            type="warning"
            :disabled="(row as ProcessDef).status !== 'DRAFT'"
            @click="handleEdit(row as ProcessDef)"
          >
            编辑
          </el-button>
          <el-button
            size="small"
            link
            type="success"
            :disabled="(row as ProcessDef).status !== 'DRAFT'"
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
            :loading="deletingId === (row as ProcessDef).id"
            @click="handleDelete(row as ProcessDef)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>

  <!-- 查看流程图对话框（置于列表模板之外：空态时 default slot 不渲染，
       对话框放内部会导致空列表下"创建/编辑"按钮无响应） -->
  <el-dialog
    v-model="viewerVisible"
    :title="`流程图 - ${currentDefName}`"
    :close-on-click-modal="false"
    destroy-on-close
    width="900px"
    @opened="onDialogOpened"
    @closed="closeViewer"
  >
    <div v-loading="viewerLoading" class="bpmn-wrapper">
      <!-- 错误提示 -->
      <el-result
        v-if="viewerError"
        icon="error"
        :title="viewerError"
        :sub-title="'请确认流程定义已发布且 BPMN XML 有效'"
      />
      <!-- BPMN 渲染容器 -->
      <div ref="bpmnContainerRef" class="bpmn-container" />
    </div>
  </el-dialog>

  <!-- 创建流程定义对话框 -->
  <CreateProcessDefDialog v-model:visible="createDialogVisible" @saved="loadList" />

  <!-- 编辑流程定义对话框 -->
  <EditProcessDefDialog
    v-model:visible="editDialogVisible"
    :process-def="editingDef"
    @saved="loadList"
  />
</template>

<style scoped>
/* 操作列禁用态按钮：与已发布行蓝色可点链接形成清晰视觉反差 */
:deep(.el-button.is-link.is-disabled) {
  color: #c0c4cc !important;
  cursor: not-allowed;
  text-decoration: none;
}

/* BPMN 容器 —— 显式高度确保 bpmn-js 正确计算视口 */
.bpmn-wrapper {
  height: 500px;
  position: relative;
}
.bpmn-container {
  width: 100%;
  height: 100%;
}

/* 隐藏 bpmn-js 默认右下角可点击 Logo（水印 + window.open 行为） */
:deep(.bjs-powered-by) {
  display: none !important;
}
</style>
