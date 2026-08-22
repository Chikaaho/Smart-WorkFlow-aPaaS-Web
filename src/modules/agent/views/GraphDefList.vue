<script setup lang="ts">
/**
 * GraphDefList — 图定义列表页（页型 B）。
 *
 * 分页展示图定义（列表 DTO 不含 graph_json 大字段），提供：
 *   新建（输名称 → 服务端建初始 START→END 草稿 → 跳设计器）
 *   编辑（跳设计器画布页，参数化静态路由 agent/graph-designer/:id）
 *   发布（二次确认，defVersion 递增）
 *   删除（二次确认，逻辑删除）
 *
 * 权限：页面本身走菜单驱动路由（sys_menu V26 行 permission=agent:model:view）；
 * 新建/发布/删除按钮级权限复用 agent:model:manage（前端 hasPerm 仅 UX 显隐，
 * 真实鉴权在后端 @ss.hasPermi）。
 */
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
import {
  createDebugSession,
  createGraphDef,
  deleteGraphDef,
  pageGraphDefs,
  publishGraphDef,
} from '@/modules/agent/api'
import type { AgentGraphDef } from '@/contracts/agent'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import { usePermission } from '@/foundation/permission'

const router = useRouter()
const { hasPerm } = usePermission()

// ─── 状态映射 ───

const STATUS_MAP: Record<string, { label: string; type: 'success' | 'warning' | 'info' }> = {
  DRAFT: { label: '草稿', type: 'info' },
  PUBLISHED: { label: '已发布', type: 'success' },
}

function getStatusLabel(status: string): string {
  return STATUS_MAP[status]?.label ?? status
}

function getStatusType(status: string): 'success' | 'warning' | 'info' {
  return STATUS_MAP[status]?.type ?? 'info'
}

// ─── 列表状态 ───

const list = ref<AgentGraphDef[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)
const canManage = computed(() => hasPerm('agent:model:manage'))

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const page: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageGraphDefs(page)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载图定义列表失败'
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

// ─── 操作 ───

/** 新建：输名称 → 服务端建初始图 → 跳设计器 */
async function handleCreate() {
  try {
    const { value: name } = await ElMessageBox.prompt('请输入图名称', '新建图定义', {
      confirmButtonText: '创建',
      cancelButtonText: '取消',
      inputPattern: /\S+/,
      inputErrorMessage: '图名称不能为空',
    })
    if (!name) return
    const id = await createGraphDef(name)
    ElMessage.success('创建成功，进入设计器')
    await router.push(`/agent/graph-designer/${id}`)
  } catch (err) {
    // 取消输入（err === 'cancel'）或操作失败均静默
    if (err && (err as Error).message && (err as Error).message.includes('cancel')) return
    if (err instanceof Error && err.message !== 'cancel') {
      ElMessage.error((err as ApiError).msg ?? '创建图定义失败')
    }
  }
}

/** 编辑：跳设计器画布页 */
function handleEdit(row: AgentGraphDef) {
  void router.push(`/agent/graph-designer/${row.id}`)
}

/** 发布：二次确认 → defVersion 递增 */
async function handlePublish(row: AgentGraphDef) {
  try {
    await ElMessageBox.confirm(
      `确认发布「${row.name}」？发布将生成新版本快照，之后仍可继续编辑并再次发布。`,
      '发布确认',
      { confirmButtonText: '发布', cancelButtonText: '取消', type: 'warning' },
    )
    const published = await publishGraphDef(row.id)
    ElMessage.success(`发布成功，当前版本 v${published.defVersion}`)
    void loadList()
  } catch (err) {
    if (err && err !== 'cancel') {
      ElMessage.error((err as ApiError).msg ?? '发布失败')
    }
  }
}

/** 删除：二次确认 → 逻辑删除 */
async function handleDelete(row: AgentGraphDef) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.name}」？删除后不可恢复。`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
    await deleteGraphDef(row.id)
    ElMessage.success('删除成功')
    void loadList()
  } catch (err) {
    if (err && err !== 'cancel') {
      ElMessage.error((err as ApiError).msg ?? '删除失败')
    }
  }
}

/** 调试：输入文本 → 创建调试会话 → 跳转调试页（仅 PUBLISHED） */
async function handleDebug(row: AgentGraphDef) {
  try {
    const { value: input } = await ElMessageBox.prompt('请输入调试输入', '单步调试', {
      confirmButtonText: '开始调试',
      cancelButtonText: '取消',
      inputPattern: /\S/,
      inputErrorMessage: '输入不能为空',
    })
    if (input === undefined || input === null) return
    const session = await createDebugSession({ graphDefId: row.id, input: String(input) })
    ElMessage.success('调试会话已创建')
    await router.push(`/agent/debug/${session.id}`)
  } catch (err) {
    if (err && err !== 'cancel') {
      ElMessage.error((err as ApiError).msg ?? '创建调试会话失败')
    }
  }
}

/** 查看执行历史：跳转到执行列表页，带 graphDefId 过滤条件 */
function handleViewExecutions(row: AgentGraphDef) {
  void router.push({
    name: 'agent-execution-list',
    query: { graphDefId: row.id },
  })
}

onMounted(() => {
  void loadList()
})
</script>

<template>
  <StandardListTemplate
    title="图定义管理"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <el-button v-if="canManage" type="primary" @click="handleCreate">新建</el-button>
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
      <el-table-column prop="name" label="图名称" min-width="160" />
      <el-table-column prop="graphKey" label="图 Key" min-width="180">
        <template #default="{ row }">
          {{ (row as AgentGraphDef).graphKey ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column label="版本" width="80">
        <template #default="{ row }"> v{{ (row as AgentGraphDef).defVersion }} </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType((row as AgentGraphDef).status)" size="small">
            {{ getStatusLabel((row as AgentGraphDef).status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updateTime" label="更新时间" width="180" />
      <el-table-column label="操作" width="320" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="handleEdit(row as AgentGraphDef)">
            编辑
          </el-button>
          <el-button
            v-if="canManage"
            size="small"
            link
            type="success"
            @click="handlePublish(row as AgentGraphDef)"
          >
            发布
          </el-button>
          <el-button
            v-if="canManage"
            size="small"
            link
            type="danger"
            @click="handleDelete(row as AgentGraphDef)"
          >
            删除
          </el-button>
          <el-button
            v-if="(row as AgentGraphDef).status === 'PUBLISHED'"
            size="small"
            link
            type="warning"
            @click="handleDebug(row as AgentGraphDef)"
          >
            调试
          </el-button>
          <!-- 执行历史入口：从图定义上下文进入运行记录 -->
          <el-button
            size="small"
            link
            type="info"
            @click="handleViewExecutions(row as AgentGraphDef)"
          >
            执行历史
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>
</template>
