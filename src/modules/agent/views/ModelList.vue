<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * ModelList — 供应商/模型两级管理页（页型 B，F1 D022-02）。
 *
 * 双 Tab：供应商（名称 / API 格式 / API 地址 / 启停 / 脱敏 Key / 更新时间，
 * ProviderFormDialog 增改删）与 模型（所属供应商 / 名称 / 模型名 / 能力 / 启停 /
 * 多 Key 分组 / 优先级 / 锁定状态（lockedUntil 只读）/ 更新时间；ModelFormDialog
 * 增改、连通性测试、删除；支持按供应商过滤）。
 *
 * 安全边界：列表只渲染后端返回的 apiKeyMasked 脱敏值，不加工、不构造明文；
 * lockedUntil 仅只读展示，无任何可写入口。
 *
 * 权限：页面本身走菜单驱动路由（permission=agent:model:view）；
 * 新建/删除走 agent:model:manage、连通性测试走 agent:model:test（前端 hasPerm
 * 仅 UX 显隐，真实鉴权在后端 @ss.hasPermi）。
 *
 * 连通性测试语义（对齐后端 F1）：真实最小调用（chat "ping"），success=true 才可用；
 * 结果直接展示后端 message 与 latencyMs，不自行改判。测试为纯只读探测。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ListFilterItem, StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import {
  deleteModel,
  pageModels,
  testModelConnection,
  pageProviders,
  deleteProvider,
} from '@/modules/agent/api'
import type { AgentModel, AgentProvider, AgentModelTestConnectionResp } from '@/contracts/agent'
import type { PageQuery } from '@/contracts/common'
import { ApiError } from '@/foundation/request'
import { usePermission } from '@/foundation/permission'
import ModelFormDialog from './ModelFormDialog.vue'
import ProviderFormDialog from './ProviderFormDialog.vue'

const { hasPerm } = usePermission()

// ─── API 格式映射（三值契约，未知值原样显示） ───

const API_FORMAT_MAP: Record<string, string> = {
  OPENAI_CHAT: 'OpenAI Chat',
  OPENAI_RESPONSES: 'OpenAI Responses',
  ANTHROPIC: 'Anthropic',
}

function getApiFormatLabel(apiFormat: string | null | undefined): string {
  if (!apiFormat) return '-'
  return API_FORMAT_MAP[apiFormat] ?? apiFormat
}

// ─── 锁定状态（运行态只读展示） ───

interface LockState {
  active: boolean
  label: string
}

function getLockState(row: AgentModel): LockState {
  if (!row.lockedUntil) return { active: false, label: '' }
  const lockedMs = new Date(row.lockedUntil).getTime()
  if (!Number.isFinite(lockedMs) || lockedMs <= Date.now()) return { active: false, label: '' }
  return { active: true, label: t('agent.coolingUntil', { lockedUntil: row.lockedUntil }) }
}

// ─── 列表状态 ───

