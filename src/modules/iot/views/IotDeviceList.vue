<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * IotDeviceList — 设备管理（P21 A1）。
 *
 * 新增/发布/禁用/流程接入开关/连接状态刷新；管理状态与连接状态分离展示。
 * 设备列表复用既有 /iot/devices 接口；管理操作走 /iot/device-manage。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError, request } from '@/foundation/request'
import { enumLabel } from '@/foundation/i18n/enum-label'
import { ListActionsColumn, ListPagination } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { hasPerm } from '@/foundation/permission'
import {
  createDevice,
  publishDevice,
  changeDeviceStatus,
  changeDeviceProcessAccess,
  refreshDeviceStatus,
  listProducts,
  listDeviceCommands,
  manualVerifyCommand,
  type IotProduct,
  type IotDeviceCommandRecord,
} from '../api'

interface DeviceRow {
  id: number
  deviceKey: string
  name: string
  deviceType: string | null
  productId: string | null
  deviceName: string | null
  manageStatus: string
  processAccessEnabled: number
  status: string
  connectionId: number | null
  productRefId: number | null
  lastReportTime: string | null
}

const loading = ref(false)
/** 本次加载的失败原因；非空时页面显示错误态而不是空态。 */
const loadError = ref('')
const list = ref<DeviceRow[]>([])
const products = ref<IotProduct[]>([])

const dialogVisible = ref(false)
const form = reactive({
  deviceKey: '',
  name: '',
  deviceType: 'sensor',
  productRefId: undefined as number | undefined,
  connectionId: undefined as number | undefined,
})

const isEmpty = computed(
  () => !loading.value && !loadError.value && !loadError.value && list.value.length === 0,
)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    list.value = await request<DeviceRow[]>({ method: 'GET', url: '/iot/devices' })
    // 产品下拉是管理侧增强读（iot:product:manage）：核实员视角（iot:view + iot:command:verify）
    // 无该权限时降级为空选项，不阻塞设备列表与人工核实主路径（复核02 G6b 403横幅修复）
    try {
      products.value = await listProducts()
    } catch {
      products.value = []
    }
    pageNum.value = 1
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.msg : t('common.loadFailed')
  } finally {
    loading.value = false
  }
}

// ─── 客户端分页（V012-BUG-003）：一次拉全量，前端切片 ───
const pageNum = ref(1)
const pageSize = ref(10)

const pagedRows = computed(() =>
  list.value.slice((pageNum.value - 1) * pageSize.value, pageNum.value * pageSize.value),
)

function handlePageNumChange(p: number) {
  pageNum.value = p
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
}

function openCreate() {
  Object.assign(form, {
    deviceKey: '',
    name: '',
    deviceType: 'sensor',
    productRefId: undefined,
    connectionId: undefined,
  })
  dialogVisible.value = true
}

async function save() {
  await createDevice({ ...form })
  ElMessage.success(t('iot.deviceCreatedDraft'))
  dialogVisible.value = false
  void load()
}

async function handlePublish(row: DeviceRow) {
  try {
    await publishDevice(row.id)
    ElMessage.success(t('common.statusPublished'))
  } catch {
    ElMessage.error(t('iot.publishNeedsPublishedModel'))
  }
  void load()
}

async function handleDisable(row: DeviceRow) {
  await ElMessageBox.confirm(
    t('iot.disableDeviceConfirm', { name: row.name }),
    t('common.disable'),
    { type: 'warning' },
  )
  await changeDeviceStatus(row.id, 'DISABLED')
  ElMessage.success(t('common.statusDisabled'))
  void load()
}

async function handleProcessAccess(row: DeviceRow) {
  try {
    await changeDeviceProcessAccess(row.id, row.processAccessEnabled !== 1)
    ElMessage.success(t('iot.processAccessUpdated'))
  } catch {
    ElMessage.error(t('iot.processAccessNeedsPublish'))
  }
  void load()
}

async function handleRefresh(row: DeviceRow) {
  const status = await refreshDeviceStatus(row.id)
  ElMessage.info(t('iot.connectionStatusMessage', { status }))
  void load()
}

/** 设备命令回查与人工核实（P62 分级执行 S4/S5）。 */
const COMMAND_STATUS_TEXT: Record<string, string> = {
  QUEUED: '待发送',
  SENDING: '发送中',
  SENT: '已发送待回执',
  DELIVERED: '已送达',
  ACKED: '设备已确认',
  SUCCESS: '成功',
  FAILED: '失败',
  UNKNOWN: '结果未知（待核实）',
  EXPIRED: '已过期',
}

/** G08b：窄屏命令抽屉不超出视口（375 全宽，桌面 60%）。 */
const viewportWidth = ref(Number.MAX_SAFE_INTEGER)
const commandsDrawerSize = computed(() => (viewportWidth.value < 768 ? '100%' : '60%'))

