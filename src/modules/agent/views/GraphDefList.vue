<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
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
import { StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import {
  createDebugSession,
  createGraphDef,
  deleteGraphDef,
  listGraphDefVersions,
  pageGraphDefs,
  publishGraphDef,
  updateGraphDefSettings,
} from '@/modules/agent/api'
import type { AgentGraphDef, AgentGraphSnapshot } from '@/contracts/agent'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import { usePermission } from '@/foundation/permission'

const router = useRouter()
const { hasPerm } = usePermission()

// ─── 状态映射 ───

const STATUS_MAP: Record<string, { label: string; type: 'success' | 'warning' | 'info' }> = {
  DRAFT: {
    get label() {
      return t('common.statusDraft')
    },
    type: 'info',
  },
  PUBLISHED: {
    get label() {
      return t('common.statusPublished')
    },
    type: 'success',
  },
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
      errorMsg.value = t('agent.graphDefListLoadFailed')
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
    const { value: name } = await ElMessageBox.prompt(
      t('agent.graphNamePlaceholder'),
      t('agent.newGraphDef'),
      {
        get confirmButtonText() {
          return t('common.create')
        },
        get cancelButtonText() {
          return t('common.cancel')
        },
        inputPattern: /\S+/,
        get inputErrorMessage() {
          return t('agent.graphNameRequired')
        },
      },
    )
    if (!name) return
    const id = await createGraphDef(name)
    ElMessage.success(t('agent.graphCreatedEnteringDesigner'))
    await router.push(`/agent/graph-designer/${id}`)
  } catch (err) {
    // 取消输入（err === 'cancel'）或操作失败均静默
    if (err && (err as Error).message && (err as Error).message.includes('cancel')) return
    if (err instanceof Error && err.message !== 'cancel') {
      ElMessage.error((err as ApiError).msg ?? t('agent.graphDefCreateFailed'))
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
      t('agent.confirmPublishGraph', { name: row.name }),
      t('common.publishConfirmTitle'),
      {
        get confirmButtonText() {
          return t('common.publish')
        },
        get cancelButtonText() {
          return t('common.cancel')
        },
        type: 'warning',
      },
    )
    const published = await publishGraphDef(row.id)
    ElMessage.success(t('agent.graphPublished', { defVersion: published.defVersion }))
    void loadList()
  } catch (err) {
    if (err && err !== 'cancel') {
      ElMessage.error((err as ApiError).msg ?? t('common.publishFailed'))
    }
  }
}

