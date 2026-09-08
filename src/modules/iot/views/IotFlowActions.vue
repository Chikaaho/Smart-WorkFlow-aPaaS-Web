<script setup lang="ts">
/**
 * IotFlowActions — 流程设备动作配置（P21 A6/G2a）。
 *
 * 管理员可为「已发布且允许 IoT 接入」的流程模板配置设备动作：
 * 设备来源（设计时固定 / 发起表单字段 / 流程变量）、能力、参数字段、失败策略。
 * 保存经 POST /workflow/defs/{id}/iot-device-action，重开回读恢复。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { request } from '@/foundation/request'
import { listEligibleDevices, type IotDevice } from '../api'

interface ProcessDefRow {
  id: number
  processKey: string
  name: string
  status: string
  formKey: string | null
  iotAccessEnabled?: boolean
  iotDeviceActionJson?: string | null
}

const loading = ref(false)
const defs = ref<ProcessDefRow[]>([])
const devices = ref<IotDevice[]>([])

const dialogVisible = ref(false)
const editingDef = ref<ProcessDefRow | null>(null)
const form = reactive({
  enabled: true,
  deviceSource: 'FIXED',
  deviceId: undefined as number | undefined,
  deviceField: 'deviceKey',
  variableName: 'deviceKey',
  commandKey: 'iot_action',
  paramField: 'temperature',
  failurePolicy: 'BLOCK',
})

const isEmpty = computed(() => !loading.value && defs.value.length === 0)

interface ActionConfig {
  enabled: boolean
  deviceSource: string
  deviceId?: number
  deviceField?: string
  variableName?: string
  commandKey?: string
  paramField?: string
  failurePolicy?: string
}

function parseAction(row: ProcessDefRow): ActionConfig | null {
  if (!row.iotDeviceActionJson) return null
  try {
    return JSON.parse(row.iotDeviceActionJson) as ActionConfig
  } catch {
    return null
  }
}

async function load() {
  loading.value = true
  try {
    const page = await request<{ records: ProcessDefRow[] }>({
      method: 'GET',
      url: '/workflow/defs',
      params: { pageNum: '1', pageSize: '50' },
    })
    defs.value = page.records
    devices.value = await listEligibleDevices()
  } finally {
    loading.value = false
  }
}

function deviceName(deviceId?: number): string {
  if (!deviceId) return '—'
  const d = devices.value.find((x) => x.id === deviceId)
  return d ? `${d.name} (${d.deviceKey})` : String(deviceId)
}

function sourceLabel(config: ActionConfig | null): string {
  if (!config || !config.enabled) return '未启用'
  const map: Record<string, string> = {
    FIXED: '设计时固定',
    FORM_FIELD: '发起表单字段',
    VARIABLE: '流程变量',
  }
  return map[config.deviceSource] ?? config.deviceSource
}

function openEdit(row: ProcessDefRow) {
  editingDef.value = row
  const existing = parseAction(row as ProcessDefRow)
  Object.assign(form, {
    enabled: existing?.enabled ?? true,
    deviceSource: existing?.deviceSource ?? 'FIXED',
    deviceId: existing?.deviceId,
    deviceField: existing?.deviceField ?? 'deviceKey',
    variableName: existing?.variableName ?? 'deviceKey',
    commandKey: existing?.commandKey ?? 'iot_action',
    paramField: existing?.paramField ?? 'temperature',
    failurePolicy: existing?.failurePolicy ?? 'BLOCK',
  })
  dialogVisible.value = true
}

async function save() {
  if (!editingDef.value) return
  if (form.deviceSource === 'FIXED' && !form.deviceId) {
    ElMessage.warning('固定来源必须选择设备（仅显示合格设备）')
    return
  }
  const action: Record<string, unknown> = {
    enabled: form.enabled,
    deviceSource: form.deviceSource,
    commandKey: form.commandKey,
    failurePolicy: form.failurePolicy,
  }
  if (form.deviceSource === 'FIXED') action.deviceId = form.deviceId
  if (form.deviceSource === 'FORM_FIELD') action.deviceField = form.deviceField
  if (form.deviceSource === 'VARIABLE') action.variableName = form.variableName
  if (form.paramField) action.paramField = form.paramField
  const result = await request<ProcessDefRow>({
    method: 'POST',
    url: `/workflow/defs/${editingDef.value.id}/iot-device-action`,
    data: { action },
  })
  ElMessage.success('设备动作配置已保存')
  const target = defs.value.find((d) => d.id === result.id)
  if (target) target.iotDeviceActionJson = result.iotDeviceActionJson
  dialogVisible.value = false
}

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <div style="margin-bottom: 12px">
      <h3 style="margin: 0">流程设备动作</h3>
      <p style="color: var(--el-text-color-secondary); font-size: 12px; margin: 4px 0 0">
        为「已发布 + 允许 IoT 接入」的流程模板配置设备动作：设备来源（设计时固定 / 发起表单字段 /
        流程变量）、能力、参数字段与失败策略（阻断 / 记录后继续 / 人工处理）。设备下拉仅显示合格设备
        （已发布 + 可接入流程 + 连接启用）。
      </p>
    </div>

    <el-table v-loading="loading" :data="defs" stripe>
      <el-table-column prop="processKey" label="流程模板" min-width="170" show-overflow-tooltip />
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'PUBLISHED' ? 'success' : 'info'" size="small">{{
            row.status
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="IoT 接入" width="90">
        <template #default="{ row }">
          <el-tag :type="row.iotAccessEnabled ? 'success' : 'info'" size="small">
            {{ row.iotAccessEnabled ? '已开启' : '未开启' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="设备动作" min-width="220">
        <template #default="{ row }">
          <template
            v-if="parseAction(row as ProcessDefRow) && parseAction(row as ProcessDefRow)!.enabled"
          >
            <el-tag size="small" style="margin-right: 6px">{{
              sourceLabel(parseAction(row as ProcessDefRow))
            }}</el-tag>
            <span style="font-size: 12px">
              {{
                parseAction(row as ProcessDefRow)!.deviceSource === 'FIXED'
                  ? deviceName(parseAction(row as ProcessDefRow)!.deviceId)
                  : ''
              }}
              {{ parseAction(row as ProcessDefRow)!.commandKey }}
              / {{ parseAction(row as ProcessDefRow)!.failurePolicy }}
            </span>
          </template>
          <span v-else style="color: var(--el-text-color-secondary)">未配置</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="110" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            type="primary"
            :disabled="row.status !== 'PUBLISHED'"
            @click="openEdit(row as ProcessDefRow)"
          >
            配置
          </el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="isEmpty" description="暂无流程模板" />

    <el-dialog
      v-model="dialogVisible"
      :title="`设备动作 — ${editingDef?.name ?? ''}`"
      width="560px"
    >
      <el-form label-width="110px">
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>
        <el-form-item label="设备来源" required>
          <el-radio-group v-model="form.deviceSource">
            <el-radio value="FIXED">设计时固定</el-radio>
            <el-radio value="FORM_FIELD">发起表单字段</el-radio>
            <el-radio value="VARIABLE">流程变量</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="form.deviceSource === 'FIXED'" label="目标设备" required>
          <el-select v-model="form.deviceId" placeholder="仅显示合格设备">
            <el-option
              v-for="d in devices"
              :key="d.id"
              :label="`${d.name} (${d.deviceKey})`"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.deviceSource === 'FORM_FIELD'" label="表单字段" required>
          <el-input v-model="form.deviceField" placeholder="发起表单中携带设备标识的字段名" />
        </el-form-item>
        <el-form-item v-if="form.deviceSource === 'VARIABLE'" label="流程变量" required>
          <el-input v-model="form.variableName" placeholder="流程变量名" />
        </el-form-item>
        <el-form-item label="能力标识" required>
          <el-input v-model="form.commandKey" placeholder="如 reboot / set_property" />
        </el-form-item>
        <el-form-item label="参数字段">
          <el-input v-model="form.paramField" placeholder="从表单取参数值的字段名（可空）" />
        </el-form-item>
        <el-form-item label="失败策略" required>
          <el-select v-model="form.failurePolicy">
            <el-option label="阻断（命令失败回写流程触发失败）" value="BLOCK" />
            <el-option label="记录后继续" value="CONTINUE" />
            <el-option label="人工处理（命令保持 PENDING）" value="MANUAL" />
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
