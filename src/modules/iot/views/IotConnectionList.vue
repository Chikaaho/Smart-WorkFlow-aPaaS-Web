<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * IotConnectionList — IoT 连接配置管理（P21 A1）。
 *
 * 新增/编辑（凭证只写，展示脱敏占位）、真实连接测试（区分 DNS/网络/认证/TLS/协议失败）、
 * 凭证轮换、启停、常驻连接建立。凭证任何情况下不回显明文/密文。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { LoadErrorState } from '@/components/page-layout'
import { enumLabel } from '@/foundation/i18n/enum-label'
import {
  listConnections,
  createConnection,
  updateConnection,
  testConnection,
  connectConnection,
  rotateConnectionPassword,
  toggleConnection,
  deleteConnection,
  type IotConnection,
} from '../api'

const loading = ref(false)
/** 本次加载的失败对象；非空时页面显示分类错误态而不是空态。 */
const loadError = ref<ApiError | null>(null)
const list = ref<IotConnection[]>([])

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  code: '',
  name: '',
  connType: 'MQTT',
  host: '',
  port: 1883,
  useTls: 0,
  username: '',
  password: '',
  keepalive: 60,
})

const isEmpty = computed(
  () => !loading.value && !loadError.value && !loadError.value && list.value.length === 0,
)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    list.value = await listConnections()
  } catch (err) {
    // 保留完整 ApiError：错误态需要分类结论、恢复动作与事件引用，不只是文案串
    loadError.value = err instanceof ApiError ? err : null
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(form, {
    code: '',
    name: '',
    connType: 'MQTT',
    host: '',
    port: 1883,
    useTls: 0,
    username: '',
    password: '',
    keepalive: 60,
  })
  dialogVisible.value = true
}

function openEdit(row: IotConnection) {
  editingId.value = row.id
  Object.assign(form, {
    code: row.code,
    name: row.name,
    connType: row.connType,
    host: row.host ?? '',
    port: row.port ?? 1883,
    useTls: row.useTls,
    username: row.username ?? '',
    password: '',
    keepalive: row.keepalive,
  })
  dialogVisible.value = true
}

async function save() {
  if (!form.code || !form.name) {
    ElMessage.warning(t('iot.identifierAndNameRequired'))
    return
  }
  const body: Record<string, unknown> = { ...form }
  if (!form.password) delete body.password
  if (editingId.value) {
    await updateConnection(editingId.value, body)
    ElMessage.success(t('common.saved'))
  } else {
    await createConnection(body)
    ElMessage.success(t('common.created'))
  }
  dialogVisible.value = false
  void load()
}

async function handleTest(row: IotConnection) {
  const result = await testConnection(row.id)
  if (result.category === 'SUCCESS') {
    ElMessage.success(t('iot.connectionTestSuccess', { detail: result.detail }))
  } else {
    ElMessage.error(
      t('iot.connectionTestFailed', { category: result.category, detail: result.detail }),
    )
  }
  void load()
}

async function handleConnect(row: IotConnection) {
  const result = await connectConnection(row.id)
  ElMessage.success(t('iot.subscriptionsRestored', { subscriptions: result.subscriptions }))
}

async function handleRotate(row: IotConnection) {
  const { value } = await ElMessageBox.prompt(
    t('iot.newPasswordPrompt'),
    t('iot.credentialRotation'),
    {
      inputType: 'password',
      get confirmButtonText() {
        return t('iot.rotate')
      },
    },
  )
  await rotateConnectionPassword(row.id, value)
  ElMessage.success(t('iot.credentialRotated'))
}

async function handleToggle(row: IotConnection) {
  await toggleConnection(row.id, row.enabled !== 1)
  ElMessage.success(row.enabled === 1 ? t('common.statusDisabled') : t('common.statusEnabled'))
  void load()
}