/** 删除：二次确认 → 逻辑删除 */
async function handleDelete(row: AgentGraphDef) {
  try {
    await ElMessageBox.confirm(
      t('agent.confirmDeleteGraph', { name: row.name }),
      t('common.deleteConfirmTitle'),
      {
        get confirmButtonText() {
          return t('common.delete')
        },
        get cancelButtonText() {
          return t('common.cancel')
        },
        type: 'warning',
      },
    )
    await deleteGraphDef(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    void loadList()
  } catch (err) {
    if (err && err !== 'cancel') {
      ElMessage.error((err as ApiError).msg ?? t('common.deleteFailed'))
    }
  }
}

/** 调试：输入文本 → 创建调试会话 → 跳转调试页（仅 PUBLISHED） */
async function handleDebug(row: AgentGraphDef) {
  try {
    const { value: input } = await ElMessageBox.prompt(
      t('agent.debugInputPlaceholder'),
      t('agent.stepDebug'),
      {
        get confirmButtonText() {
          return t('agent.startDebug')
        },
        get cancelButtonText() {
          return t('common.cancel')
        },
        inputPattern: /\S/,
        get inputErrorMessage() {
          return t('agent.inputRequired')
        },
      },
    )
    if (input === undefined || input === null) return
    const session = await createDebugSession({ graphDefId: row.id, input: String(input) })
    ElMessage.success(t('agent.debugSessionCreated'))
    await router.push(`/agent/debug/${session.id}`)
  } catch (err) {
    if (err && err !== 'cancel') {
      ElMessage.error((err as ApiError).msg ?? t('agent.debugSessionCreateFailed'))
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

// ─── 发布版本列表（D022-06） ───

const versionsVisible = ref(false)
const versionsLoading = ref(false)
const versions = ref<AgentGraphSnapshot[]>([])
const versionsGraphName = ref('')

async function handleVersions(row: AgentGraphDef) {
  versionsGraphName.value = row.name
  versions.value = []
  versionsVisible.value = true
  versionsLoading.value = true
  try {
    versions.value = await listGraphDefVersions(row.id)
  } catch (err) {
    ElMessage.error((err as ApiError).msg ?? t('agent.graphVersionsLoadFailed'))
  } finally {
    versionsLoading.value = false
  }
}

// ─── 图设置（执行超时） ───

const settingsVisible = ref(false)
const settingsSaving = ref(false)
const settingsForm = ref({ id: 0, name: '', executionTimeoutSeconds: 300 })

function handleSettings(row: AgentGraphDef) {
  settingsForm.value = {
    id: row.id,
    name: row.name,
    executionTimeoutSeconds: row.executionTimeoutSeconds ?? 300,
  }
  settingsVisible.value = true
}

async function saveSettings() {
  const seconds = Number(settingsForm.value.executionTimeoutSeconds)
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 3600) {
    ElMessage.warning(t('agent.executionTimeoutInvalid'))
    return
  }
  settingsSaving.value = true
  try {
    await updateGraphDefSettings(settingsForm.value.id, seconds)
    ElMessage.success(t('agent.graphSettingsSaved'))
    settingsVisible.value = false
    void loadList()
  } catch (err) {
    ElMessage.error((err as ApiError).msg ?? t('agent.graphSettingsSaveFailed'))
  } finally {
    settingsSaving.value = false
  }
}

/** 统一操作列（V012-BUG-002）：编辑/执行历史常显；发布/删除按 canManage 显隐；源码调试仅 PUBLISHED 可用 */
function rowActions(r: unknown): ListAction[] {
  const row = r as AgentGraphDef
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      onClick: () => handleEdit(row),
    },
    {
      key: 'publish',
      label: t('common.publish'),
      type: 'success',
      visible: canManage.value,
      onClick: () => void handlePublish(row),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      visible: canManage.value,
      onClick: () => void handleDelete(row),
    },
    {
      key: 'debug',
      label: t('agent.sourceDebug'),
      type: 'warning',
      visible: row.status === 'PUBLISHED',
      onClick: () => void handleDebug(row),
    },
    {
      key: 'executions',
      label: t('router.executionHistory'),
      type: 'info',
      onClick: () => handleViewExecutions(row),
    },
    {
      key: 'versions',
      label: t('agent.graphVersions'),
      type: 'info',
      visible: row.status === 'PUBLISHED',
      onClick: () => void handleVersions(row),
    },
    {
      key: 'settings',
      label: t('agent.graphSettings'),
      type: 'info',
      visible: canManage.value,
      onClick: () => handleSettings(row),
    },
  ]
}

onMounted(() => {
  void loadList()
})
</script>

<template>
  <StandardListTemplate
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <el-button v-if="canManage" type="primary" @click="handleCreate">{{
        t('common.create')
      }}</el-button>
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
      <el-table-column prop="name" :label="t('agent.graphName')" min-width="160" />
      <el-table-column prop="graphKey" :label="t('agent.graphKey')" min-width="180">
        <template #default="{ row }">
          {{ (row as AgentGraphDef).graphKey ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.version')" width="80">
        <template #default="{ row }"> v{{ (row as AgentGraphDef).defVersion }} </template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="getStatusType((row as AgentGraphDef).status)" size="small">
            {{ getStatusLabel((row as AgentGraphDef).status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updateTime" :label="t('common.updateTime')" width="180" />
      <ListActionsColumn :actions="rowActions" :width="220" />
    </el-table>

    <!-- 发布版本列表（D022-06） -->
    <el-dialog v-model="versionsVisible" :title="t('agent.graphVersions')" width="520px">
      <div class="versions-title">{{ versionsGraphName }}</div>
      <el-table v-loading="versionsLoading" :data="versions" size="small">
        <el-table-column :label="t('common.version')" width="100">
          <template #default="{ row }">v{{ (row as AgentGraphSnapshot).defVersion }}</template>
        </el-table-column>
        <el-table-column prop="graphKey" :label="t('agent.graphKey')" min-width="160" />
        <el-table-column prop="createTime" :label="t('agent.publishedAt')" width="190" />
      </el-table>
      <el-empty
        v-if="!versionsLoading && versions.length === 0"
        :description="t('agent.noGraphVersions')"
      />
    </el-dialog>

    <!-- 图设置：执行超时 -->
    <el-dialog v-model="settingsVisible" :title="t('agent.graphSettings')" width="460px">
      <el-form label-width="140px">
        <el-form-item :label="t('agent.executionTimeoutLabel')">
          <el-input-number v-model="settingsForm.executionTimeoutSeconds" :min="1" :max="3600" />
        </el-form-item>
        <el-form-item>
          <span class="settings-hint">{{ t('agent.executionTimeoutHint') }}</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settingsVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="settingsSaving" @click="saveSettings">{{
          t('common.save')
        }}</el-button>
      </template>
    </el-dialog>
  </StandardListTemplate>
</template>

<style scoped>
.versions-title {
  margin-bottom: 10px;
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-secondary);
}

.settings-hint {
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-secondary);
}
</style>