const list = ref<AgentModel[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const filter = reactive({ name: '', providerId: null as number | null })
const currentKeyword = ref('')
const currentProviderId = ref<number | null>(null)

// ─── 供应商 Tab 状态 ───

const activeTab = ref<'models' | 'providers'>('models')
const providers = ref<AgentProvider[]>([])
const providerTotal = ref(0)
const providerPageNum = ref(1)
const providerPageSize = ref(10)
const providersLoading = ref(false)
const providersErrorMsg = ref('')

/** 模型过滤下拉用的供应商选项（与供应商 Tab 同源分页拉全量第一页足够演示量级） */
const providerFilterOptions = ref<AgentProvider[]>([])

async function loadProviderFilterOptions() {
  try {
    const result = await pageProviders({ pageNum: 1, pageSize: 100 }, '')
    providerFilterOptions.value = result.list
  } catch {
    providerFilterOptions.value = []
  }
}

async function loadProviders() {
  providersLoading.value = true
  providersErrorMsg.value = ''
  try {
    const page: PageQuery = {
      pageNum: providerPageNum.value,
      pageSize: providerPageSize.value,
    }
    const result = await pageProviders(page, currentKeyword.value)
    providers.value = result.list
    providerTotal.value = result.total
  } catch (err) {
    providersErrorMsg.value = err instanceof ApiError ? err.msg : t('agent.modelListLoadFailed')
  } finally {
    providersLoading.value = false
  }
}

const isEmpty = computed(() =>
  activeTab.value === 'models'
    ? !loading.value && !errorMsg.value && list.value.length === 0
    : !providersLoading.value && !providersErrorMsg.value && providers.value.length === 0,
)
const canManage = computed(() => hasPerm('agent:model:manage'))
const canTest = computed(() => hasPerm('agent:model:test'))

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const page: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageModels(
      page,
      currentProviderId.value ?? undefined,
      currentKeyword.value,
    )
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('agent.modelListLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  currentKeyword.value = filter.name.trim()
  currentProviderId.value = filter.providerId
  pageNum.value = 1
  if (activeTab.value === 'providers') {
    void loadProviders()
  } else {
    void loadList()
  }
}

function handleReset() {
  filter.name = ''
  filter.providerId = null
  currentKeyword.value = ''
  currentProviderId.value = null
  pageNum.value = 1
  providerPageNum.value = 1
  if (activeTab.value === 'providers') {
    void loadProviders()
  } else {
    void loadList()
  }
}

function handleTabChange(tab: string | number) {
  activeTab.value = tab === 'providers' ? 'providers' : 'models'
  pageNum.value = 1
  providerPageNum.value = 1
  if (activeTab.value === 'providers') {
    void loadProviders()
  } else {
    void loadList()
  }
}

function handleProviderPageNumChange(p: number) {
  providerPageNum.value = p
  void loadProviders()
}

function handleProviderPageSizeChange(sz: number) {
  providerPageSize.value = sz
  providerPageNum.value = 1
  void loadProviders()
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

// ─── 弹窗（模型 + 供应商，新增/编辑共用） ───

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)

const providerDialogVisible = ref(false)
const editingProviderId = ref<number | null>(null)

function openCreate() {
  editingId.value = null
  dialogVisible.value = true
}

function openEdit(row: AgentModel) {
  editingId.value = row.id
  dialogVisible.value = true
}

function openProviderCreate() {
  editingProviderId.value = null
  providerDialogVisible.value = true
}

function openProviderEdit(row: AgentProvider) {
  editingProviderId.value = row.id
  providerDialogVisible.value = true
}

function handleSaved() {
  void loadList()
  void loadProviderFilterOptions()
}

function handleProviderSaved() {
  void loadProviders()
  void loadProviderFilterOptions()
}

async function handleProviderDelete(row: AgentProvider) {
  try {
    await ElMessageBox.confirm(
      t('agent.confirmDeleteProvider', { name: row.name }),
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
  } catch {
    return // 用户取消
  }
  try {
    await deleteProvider(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    void loadProviders()
    void loadProviderFilterOptions()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error(t('common.deleteFailed'))
    }
  }
}

// ─── 连通性测试（纯只读探测） ───

const testingId = ref<number | null>(null)
const testDialogVisible = ref(false)
const testResult = ref<AgentModelTestConnectionResp | null>(null)
const testRowName = ref('')

async function handleTest(row: AgentModel) {
  testingId.value = row.id
  try {
    const resp = await testModelConnection(row.id)
    testResult.value = resp
    testRowName.value = row.name
    testDialogVisible.value = true
  } catch (err) {
    // 请求层业务码异常：直接透出后端消息，不改判语义
    ElMessage.error(err instanceof ApiError ? err.msg : t('agent.connectivityTestFailed'))
  } finally {
    testingId.value = null
  }
}

function closeTestDialog() {
  testDialogVisible.value = false
  testResult.value = null
}

// ─── 删除（二次确认） ───

async function handleDelete(row: AgentModel) {
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
  } catch {
    return // 用户取消
  }
  try {
    await deleteModel(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    void loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error(t('common.deleteFailed'))
    }
  }
}

// el-table row slot 的 DefaultRow 类型不与业务实体兼容，通过包装函数桥接。
function testRow(r: unknown) {
  void handleTest(r as AgentModel)
}
function editRow(r: unknown) {
  openEdit(r as AgentModel)
}
function deleteRow(r: unknown) {
  void handleDelete(r as AgentModel)
}
function editProviderRow(r: unknown) {
  openProviderEdit(r as AgentProvider)
}
function deleteProviderRow(r: unknown) {
  void handleProviderDelete(r as AgentProvider)
}

function providerActions(r: unknown): ListAction[] {
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      onClick: () => editProviderRow(r),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      visible: canManage.value,
      onClick: () => deleteProviderRow(r),
    },
  ]
}

