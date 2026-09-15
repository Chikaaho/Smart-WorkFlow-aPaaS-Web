<script setup lang="ts">
/**
 * IotDeviceList — 设备管理（P21 A1）。
 *
 * 新增/发布/禁用/流程接入开关/连接状态刷新；管理状态与连接状态分离展示。
 * 设备列表复用既有 /iot/devices 接口；管理操作走 /iot/device-manage。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/foundation/request'
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

const isEmpty = computed(() => !loading.value && list.value.length === 0)

async function load() {
  loading.value = true
  try {
    list.value = await request<DeviceRow[]>({ method: 'GET', url: '/iot/devices' })
    products.value = await listProducts()
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
  ElMessage.success('设备已创建（草稿）')
  dialogVisible.value = false
  void load()
}

async function handlePublish(row: DeviceRow) {
  try {
    await publishDevice(row.id)
    ElMessage.success('已发布')
  } catch {
    ElMessage.error('发布失败：需绑定已发布物模型的产品')
  }
  void load()
}

async function handleDisable(row: DeviceRow) {
  await ElMessageBox.confirm(`禁用设备「${row.name}」？`, '禁用', { type: 'warning' })
  await changeDeviceStatus(row.id, 'DISABLED')
  ElMessage.success('已禁用')
  void load()
}

async function handleProcessAccess(row: DeviceRow) {
  try {
    await changeDeviceProcessAccess(row.id, row.processAccessEnabled !== 1)
    ElMessage.success('流程接入开关已更新')
  } catch {
    ElMessage.error('未发布设备不能开启流程接入')
  }
  void load()
}

async function handleRefresh(row: DeviceRow) {
  const status = await refreshDeviceStatus(row.id)
  ElMessage.info(`连接状态：${status}`)
  void load()
}

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px">
      <h3 style="margin: 0">设备管理</h3>
      <el-button type="primary" @click="openCreate">新增设备</el-button>
    </div>

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="deviceKey" label="业务标识" min-width="120" />
      <el-table-column prop="name" label="名称" min-width="130" />
      <el-table-column prop="deviceType" label="类型" width="90" />
      <el-table-column prop="productId" label="腾讯标识" min-width="120" />
      <el-table-column label="管理状态" width="100">
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
            {{ row.manageStatus }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="连接状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ONLINE' ? 'success' : 'info'" size="small">{{
            row.status
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="流程接入" width="90">
        <template #default="{ row }">
          <el-switch
            :model-value="row.processAccessEnabled === 1"
            @change="handleProcessAccess(row as DeviceRow)"
          />
        </template>
      </el-table-column>
      <el-table-column prop="lastReportTime" label="最后上报" min-width="150" />
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.manageStatus !== 'PUBLISHED'"
            size="small"
            type="success"
            @click="handlePublish(row as DeviceRow)"
            >发布</el-button
          >
          <el-button size="small" @click="handleRefresh(row as DeviceRow)">刷新状态</el-button>
          <el-button
            v-if="row.manageStatus === 'PUBLISHED'"
            size="small"
            type="danger"
            @click="handleDisable(row as DeviceRow)"
            >禁用</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="isEmpty" description="暂无设备" />

    <el-dialog v-model="dialogVisible" title="新增设备" width="480px">
      <el-form label-width="90px">
        <el-form-item label="业务标识" required><el-input v-model="form.deviceKey" /></el-form-item>
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="类型"><el-input v-model="form.deviceType" /></el-form-item>
        <el-form-item label="产品">
          <el-select v-model="form.productRefId" clearable placeholder="选择产品">
            <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
