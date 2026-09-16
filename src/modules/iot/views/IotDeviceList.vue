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
import {
  createDevice,
  publishDevice,
  changeDeviceStatus,
  changeDeviceProcessAccess,
  refreshDeviceStatus,
  listProducts,
  type IotProduct,
} from '../api'

interface DeviceRow {
  id: number
  deviceKey: string
  name: string
  deviceType: string | null
  productId: string | null
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
    products.value = await listProducts()
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.msg : t('common.loadFailed')
  } finally {
    loading.value = false
  }
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

onMounted(() => void load())
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

    <el-table v-loading="loading" :data="list" stripe>
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
      <el-table-column :label="t('common.actions')" width="200" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.manageStatus !== 'PUBLISHED'"
            size="small"
            type="success"
            @click="handlePublish(row as DeviceRow)"
            >{{ t('common.publish') }}</el-button
          >
          <el-button size="small" @click="handleRefresh(row as DeviceRow)">{{
            t('iot.refreshStatus')
          }}</el-button>
          <el-button
            v-if="row.manageStatus === 'PUBLISHED'"
            size="small"
            type="danger"
            @click="handleDisable(row as DeviceRow)"
            >{{ t('common.disable') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>
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
  </div>
</template>
