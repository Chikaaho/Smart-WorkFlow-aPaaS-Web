<script setup lang="ts">
/**
 * ToolList — 工具管理列表页（M07-F03-02）。
 *
 * Tab 切换：内部工具 / 外部 HTTP 工具。每个 Tab 下独立分页 + 名称关键字查询；
 * 表格展示工具名 / 描述 / 启停 / 更新时间 / 操作（编辑/启停/删除）。
 * 新建/编辑分别使用 InternalToolFormDialog / ExternalToolFormDialog 弹窗。
 *
 * 权限：菜单路由 agent:tool:view；新建/编辑/删除/启停 agent:tool:manage。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
import {
  pageInternalTools,
  pageExternalTools,
  deleteInternalTool,
  deleteExternalTool,
  toggleInternalTool,
  toggleExternalTool,
} from '@/modules/agent/api'
import type { AgentToolInternalConfig, AgentToolExternalConfig } from '@/contracts/agent'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import { usePermission } from '@/foundation/permission'
import InternalToolFormDialog from './InternalToolFormDialog.vue'
import ExternalToolFormDialog from './ExternalToolFormDialog.vue'

const { hasPerm } = usePermission()

// ─── Tab 切换 ───

const activeTab = ref<'internal' | 'external'>('internal')

// ─── 通用列表状态 ───

const loading = ref(false)
const errorMsg = ref('')
const filter = reactive({ name: '' })
const currentKeyword = ref('')

// ─── 内部工具列表状态 ───

const internalList = ref<AgentToolInternalConfig[]>([])
const internalTotal = ref(0)
const internalPageNum = ref(1)
const internalPageSize = ref(10)

// ─── 外部工具列表状态 ───

const externalList = ref<AgentToolExternalConfig[]>([])
const externalTotal = ref(0)
const externalPageNum = ref(1)
const externalPageSize = ref(10)

// ─── 计算属性 ───

const currentList = computed(() =>
  activeTab.value === 'internal' ? internalList.value : externalList.value,
)
const currentTotal = computed(() =>
  activeTab.value === 'internal' ? internalTotal.value : externalTotal.value,
)
const currentPageNum = computed(() =>
  activeTab.value === 'internal' ? internalPageNum.value : externalPageNum.value,
)
const currentPageSize = computed(() =>
  activeTab.value === 'internal' ? internalPageSize.value : externalPageSize.value,
)
const isEmpty = computed(() => !loading.value && !errorMsg.value && currentList.value.length === 0)
const canManage = computed(() => hasPerm('agent:tool:manage'))

// ─── 数据加载 ───

async function loadInternalTools() {
  loading.value = true
  errorMsg.value = ''
  try {
    const page: PageQuery = { pageNum: internalPageNum.value, pageSize: internalPageSize.value }
    const result = await pageInternalTools(page, currentKeyword.value)
    internalList.value = result.list
    internalTotal.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载内部工具列表失败'
    }
  } finally {
    loading.value = false
  }
}

async function loadExternalTools() {
  loading.value = true
  errorMsg.value = ''
  try {
    const page: PageQuery = { pageNum: externalPageNum.value, pageSize: externalPageSize.value }
    const result = await pageExternalTools(page, currentKeyword.value)
    externalList.value = result.list
    externalTotal.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载外部工具列表失败'
    }
  } finally {
    loading.value = false
  }
}

function loadCurrentList() {
  if (activeTab.value === 'internal') {
    void loadInternalTools()
  } else {
    void loadExternalTools()
  }
}

// ─── 搜索 ───

function handleQuery() {
  currentKeyword.value = filter.name.trim()
  if (activeTab.value === 'internal') {
    internalPageNum.value = 1
  } else {
    externalPageNum.value = 1
  }
  loadCurrentList()
}

function handleReset() {
  filter.name = ''
  currentKeyword.value = ''
  if (activeTab.value === 'internal') {
    internalPageNum.value = 1
  } else {
    externalPageNum.value = 1
  }
  loadCurrentList()
}

function handleTabChange() {
  filter.name = ''
  currentKeyword.value = ''
  loadCurrentList()
}

// ─── 分页 ───

function handlePageNumChange(p: number) {
  if (activeTab.value === 'internal') {
    internalPageNum.value = p
  } else {
    externalPageNum.value = p
  }
  loadCurrentList()
}

function handlePageSizeChange(s: number) {
  if (activeTab.value === 'internal') {
    internalPageSize.value = s
    internalPageNum.value = 1
  } else {
    externalPageSize.value = s
    externalPageNum.value = 1
  }
  loadCurrentList()
}

// ─── 启停 ───

const togglingId = ref<number | null>(null)

async function handleToggle(row: AgentToolInternalConfig | AgentToolExternalConfig) {
  togglingId.value = row.id
  try {
    if (activeTab.value === 'internal') {
      await toggleInternalTool(row.id, !row.enabled)
    } else {
      await toggleExternalTool(row.id, !row.enabled)
    }
    ElMessage.success(row.enabled ? '已停用' : '已启用')
    loadCurrentList()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('启停操作失败')
    }
  } finally {
    togglingId.value = null
  }
}

// ─── 弹窗（新增/编辑） ───

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)

function openCreate() {
  editingId.value = null
  dialogVisible.value = true
}

function openEdit(row: AgentToolInternalConfig | AgentToolExternalConfig) {
  editingId.value = row.id
  dialogVisible.value = true
}

function handleSaved() {
  loadCurrentList()
}

// ─── 删除 ───

async function handleDelete(row: AgentToolInternalConfig | AgentToolExternalConfig) {
  const typeLabel = activeTab.value === 'internal' ? '内部工具' : '外部工具'
  try {
    await ElMessageBox.confirm(
      `确认删除${typeLabel}「${row.name}」？删除后不可恢复。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }
  try {
    if (activeTab.value === 'internal') {
      await deleteInternalTool(row.id)
    } else {
      await deleteExternalTool(row.id)
    }
    ElMessage.success('删除成功')
    loadCurrentList()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('删除失败')
    }
  }
}

// ─── 表格行操作桥接 ───

function editRow(r: unknown) {
  openEdit(r as AgentToolInternalConfig | AgentToolExternalConfig)
}
function toggleRow(r: unknown) {
  void handleToggle(r as AgentToolInternalConfig | AgentToolExternalConfig)
}
function deleteRow(r: unknown) {
  void handleDelete(r as AgentToolInternalConfig | AgentToolExternalConfig)
}

onMounted(() => {
  loadCurrentList()
})
</script>

<template>
  <StandardListTemplate
    title="工具管理"
    :total="currentTotal"
    :page-num="currentPageNum"
    :page-size="currentPageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <el-button v-if="canManage" type="primary" @click="openCreate">
        新建{{ activeTab === 'internal' ? '内部工具' : '外部工具' }}
      </el-button>
    </template>

    <template #filter>
      <el-tabs v-model="activeTab" class="tool-tabs" @tab-change="handleTabChange">
        <el-tab-pane label="内部工具" name="internal" />
        <el-tab-pane label="外部 HTTP 工具" name="external" />
      </el-tabs>
      <el-input
        v-model="filter.name"
        placeholder="名称关键字"
        clearable
        style="width: 200px"
        @keyup.enter="handleQuery"
      />
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

    <!-- 内部工具表格 -->
    <el-table v-if="activeTab === 'internal'" v-loading="loading" :data="internalList" stripe>
      <el-table-column prop="name" label="工具名" min-width="160" />
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column label="Bean / 方法" min-width="220">
        <template #default="{ row }">
          <span class="mono-text">{{ (row as AgentToolInternalConfig).beanName }}</span>
          <span class="method-sep">.</span>
          <span class="mono-text">{{ (row as AgentToolInternalConfig).methodName }}</span>
        </template>
      </el-table-column>
      <el-table-column label="入参 Schema" width="100" align="center">
        <template #default="{ row }">
          <el-tag v-if="(row as AgentToolInternalConfig).inputSchema" size="small" type="success"
            >有</el-tag
          >
          <el-tag v-else size="small" type="info">无</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="启停" width="80" align="center">
        <template #default="{ row }">
          <el-tag
            :type="(row as AgentToolInternalConfig).enabled ? 'success' : 'info'"
            size="small"
          >
            {{ (row as AgentToolInternalConfig).enabled ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updateTime" label="更新时间" width="180" />
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canManage" size="small" link type="primary" @click="editRow(row)"
            >编辑</el-button
          >
          <el-button
            v-if="canManage"
            size="small"
            link
            :type="(row as AgentToolInternalConfig).enabled ? 'warning' : 'success'"
            :loading="togglingId === (row as AgentToolInternalConfig).id"
            @click="toggleRow(row)"
          >
            {{ (row as AgentToolInternalConfig).enabled ? '停用' : '启用' }}
          </el-button>
          <el-button v-if="canManage" size="small" link type="danger" @click="deleteRow(row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <!-- 外部 HTTP 工具表格 -->
    <el-table v-if="activeTab === 'external'" v-loading="loading" :data="externalList" stripe>
      <el-table-column prop="name" label="工具名" min-width="160" />
      <el-table-column prop="description" label="描述" min-width="200" show-overflow-tooltip />
      <el-table-column label="URL" min-width="260">
        <template #default="{ row }">
          <span class="url-text" :title="(row as AgentToolExternalConfig).url">
            {{ (row as AgentToolExternalConfig).url }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="方法" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small">{{ (row as AgentToolExternalConfig).httpMethod }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="超时(秒)" width="90" align="center">
        <template #default="{ row }">
          {{ (row as AgentToolExternalConfig).timeoutSeconds }}
        </template>
      </el-table-column>
      <el-table-column label="入参 Schema" width="100" align="center">
        <template #default="{ row }">
          <el-tag v-if="(row as AgentToolExternalConfig).inputSchema" size="small" type="success"
            >有</el-tag
          >
          <el-tag v-else size="small" type="info">无</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="启停" width="80" align="center">
        <template #default="{ row }">
          <el-tag
            :type="(row as AgentToolExternalConfig).enabled ? 'success' : 'info'"
            size="small"
          >
            {{ (row as AgentToolExternalConfig).enabled ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updateTime" label="更新时间" width="180" />
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button v-if="canManage" size="small" link type="primary" @click="editRow(row)"
            >编辑</el-button
          >
          <el-button
            v-if="canManage"
            size="small"
            link
            :type="(row as AgentToolExternalConfig).enabled ? 'warning' : 'success'"
            :loading="togglingId === (row as AgentToolExternalConfig).id"
            @click="toggleRow(row)"
          >
            {{ (row as AgentToolExternalConfig).enabled ? '停用' : '启用' }}
          </el-button>
          <el-button v-if="canManage" size="small" link type="danger" @click="deleteRow(row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <template #empty-action>
      <el-button v-if="canManage" type="primary" @click="openCreate">
        新建{{ activeTab === 'internal' ? '内部工具' : '外部工具' }}
      </el-button>
    </template>
  </StandardListTemplate>

  <InternalToolFormDialog
    v-if="activeTab === 'internal'"
    :visible="dialogVisible"
    :tool-id="editingId"
    @update:visible="dialogVisible = $event"
    @saved="handleSaved"
  />

  <ExternalToolFormDialog
    v-if="activeTab === 'external'"
    :visible="dialogVisible"
    :tool-id="editingId"
    @update:visible="dialogVisible = $event"
    @saved="handleSaved"
  />
</template>

<style scoped>
.tool-tabs {
  margin-right: 12px;
}

.mono-text {
  font-family: monospace;
  font-size: 13px;
}

.method-sep {
  color: var(--el-text-color-secondary);
  margin: 0 2px;
}

.url-text {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  font-family: monospace;
  font-size: 13px;
}
</style>
