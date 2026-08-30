<script setup lang="ts">
/**
 * ModelList — 大模型配置列表页（页型 B）。
 *
 * 分页 + 名称关键字查询；表格展示名称 / 协议 / 模型名 / API 地址 / 启停 /
 * 多 Key 分组 / 优先级 / 锁定状态（lockedUntil 只读）/ 更新时间 / 脱敏 Key。
 * 操作：新建、查看/编辑（同一弹窗 ModelFormDialog）、连通性测试、删除。
 *
 * 安全边界（M07-F01）：
 *   - 列表只渲染后端返回的 apiKeyMasked 脱敏值，不加工、不构造明文；
 *   - lockedUntil 仅只读展示（null/已过期=正常，未过期=冷却中），无任何可写入口。
 *
 * 权限：页面本身走菜单驱动路由（sys_menu V26 行 permission=agent:model:view）；
 * 新建/删除走 agent:model:manage、连通性测试走 agent:model:test（前端 hasPerm
 * 仅 UX 显隐，真实鉴权在后端 @ss.hasPermi）。
 *
 * 连通性测试语义（对齐后端）：success=true 服务端可达（含 4xx 鉴权/路径问题），
 * false=网络不可达；结果直接展示后端 message 与 latencyMs，不自行改判。
 * 测试为纯只读探测，不改变 enabled 状态。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
import { deleteModel, pageModels, testModelConnection } from '@/modules/agent/api'
import type { AgentModelConfig, AgentModelTestConnectionResp } from '@/contracts/agent'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import { usePermission } from '@/foundation/permission'
import ModelFormDialog from './ModelFormDialog.vue'

const { hasPerm } = usePermission()

// ─── 协议类型映射（openai/ollama/other 三值，未知值原样显示） ───

const PROTOCOL_MAP: Record<string, string> = {
  openai: 'OpenAI',
  ollama: 'Ollama',
  other: '其他',
}

function getProtocolLabel(protocolType: string): string {
  return PROTOCOL_MAP[protocolType] ?? protocolType
}

// ─── 锁定状态（运行态只读展示） ───

interface LockState {
  active: boolean
  label: string
}

function getLockState(row: AgentModelConfig): LockState {
  if (!row.lockedUntil) return { active: false, label: '' }
  const t = new Date(row.lockedUntil).getTime()
  if (!Number.isFinite(t) || t <= Date.now()) return { active: false, label: '' }
  return { active: true, label: `冷却至 ${row.lockedUntil}` }
}

// ─── 列表状态 ───

const list = ref<AgentModelConfig[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const filter = reactive({ name: '' })
const currentKeyword = ref('')

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)
const canManage = computed(() => hasPerm('agent:model:manage'))
const canTest = computed(() => hasPerm('agent:model:test'))

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const page: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageModels(page, currentKeyword.value)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载大模型配置列表失败'
    }
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  currentKeyword.value = filter.name.trim()
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.name = ''
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

// ─── 弹窗（新增/编辑共用） ───

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)

function openCreate() {
  editingId.value = null
  dialogVisible.value = true
}

function openEdit(row: AgentModelConfig) {
  editingId.value = row.id
  dialogVisible.value = true
}

function handleSaved() {
  void loadList()
}

// ─── 连通性测试（纯只读探测） ───

const testingId = ref<number | null>(null)
const testDialogVisible = ref(false)
const testResult = ref<AgentModelTestConnectionResp | null>(null)
const testRowName = ref('')

async function handleTest(row: AgentModelConfig) {
  testingId.value = row.id
  try {
    const resp = await testModelConnection(row.id)
    testResult.value = resp
    testRowName.value = row.name
    testDialogVisible.value = true
  } catch (err) {
    // 请求层业务码异常：直接透出后端消息，不改判语义
    ElMessage.error(err instanceof ApiError ? err.msg : '连通性测试失败')
  } finally {
    testingId.value = null
  }
}

function closeTestDialog() {
  testDialogVisible.value = false
  testResult.value = null
}

// ─── 删除（二次确认） ───

async function handleDelete(row: AgentModelConfig) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.name}」？删除后不可恢复。`, '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }
  try {
    await deleteModel(row.id)
    ElMessage.success('删除成功')
    void loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('删除失败')
    }
  }
}

// el-table row slot 的 DefaultRow 类型不与 AgentModelConfig 兼容，通过包装函数桥接。
function testRow(r: unknown) {
  void handleTest(r as AgentModelConfig)
}
function editRow(r: unknown) {
  openEdit(r as AgentModelConfig)
}
function deleteRow(r: unknown) {
  void handleDelete(r as AgentModelConfig)
}

onMounted(() => {
  void loadList()
})
</script>

<template>
  <StandardListTemplate
    title="大模型管理"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <el-button v-if="canManage" type="primary" @click="openCreate">新建</el-button>
    </template>

    <template #filter>
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

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="name" label="名称" min-width="180">
        <template #default="{ row }">
          {{ (row as AgentModelConfig).name }}
          <el-tag
            v-if="(row as AgentModelConfig).apiKeyMasked"
            size="small"
            type="info"
            style="margin-left: 6px"
          >
            {{ (row as AgentModelConfig).apiKeyMasked }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="协议类型" width="110">
        <template #default="{ row }">
          {{ getProtocolLabel((row as AgentModelConfig).protocolType) }}
        </template>
      </el-table-column>
      <el-table-column prop="modelName" label="模型名称" min-width="140" />
      <el-table-column label="API 地址" min-width="220">
        <template #default="{ row }">
          <span class="base-url" :title="(row as AgentModelConfig).baseUrl">
            {{ (row as AgentModelConfig).baseUrl }}
          </span>
        </template>
      </el-table-column>
      <el-table-column label="启停" width="80" align="center">
        <template #default="{ row }">
          <el-tag :type="(row as AgentModelConfig).enabled ? 'success' : 'info'" size="small">
            {{ (row as AgentModelConfig).enabled ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="多 Key 分组" width="130">
        <template #default="{ row }">
          {{ (row as AgentModelConfig).groupKey ?? '-' }}
        </template>
      </el-table-column>
      <el-table-column prop="sort" label="优先级" width="80" align="center" />
      <el-table-column label="锁定状态" width="170">
        <template #default="{ row }">
          <template v-if="getLockState(row as AgentModelConfig).active">
            <el-tag type="warning" size="small">
              {{ getLockState(row as AgentModelConfig).label }}
            </el-tag>
          </template>
          <template v-else>
            <el-tag type="success" size="small">正常</el-tag>
          </template>
        </template>
      </el-table-column>
      <el-table-column prop="updateTime" label="更新时间" width="180" />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="editRow(row)">编辑</el-button>
          <el-button
            v-if="canTest"
            size="small"
            link
            type="success"
            :loading="testingId === (row as AgentModelConfig).id"
            :disabled="testingId !== null"
            @click="testRow(row)"
          >
            连通性测试
          </el-button>
          <el-button v-if="canManage" size="small" link type="danger" @click="deleteRow(row)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <template #empty-action>
      <el-button v-if="canManage" type="primary" @click="openCreate">新建大模型配置</el-button>
    </template>
  </StandardListTemplate>

  <ModelFormDialog
    :visible="dialogVisible"
    :model-id="editingId"
    @update:visible="dialogVisible = $event"
    @saved="handleSaved"
  />

  <!-- 连通性测试结果（直接展示后端结论，不自行改判语义） -->
  <el-dialog
    v-model="testDialogVisible"
    title="连通性测试结果"
    :close-on-click-modal="false"
    width="480px"
    @closed="closeTestDialog"
  >
    <template v-if="testResult">
      <div class="test-result">
        <div class="test-result__name">配置：{{ testRowName }}</div>
        <el-alert
          :title="`测试结果：${testResult.success ? '服务可达' : '网络不可达'}`"
          :type="testResult.success ? 'success' : 'error'"
          :closable="false"
          show-icon
        />
        <div class="test-result__detail">
          <div>后端消息：{{ testResult.message }}</div>
          <div>探测耗时：{{ testResult.latencyMs }} ms</div>
        </div>
      </div>
    </template>
    <template #footer>
      <el-button @click="closeTestDialog">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.base-url {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

.test-result {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-12);
}

.test-result__name {
  font-size: var(--sw-font-secondary);
  color: var(--sw-text-secondary);
}

.test-result__detail {
  font-size: var(--sw-font-body);
  color: var(--sw-text-primary);
  line-height: 1.8;
}
</style>
