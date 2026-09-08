<script setup lang="ts">
/**
 * IotConnectionList — IoT 连接配置管理（P21 A1）。
 *
 * 新增/编辑（凭证只写，展示脱敏占位）、真实连接测试（区分 DNS/网络/认证/TLS/协议失败）、
 * 凭证轮换、启停、常驻连接建立。凭证任何情况下不回显明文/密文。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
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

const isEmpty = computed(() => !loading.value && list.value.length === 0)

async function load() {
  loading.value = true
  try {
    list.value = await listConnections()
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
    ElMessage.warning('标识与名称必填')
    return
  }
  const body: Record<string, unknown> = { ...form }
  if (!form.password) delete body.password
  if (editingId.value) {
    await updateConnection(editingId.value, body)
    ElMessage.success('已保存')
  } else {
    await createConnection(body)
    ElMessage.success('已创建')
  }
  dialogVisible.value = false
  void load()
}

async function handleTest(row: IotConnection) {
  const result = await testConnection(row.id)
  if (result.category === 'SUCCESS') {
    ElMessage.success(`连接成功：${result.detail}`)
  } else {
    ElMessage.error(`连接失败（${result.category}）：${result.detail}`)
  }
  void load()
}

async function handleConnect(row: IotConnection) {
  const result = await connectConnection(row.id)
  ElMessage.success(`常驻连接已建立，恢复订阅 ${result.subscriptions} 条`)
}

async function handleRotate(row: IotConnection) {
  const { value } = await ElMessageBox.prompt('输入新口令（只写，不可回读）', '凭证轮换', {
    inputType: 'password',
    confirmButtonText: '轮换',
  })
  await rotateConnectionPassword(row.id, value)
  ElMessage.success('凭证已轮换')
}

async function handleToggle(row: IotConnection) {
  await toggleConnection(row.id, row.enabled !== 1)
  ElMessage.success(row.enabled === 1 ? '已停用' : '已启用')
  void load()
}

async function handleDelete(row: IotConnection) {
  await ElMessageBox.confirm(`删除连接「${row.name}」？`, '删除', { type: 'warning' })
  await deleteConnection(row.id)
  ElMessage.success('已删除')
  void load()
}

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px">
      <h3 style="margin: 0">连接配置</h3>
      <el-button type="primary" @click="openCreate">新增连接</el-button>
    </div>

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="code" label="标识" min-width="110" />
      <el-table-column prop="name" label="名称" min-width="130" />
      <el-table-column prop="connType" label="类型" width="90" />
      <el-table-column label="地址" min-width="170">
        <template #default="{ row }">
          {{
            row.connType === 'MQTT'
              ? `${row.host}:${row.port}${row.useTls === 1 ? ' (TLS)' : ''}`
              : (row.endpoint ?? '—')
          }}
        </template>
      </el-table-column>
      <el-table-column label="凭证" width="90">
        <template #default="{ row }">
          <el-tag v-if="row.hasPassword" type="info" size="small">{{
            row.passwordMasked ?? '******'
          }}</el-tag>
          <span v-else>—</span>
        </template>
      </el-table-column>
      <el-table-column label="健康" width="100">
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
            {{ row.healthStatus }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="lastCheckResult"
        label="最后检查"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column label="启停" width="70">
        <template #default="{ row }">
          <el-tag :type="row.enabled === 1 ? 'success' : 'info'" size="small">{{
            row.enabled === 1 ? '启用' : '停用'
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="handleTest(row as IotConnection)">测试</el-button>
          <el-button
            v-if="row.connType === 'MQTT' && row.enabled === 1"
            size="small"
            type="success"
            @click="handleConnect(row as IotConnection)"
            >连接</el-button
          >
          <el-button size="small" @click="handleRotate(row as IotConnection)">轮换</el-button>
          <el-button size="small" @click="openEdit(row as IotConnection)">编辑</el-button>
          <el-button size="small" @click="handleToggle(row as IotConnection)">{{
            row.enabled === 1 ? '停用' : '启用'
          }}</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row as IotConnection)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="isEmpty" description="暂无连接配置" />

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑连接' : '新增连接'" width="520px">
      <el-form label-width="90px">
        <el-form-item label="标识" required>
          <el-input v-model="form.code" :disabled="!!editingId" placeholder="唯一标识" />
        </el-form-item>
        <el-form-item label="名称" required>
          <el-input v-model="form.name" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.connType" :disabled="!!editingId">
            <el-option label="自建 MQTT" value="MQTT" />
            <el-option label="腾讯 IoT" value="TENCENT" />
          </el-select>
        </el-form-item>
        <template v-if="form.connType === 'MQTT'">
          <el-form-item label="主机" required>
            <el-input v-model="form.host" />
          </el-form-item>
          <el-form-item label="端口" required>
            <el-input-number v-model="form.port" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item label="TLS">
            <el-switch v-model="form.useTls" :active-value="1" :inactive-value="0" />
          </el-form-item>
        </template>
        <el-form-item label="用户名">
          <el-input v-model="form.username" />
        </el-form-item>
        <el-form-item label="口令">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="editingId ? '留空保持不变' : '口令'"
          />
        </el-form-item>
        <el-form-item label="keepalive">
          <el-input-number v-model="form.keepalive" :min="10" :max="600" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