async function handleDelete(row: IotConnection) {
  await ElMessageBox.confirm(
    t('iot.deleteConnectionConfirm', { name: row.name }),
    t('common.delete'),
    { type: 'warning' },
  )
  await deleteConnection(row.id)
  ElMessage.success(t('common.deleted'))
  void load()
}

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px">
      <h3 style="margin: 0">{{ t('iot.connectionConfig') }}</h3>
      <el-button type="primary" @click="openCreate">{{ t('iot.newConnection') }}</el-button>
    </div>
    <LoadErrorState v-if="loadError" :error="loadError" @retry="load" />

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="code" :label="t('common.identifier')" min-width="110" />
      <el-table-column prop="name" :label="t('common.name')" min-width="130" />
      <el-table-column prop="connType" :label="t('common.type')" width="90" />
      <el-table-column :label="t('common.address')" min-width="170">
        <template #default="{ row }">
          {{
            row.connType === 'MQTT'
              ? `${row.host}:${row.port}${row.useTls === 1 ? ' (TLS)' : ''}`
              : (row.endpoint ?? '—')
          }}
        </template>
      </el-table-column>
      <el-table-column :label="t('iot.credential')" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.hasPassword" type="info" size="small">{{
            row.passwordMasked ?? '******'
          }}</el-tag>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('iot.health')" width="100">
        <template #default="{ row }">
          <el-tag
            :type="
              row.healthStatus === 'HEALTHY'
                ? 'success'
                : row.healthStatus === 'UNHEALTHY'
                  ? 'danger'
                  : 'info'
            "
            size="small"
          >
            {{ enumLabel('IOT_HEALTH', row.healthStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="lastCheckResult"
        :label="t('iot.lastChecked')"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column :label="t('common.toggle')" width="70">
        <template #default="{ row }">
          <el-tag :type="row.enabled === 1 ? 'success' : 'info'" size="small">{{
            row.enabled === 1 ? t('common.enable') : t('common.disable')
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handleTest(row as IotConnection)">{{
            t('common.test')
          }}</el-button>
          <el-button
            v-if="row.connType === 'MQTT' && row.enabled === 1"
            size="small"
            type="success"
            @click="handleConnect(row as IotConnection)"
            >{{ t('iot.connect') }}</el-button
          >
          <el-button size="small" @click="handleRotate(row as IotConnection)">{{
            t('iot.rotate')
          }}</el-button>
          <el-button size="small" @click="openEdit(row as IotConnection)">{{
            t('common.edit')
          }}</el-button>
          <el-button size="small" @click="handleToggle(row as IotConnection)">{{
            row.enabled === 1 ? t('common.disable') : t('common.enable')
          }}</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row as IotConnection)">{{
            t('common.delete')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="isEmpty" :description="t('iot.noConnections')" />

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? t('iot.editConnection') : t('iot.newConnection')"
      width="520px"
    >
      <el-form label-width="90px">
        <el-form-item :label="t('common.identifier')" required>
          <el-input
            v-model="form.code"
            :disabled="!!editingId"
            :placeholder="t('iot.uniqueIdentifier')"
          />
        </el-form-item>
        <el-form-item :label="t('common.name')" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item :label="t('common.type')">
          <el-select v-model="form.connType" :disabled="!!editingId">
            <el-option :label="t('iot.mqttSelfBuilt')" value="MQTT" />
            <el-option :label="t('iot.tencentIot')" value="TENCENT" />
          </el-select>
        </el-form-item>
        <template v-if="form.connType === 'MQTT'">
          <el-form-item :label="t('iot.host')" required>
            <el-input v-model="form.host" />
          </el-form-item>
          <el-form-item :label="t('iot.port')" required>
            <el-input-number v-model="form.port" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item label="TLS">
            <el-switch v-model="form.useTls" :active-value="1" :inactive-value="0" />
          </el-form-item>
        </template>
        <el-form-item :label="t('common.username')">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item :label="t('iot.password')">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="editingId ? t('iot.passwordKeepPlaceholder') : t('iot.password')"
          />
        </el-form-item>
        <el-form-item label="keepalive">
          <el-input-number v-model="form.keepalive" :min="10" :max="600" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