/** 统一操作列（V012-BUG-002）：编辑常显；连通性测试按 canTest 显隐（agent:model:test）；删除按 canManage 显隐（agent:model:manage） */
function rowActions(r: unknown): ListAction[] {
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      onClick: () => editRow(r),
    },
    {
      key: 'test',
      // B021-012：行内 2 字「测试」（「连通性测试」5 字挤爆 160 列），结果弹窗标题保留完整术语
      label: t('common.test'),
      type: 'success',
      visible: canTest.value,
      loading: testingId.value === (r as AgentModel).id,
      disabled: testingId.value !== null,
      onClick: () => testRow(r),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      visible: canManage.value,
      onClick: () => deleteRow(r),
    },
  ]
}

onMounted(() => {
  void loadList()
  void loadProviderFilterOptions()
})
</script>

<template>
  <StandardListTemplate
    :total="activeTab === 'models' ? total : providerTotal"
    :page-num="activeTab === 'models' ? pageNum : providerPageNum"
    :page-size="activeTab === 'models' ? pageSize : providerPageSize"
    :empty="isEmpty"
    @update:page-num="
      activeTab === 'models' ? handlePageNumChange($event) : handleProviderPageNumChange($event)
    "
    @update:page-size="
      activeTab === 'models' ? handlePageSizeChange($event) : handleProviderPageSizeChange($event)
    "
  >
    <template #toolbar-actions>
      <el-button
        v-if="canManage && activeTab === 'providers'"
        type="primary"
        @click="openProviderCreate"
        >{{ t('agent.newProvider') }}</el-button
      >
      <el-button v-if="canManage && activeTab === 'models'" type="primary" @click="openCreate">{{
        t('agent.newModel')
      }}</el-button>
    </template>

    <template #filter>
      <ListFilterItem :label="t('common.name')">
        <el-input
          v-model="filter.name"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="handleQuery"
        />
      </ListFilterItem>
      <ListFilterItem v-if="activeTab === 'models'" :label="t('agent.provider')">
        <el-select
          v-model="filter.providerId"
          :placeholder="t('common.all')"
          clearable
          style="width: 180px"
        >
          <el-option v-for="p in providerFilterOptions" :key="p.id" :label="p.name" :value="p.id" />
        </el-select>
      </ListFilterItem>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>

    <el-tabs :model-value="activeTab" @tab-change="handleTabChange">
      <el-tab-pane :label="t('agent.modelTab')" name="models">
        <el-alert
          v-if="errorMsg"
          :title="errorMsg"
          type="error"
          :closable="false"
          show-icon
          style="margin-bottom: 12px"
        />
        <el-table v-loading="loading" :data="list" stripe>
          <el-table-column prop="name" :label="t('common.name')" min-width="180">
            <template #default="{ row }">
              {{ (row as AgentModel).name }}
            </template>
          </el-table-column>
          <el-table-column :label="t('agent.provider')" min-width="160">
            <template #default="{ row }">
              {{ (row as AgentModel).providerName ?? '-' }}
              <el-tag size="small" type="info" style="margin-left: 6px">
                {{ getApiFormatLabel((row as AgentModel).providerApiFormat) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="modelName" :label="t('agent.modelName')" min-width="140" />
          <el-table-column :label="t('agent.capabilities')" width="110" align="center">
            <template #default="{ row }">
              {{ (row as AgentModel).capabilities || 'CHAT' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.toggle')" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="(row as AgentModel).enabled ? 'success' : 'info'" size="small">
                {{ (row as AgentModel).enabled ? t('common.enable') : t('common.disable') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('agent.multiKeyGroup')" width="130">
            <template #default="{ row }">
              {{ (row as AgentModel).groupKey ?? '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="sort" :label="t('agent.priority')" width="80" align="center" />
          <el-table-column :label="t('agent.lockStatus')" width="170">
            <template #default="{ row }">
              <template v-if="getLockState(row as AgentModel).active">
                <el-tag type="warning" size="small">
                  {{ getLockState(row as AgentModel).label }}
                </el-tag>
              </template>
              <template v-else>
                <el-tag type="success" size="small">{{ t('common.statusNormal') }}</el-tag>
              </template>
            </template>
          </el-table-column>
          <el-table-column prop="updateTime" :label="t('common.updateTime')" width="180" />
          <ListActionsColumn :actions="rowActions" :width="150" />
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('agent.providerTab')" name="providers">
        <el-alert
          v-if="providersErrorMsg"
          :title="providersErrorMsg"
          type="error"
          :closable="false"
          show-icon
          style="margin-bottom: 12px"
        />
        <el-table v-loading="providersLoading" :data="providers" stripe>
          <el-table-column prop="name" :label="t('common.name')" min-width="160">
            <template #default="{ row }">
              {{ (row as AgentProvider).name }}
              <el-tag
                v-if="(row as AgentProvider).apiKeyMasked"
                size="small"
                type="info"
                style="margin-left: 6px"
              >
                {{ (row as AgentProvider).apiKeyMasked }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column :label="t('agent.apiFormat')" width="150">
            <template #default="{ row }">
              {{ getApiFormatLabel((row as AgentProvider).apiFormat) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('agent.apiUrl')" min-width="220">
            <template #default="{ row }">
              <span class="base-url" :title="(row as AgentProvider).baseUrl">
                {{ (row as AgentProvider).baseUrl }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.toggle')" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="(row as AgentProvider).enabled ? 'success' : 'info'" size="small">
                {{ (row as AgentProvider).enabled ? t('common.enable') : t('common.disable') }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="updateTime" :label="t('common.updateTime')" width="180" />
          <ListActionsColumn :actions="providerActions" :width="150" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </StandardListTemplate>

  <ModelFormDialog
    :visible="dialogVisible"
    :model-id="editingId"
    @update:visible="dialogVisible = $event"
    @saved="handleSaved"
  />

  <ProviderFormDialog
    :visible="providerDialogVisible"
    :provider-id="editingProviderId"
    @update:visible="providerDialogVisible = $event"
    @saved="handleProviderSaved"
  />

  <!-- 连通性测试结果（直接展示后端结论，不自行改判语义） -->
  <el-dialog
    v-model="testDialogVisible"
    :title="t('agent.connectivityTestResult')"
    :close-on-click-modal="false"
    width="480px"
    @closed="closeTestDialog"
  >
    <template v-if="testResult">
      <div class="test-result">
        <div class="test-result__name">{{ t('agent.testConfigLabel', { testRowName }) }}</div>
        <el-alert
          :title="
            t('agent.connectivityTestTitle', {
              result: testResult.success
                ? t('agent.serviceReachable')
                : t('agent.networkUnreachable'),
            })
          "
          :type="testResult.success ? 'success' : 'error'"
          :closable="false"
          show-icon
        />
        <div class="test-result__detail">
          <div>{{ t('agent.backendMessageLabel', { message: testResult.message }) }}</div>
          <div>{{ t('agent.probeLatencyLabel', { latencyMs: testResult.latencyMs }) }}</div>
        </div>
      </div>
    </template>
    <template #footer>
      <el-button @click="closeTestDialog">{{ t('common.close') }}</el-button>
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