const commandsVisible = ref(false)
const commandsLoading = ref(false)
const commandRows = ref<IotDeviceCommandRecord[]>([])
const commandDevice = ref<{ productId: string; deviceName: string } | null>(null)
/** 与后端一致的最小核实权限：仅 monitor:view 不足以改结果。 */
const canVerify = computed(() => hasPerm('iot:command:verify'))

const verifyVisible = ref(false)
const verifyCommand = ref<IotDeviceCommandRecord | null>(null)
const verifyOutcome = ref<'SUCCESS' | 'FAILED'>('SUCCESS')
const verifyBasis = ref('')
const verifySubmitting = ref(false)

function commandStatusText(status: string): string {
  return COMMAND_STATUS_TEXT[status] ?? status
}

async function openCommands(row: DeviceRow): Promise<void> {
  if (!row.productId) {
    ElMessage.warning('该设备缺少产品标识，无法回查命令')
    return
  }
  commandDevice.value = { productId: row.productId, deviceName: row.deviceName! }
  commandsVisible.value = true
  await loadCommands()
}

async function loadCommands(): Promise<void> {
  if (!commandDevice.value) return
  commandsLoading.value = true
  try {
    commandRows.value = await listDeviceCommands(
      commandDevice.value.productId,
      commandDevice.value.deviceName,
    )
  } catch (error) {
    commandRows.value = []
    ElMessage.error(error instanceof ApiError ? error.message : '命令回查失败，请稍后重试')
  } finally {
    commandsLoading.value = false
  }
}

function openVerify(row: IotDeviceCommandRecord): void {
  verifyCommand.value = row
  verifyOutcome.value = 'SUCCESS'
  verifyBasis.value = ''
  verifyVisible.value = true
}

async function submitVerify(): Promise<void> {
  const command = verifyCommand.value
  if (!command) return
  const basis = verifyBasis.value.trim()
  if (!basis) {
    ElMessage.warning('人工核实必须携带可信依据（如现场复核工单号）')
    return
  }
  verifySubmitting.value = true
  try {
    const decision = await manualVerifyCommand(command.id, verifyOutcome.value, basis)
    ElMessage.success(
      `已核实：${decision.statusBefore ?? 'UNKNOWN'} → ${decision.statusAfter ?? verifyOutcome.value}`,
    )
    verifyVisible.value = false
    await loadCommands()
  } catch (error) {
    ElMessage.error(error instanceof ApiError ? error.message : '人工核实失败，请稍后重试')
  } finally {
    verifySubmitting.value = false
  }
}

onMounted(() => {
  viewportWidth.value = globalThis.document.documentElement.clientWidth
  void load()
})

