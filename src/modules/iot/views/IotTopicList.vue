<script setup lang="ts">
/**
 * IotTopicList — Topic 配置管理（P21 A3）。
 *
 * 订阅/发布 Topic 的 CRUD：方向、QoS、载荷类型（属性/事件/行为结果/原始）、启停。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listTopics,
  createTopic,
  updateTopic,
  toggleTopic,
  deleteTopic,
  listConnections,
  listProducts,
  type IotTopic,
  type IotConnection,
  type IotProduct,
} from '../api'

const loading = ref(false)
const list = ref<IotTopic[]>([])
const connections = ref<IotConnection[]>([])
const products = ref<IotProduct[]>([])

const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const form = reactive({
  connId: undefined as number | undefined,
  productId: undefined as number | undefined,
  topic: '',
  direction: 'UP',
  qos: 1,
  retain: 0,
  payloadType: 'PROPERTY',
  mappingJson: '',
})

const isEmpty = computed(() => !loading.value && list.value.length === 0)

async function load() {
  loading.value = true
  try {
    list.value = await listTopics()
    connections.value = await listConnections()
    products.value = await listProducts()
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingId.value = null
  Object.assign(form, {
    connId: undefined,
    productId: undefined,
    topic: '',
    direction: 'UP',
    qos: 1,
    retain: 0,
    payloadType: 'PROPERTY',
    mappingJson: '',
  })
  dialogVisible.value = true
}

function openEdit(row: IotTopic) {
  editingId.value = row.id
  Object.assign(form, {
    connId: row.connId,
    productId: row.productId ?? undefined,
    topic: row.topic,
    direction: row.direction,
    qos: row.qos,
    retain: row.retain,
    payloadType: row.payloadType,
    mappingJson: row.mappingJson ?? '',
  })
  dialogVisible.value = true
}

async function save() {
  const body: Record<string, unknown> = { ...form }
  if (editingId.value) {
    await updateTopic(editingId.value, body)
    ElMessage.success('已保存')
  } else {
    await createTopic(body)
    ElMessage.success('已创建')
  }
  dialogVisible.value = false
  void load()
}

async function handleToggle(row: IotTopic) {
  await toggleTopic(row.id, row.enabled !== 1)
  ElMessage.success('状态已更新')
  void load()
}

async function handleDelete(row: IotTopic) {
  await ElMessageBox.confirm(`删除 Topic「${row.topic}」？`, '删除', { type: 'warning' })
  await deleteTopic(row.id)
  ElMessage.success('已删除')
  void load()
}

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px">
      <h3 style="margin: 0">Topic 配置</h3>
      <el-button type="primary" @click="openCreate">新增 Topic</el-button>
    </div>

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="topic" label="主题" min-width="220" show-overflow-tooltip />
      <el-table-column prop="direction" label="方向" width="80" />
      <el-table-column prop="qos" label="QoS" width="60" />
      <el-table-column prop="payloadType" label="载荷类型" width="120" />
      <el-table-column label="启停" width="80">
        <template #default="{ row }">
          <el-tag :type="row.enabled === 1 ? 'success' : 'info'" size="small">{{
            row.enabled === 1 ? '启用' : '停用'
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row as IotTopic)">编辑</el-button>
          <el-button size="small" @click="handleToggle(row as IotTopic)">{{
            row.enabled === 1 ? '停用' : '启用'
          }}</el-button>
          <el-button size="small" type="danger" @click="handleDelete(row as IotTopic)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="isEmpty" description="暂无 Topic 配置" />

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? '编辑 Topic' : '新增 Topic'"
      width="560px"
    >
      <el-form label-width="90px">
        <el-form-item label="连接" required>
          <el-select v-model="form.connId" placeholder="选择 MQTT 连接">
            <el-option
              v-for="c in connections.filter((x) => x.connType === 'MQTT')"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="产品">
          <el-select v-model="form.productId" clearable placeholder="绑定产品（用于设备定位）">
            <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="主题" required>
          <el-input v-model="form.topic" placeholder="支持 {deviceKey} 模板变量与 +/# 通配" />
        </el-form-item>
        <el-form-item label="方向">
          <el-select v-model="form.direction">
            <el-option label="上行 UP" value="UP" />
            <el-option label="下行 DOWN" value="DOWN" />
            <el-option label="双向 BOTH" value="BOTH" />
          </el-select>
        </el-form-item>
        <el-form-item label="QoS">
          <el-select v-model="form.qos">
            <el-option label="0" :value="0" /><el-option label="1" :value="1" /><el-option
              label="2"
              :value="2"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="载荷类型">
          <el-select v-model="form.payloadType">
            <el-option label="属性上报" value="PROPERTY" />
            <el-option label="事件" value="EVENT" />
            <el-option label="行为结果" value="ACTION_RESULT" />
            <el-option label="原始" value="RAW" />
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
