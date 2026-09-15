<script setup lang="ts">
/**
 * IotRuleList — 事件规则管理（P21 A5）。
 *
 * 属性变化/阈值/事件/上下线规则配置（条件、防抖、冷却、连续次数）、
 * 流程模板绑定与表单字段映射（JSON）、发布/停用、触发记录回查。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  listRules,
  createRule,
  publishRule,
  disableRule,
  listRuleTriggers,
  listEligibleDevices,
  type IotEventRule,
  type IotDevice,
  type IotProcessTriggerRecord,
} from '../api'

const loading = ref(false)
const list = ref<IotEventRule[]>([])
const devices = ref<IotDevice[]>([])

const dialogVisible = ref(false)
const form = reactive({
  code: '',
  name: '',
  deviceId: undefined as number | undefined,
  ruleType: 'THRESHOLD',
  conditionJson: '{"propertyId":"temperature","op":"GT","threshold":30}',
  debounceMs: 0,
  cooldownMs: 0,
  continuousCount: 1,
  processEnabled: 1,
  processTemplateKey: '',
  formMappingJson: '[{"field":"deviceKey","source":"DEVICE_KEY","required":true}]',
})

const triggerVisible = ref(false)
const triggers = ref<IotProcessTriggerRecord[]>([])
const triggerLoading = ref(false)
const triggerDetailVisible = ref(false)
const selectedTrigger = ref<IotProcessTriggerRecord | null>(null)
const triggerDetailJson = computed(() =>
  selectedTrigger.value ? JSON.stringify(selectedTrigger.value, null, 2) : '',
)

const isEmpty = computed(() => !loading.value && list.value.length === 0)

async function load() {
  loading.value = true
  try {
    list.value = await listRules()
    devices.value = await listEligibleDevices()
  } finally {
    loading.value = false
  }
}

function deviceName(deviceId: number): string {
  const d = devices.value.find((x) => x.id === deviceId)
  return d ? d.name : String(deviceId)
}

function openCreate() {
  Object.assign(form, {
    code: '',
    name: '',
    deviceId: undefined,
    ruleType: 'THRESHOLD',
    conditionJson: '{"propertyId":"temperature","op":"GT","threshold":30}',
    debounceMs: 0,
    cooldownMs: 0,
    continuousCount: 1,
    processEnabled: 1,
    processTemplateKey: '',
    formMappingJson: '[{"field":"deviceKey","source":"DEVICE_KEY","required":true}]',
  })
  dialogVisible.value = true
}

async function save() {
  await createRule({ ...form })
  ElMessage.success('规则已创建（草稿）')
  dialogVisible.value = false
  void load()
}

async function handlePublish(row: IotEventRule) {
  await publishRule(row.id)
  ElMessage.success('已发布')
  void load()
}

async function handleDisable(row: IotEventRule) {
  await disableRule(row.id)
  ElMessage.success('已停用')
  void load()
}

async function openTriggers(row: IotEventRule) {
  triggerLoading.value = true
  triggerVisible.value = true
  try {
    triggers.value = await listRuleTriggers(row.id)
  } finally {
    triggerLoading.value = false
  }
}

function openTriggerDetail(row: IotProcessTriggerRecord) {
  selectedTrigger.value = row
  triggerDetailVisible.value = true
}

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px">
      <h3 style="margin: 0">事件规则</h3>
      <div>
        <span style="color: var(--el-text-color-secondary); font-size: 12px; margin-right: 8px">
          流程联动仅可选择「已发布 + 允许 IoT 接入」的设备与流程模板
        </span>
        <el-button type="primary" @click="openCreate">新增规则</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="code" label="编码" min-width="110" />
      <el-table-column prop="name" label="名称" min-width="130" />
      <el-table-column label="设备" min-width="120">
        <template #default="{ row }">{{ deviceName(row.deviceId) }}</template>
      </el-table-column>
      <el-table-column prop="ruleType" label="类型" width="150" />
      <el-table-column prop="conditionJson" label="条件" min-width="200" show-overflow-tooltip />
      <el-table-column label="流程联动" width="90">
        <template #default="{ row }">
          <el-tag :type="row.processEnabled === 1 ? 'success' : 'info'" size="small">
            {{ row.processEnabled === 1 ? row.processTemplateKey : '—' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag
            :type="
              row.status === 'PUBLISHED' ? 'success' : row.status === 'DISABLED' ? 'danger' : 'info'
            "
            size="small"
            >{{ row.status }}</el-tag
          >
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status !== 'PUBLISHED'"
            size="small"
            type="success"
            @click="handlePublish(row as IotEventRule)"
            >发布</el-button
          >
          <el-button
            v-if="row.status === 'PUBLISHED'"
            size="small"
            type="danger"
            @click="handleDisable(row as IotEventRule)"
            >停用</el-button
          >
          <el-button size="small" @click="openTriggers(row as IotEventRule)">触发记录</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="isEmpty" description="暂无规则" />

    <el-dialog v-model="dialogVisible" title="新增规则" width="640px">
      <el-form label-width="100px">
        <el-form-item label="编码" required><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="设备" required>
          <el-select v-model="form.deviceId" placeholder="仅显示可接入流程的已发布设备">
            <el-option
              v-for="d in devices"
              :key="d.id"
              :label="`${d.name} (${d.deviceKey})`"
              :value="d.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="规则类型">
          <el-select v-model="form.ruleType">
            <el-option label="阈值 THRESHOLD" value="THRESHOLD" />
            <el-option label="属性变化 PROPERTY_CHANGED" value="PROPERTY_CHANGED" />
            <el-option label="事件发生 EVENT_OCCUR" value="EVENT_OCCUR" />
            <el-option label="上线 ONLINE" value="ONLINE" />
            <el-option label="离线 OFFLINE" value="OFFLINE" />
          </el-select>
        </el-form-item>
        <el-form-item label="条件 JSON" required>
          <el-input v-model="form.conditionJson" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item label="防抖(ms)"
          ><el-input-number v-model="form.debounceMs" :min="0" :step="500"
        /></el-form-item>
        <el-form-item label="冷却(ms)"
          ><el-input-number v-model="form.cooldownMs" :min="0" :step="1000"
        /></el-form-item>
        <el-form-item label="连续次数"
          ><el-input-number v-model="form.continuousCount" :min="1" :max="100"
        /></el-form-item>
        <el-form-item label="流程联动">
          <el-switch v-model="form.processEnabled" :active-value="1" :inactive-value="0" />
        </el-form-item>
        <el-form-item v-if="form.processEnabled === 1" label="流程模板" required>
          <el-input
            v-model="form.processTemplateKey"
            placeholder="已发布且允许 IoT 接入的流程模板 key"
          />
        </el-form-item>
        <el-form-item v-if="form.processEnabled === 1" label="表单映射">
          <el-input v-model="form.formMappingJson" type="textarea" :rows="4" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="triggerVisible" title="规则触发与流程发起记录" width="760px">
      <el-table
        v-loading="triggerLoading"
        :data="triggers"
        stripe
        size="small"
        @row-click="openTriggerDetail"
      >
        <el-table-column
          prop="idempotentKey"
          label="幂等键"
          min-width="200"
          show-overflow-tooltip
        />
        <el-table-column prop="status" label="状态" width="90">
          <template #default="{ row }">
            <el-tag
              :type="
                row.status === 'SUCCESS'
                  ? 'success'
                  : row.status === 'FAILED'
                    ? 'danger'
                    : 'warning'
              "
              size="small"
            >
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="processInstanceId" label="流程实例" min-width="140" />
        <el-table-column prop="error" label="失败原因" min-width="160" show-overflow-tooltip />
        <el-table-column prop="triggerTime" label="触发时间" min-width="150" />
      </el-table>
    </el-dialog>
    <el-dialog v-model="triggerDetailVisible" title="触发记录详情" width="680px">
      <pre
        style="
          max-height: 55vh;
          overflow: auto;
          margin: 0;
          padding: 12px;
          background: var(--el-fill-color-light);
          white-space: pre-wrap;
          word-break: break-word;
        "
        >{{ triggerDetailJson }}</pre
      >
    </el-dialog>
  </div>
</template>