/** 统一操作列（V012-BUG-002）：发布/刷新状态互斥禁用按管理状态显隐 */
function rowActions(r: unknown): ListAction[] {
  const row = r as DeviceRow
  return [
    {
      key: 'publish',
      label: t('common.publish'),
      type: 'success',
      visible: row.manageStatus !== 'PUBLISHED',
      onClick: () => void handlePublish(row),
    },
    {
      key: 'refresh',
      label: t('iot.refreshStatus'),
      onClick: () => void handleRefresh(row),
    },
    {
      key: 'commands',
      label: '命令',
      visible: !!row.productId && !!row.deviceName,
      onClick: () => void openCommands(row),
    },
    {
      key: 'disable',
      label: t('common.disable'),
      type: 'danger',
      visible: row.manageStatus === 'PUBLISHED',
      onClick: () => void handleDisable(row),
    },
  ]
}
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px">
      <h3 style="margin: 0">{{ t('iot.deviceManagement') }}</h3>
      <el-button type="primary" @click="openCreate">{{ t('iot.newDevice') }}</el-button>
    </div>
    <el-alert
      v-if="loadError"
      :title="loadError"
      type="error"
      show-icon
      :closable="false"
      class="load-error"
    >
      <template #default>
        <el-button link type="primary" @click="load">{{ t('common.retry') }}</el-button>
      </template>
    </el-alert>

    <el-table v-loading="loading" :data="pagedRows" stripe>
      <el-table-column prop="deviceKey" :label="t('common.businessKey')" min-width="120" />
      <el-table-column prop="name" :label="t('common.name')" min-width="130" />
      <el-table-column prop="deviceType" :label="t('common.type')" width="90" />
      <el-table-column prop="productId" :label="t('iot.tencentIdentifier')" min-width="120" />
      <el-table-column :label="t('iot.managementStatus')" width="100">
        <template #default="{ row }">
          <el-tag
            :type="
              row.manageStatus === 'PUBLISHED'
                ? 'success'
                : row.manageStatus === 'DISABLED'
                  ? 'danger'
                  : 'info'
            "
            size="small"
          >
            {{ enumLabel('IOT_RELEASE_STATE', row.manageStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('iot.connectionStatus')" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ONLINE' ? 'success' : 'info'" size="small">{{
            enumLabel('IOT_DEVICE_ONLINE', row.status)
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('iot.processAccess')" width="90">
        <template #default="{ row }">
          <el-switch
            :model-value="row.processAccessEnabled === 1"
            @change="handleProcessAccess(row as DeviceRow)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="lastReportTime" :label="t('iot.lastReported')" min-width="150" />
      <ListActionsColumn :actions="rowActions" :width="150" />
    </el-table>
    <ListPagination
      :total="list.length"
      :page-num="pageNum"
      :page-size="pageSize"
      @update:page-num="handlePageNumChange"
      @update:page-size="handlePageSizeChange"
    />
    <el-empty v-if="isEmpty" :description="t('iot.noDevices')" />

    <el-dialog v-model="dialogVisible" :title="t('iot.newDevice')" width="480px">
      <el-form label-width="90px">
        <el-form-item :label="t('common.businessKey')" required
          ><el-input v-model="form.deviceKey"
        /></el-form-item>
        <el-form-item :label="t('common.name')" required
          ><el-input v-model="form.name"
        /></el-form-item>
        <el-form-item :label="t('common.type')"
          ><el-input v-model="form.deviceType"
        /></el-form-item>
        <el-form-item :label="t('iot.product')">
          <el-select v-model="form.productRefId" clearable :placeholder="t('iot.selectProduct')">
            <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 设备命令回查（含待核实人工收敛入口；P62 S4/S5） -->
    <el-drawer
      v-model="commandsVisible"
      :title="`设备命令：${commandDevice?.deviceName ?? ''}`"
      :size="commandsDrawerSize"
      data-test="device-commands-drawer"
    >
      <el-button link type="primary" data-test="commands-refresh" @click="loadCommands">
        刷新
      </el-button>
      <!-- G08b 窄屏真实障碍修复：命令表横向滚动容器（375 抽屉内状态/结果/关联实例可滚动入视口） -->
      <div class="commands-table-scroll" data-test="commands-table-scroll">
        <el-table
          v-loading="commandsLoading"
          :data="commandRows"
          size="small"
          data-test="commands-table"
        >
          <el-table-column prop="commandKey" label="命令" min-width="120" />
          <el-table-column prop="commandType" label="类型" width="90" />
          <el-table-column label="状态" width="140">
            <template #default="{ row }">
              <el-tag
                :type="
                  row.status === 'UNKNOWN'
                    ? 'warning'
                    : row.status === 'SUCCESS'
                      ? 'success'
                      : row.status === 'FAILED'
                        ? 'danger'
                        : 'info'
                "
              >
                {{ commandStatusText(row.status) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="result" label="结果" min-width="180" show-overflow-tooltip />
          <el-table-column
            prop="lastError"
            label="失败原因"
            min-width="150"
            show-overflow-tooltip
          />
          <el-table-column prop="approvalBizId" label="关联实例" min-width="130" />
          <el-table-column label="操作" width="110">
            <template #default="{ row }">
              <el-button
                v-if="row.status === 'UNKNOWN' && canVerify"
                link
                type="primary"
                :data-test="`verify-${row.id}`"
                @click="openVerify(row as IotDeviceCommandRecord)"
              >
                人工核实
              </el-button>
              <span v-else-if="row.status === 'UNKNOWN' && !canVerify" class="verify-hint">
                待独立授权核实
              </span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-drawer>

    <!-- 人工核实弹窗：仅 UNKNOWN；依据必填（不带可信依据不得宣告结果）；
         窄视口宽度自适应并在小屏收敛内边距（复核02 G6b：375 视口提交按钮可及） -->
    <el-dialog
      v-model="verifyVisible"
      title="设备命令人工核实"
      width="min(480px, calc(100vw - 24px))"
      data-test="verify-dialog"
      class="verify-dialog"
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="仅结果未知的命令可人工核实；核实结果与依据将记入审计（操作者/时间/前后状态）"
      />
      <el-form label-width="90px" style="margin-top: 12px" @submit.prevent>
        <el-form-item label="核实结果" required>
          <el-radio-group v-model="verifyOutcome" :data-test="'verify-outcome'">
            <el-radio value="SUCCESS">成功</el-radio>
            <el-radio value="FAILED">失败</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="核实依据" required>
          <el-input
            v-model="verifyBasis"
            type="textarea"
            :rows="3"
            placeholder="现场复核工单号 / 厂商后台凭证编号等可信依据（必填）"
            data-test="verify-basis"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="verifyVisible = false">取消</el-button>
        <el-button
          type="primary"
          data-test="verify-submit"
          :loading="verifySubmitting"
          @click="submitVerify"
        >
          提交核实
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
/* G08b：窄屏命令表横向滚动容器 */
.commands-table-scroll {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
/* 复核02 G6b：核实弹窗窄视口收敛——宽度 min(480px, 100vw-24px) 保证 375 视口提交按钮可及 */
:global(.el-dialog.verify-dialog) {
  max-width: calc(100vw - 24px);
}
</style>
