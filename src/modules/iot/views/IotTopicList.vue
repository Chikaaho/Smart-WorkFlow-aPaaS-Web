<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * IotTopicList — Topic 配置管理（P21 A3）。
 *
 * 订阅/发布 Topic 的 CRUD：方向、QoS、载荷类型（属性/事件/行为结果/原始）、启停。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { ListActionsColumn, ListPagination } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
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
/** 本次加载的失败原因；非空时页面显示错误态而不是空态。 */
const loadError = ref('')
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

const isEmpty = computed(
  () => !loading.value && !loadError.value && !loadError.value && list.value.length === 0,
)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    list.value = await listTopics()
    connections.value = await listConnections()
    products.value = await listProducts()
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
    ElMessage.success(t('common.saved'))
  } else {
    await createTopic(body)
    ElMessage.success(t('common.created'))
  }
  dialogVisible.value = false
  void load()
}

async function handleToggle(row: IotTopic) {
  await toggleTopic(row.id, row.enabled !== 1)
  ElMessage.success(t('common.statusUpdated'))
  void load()
}

async function handleDelete(row: IotTopic) {
  await ElMessageBox.confirm(
    t('iot.deleteTopicConfirm', { topic: row.topic }),
    t('common.delete'),
    { type: 'warning' },
  )
  await deleteTopic(row.id)
  ElMessage.success(t('common.deleted'))
  void load()
}

onMounted(() => void load())

/** 统一操作列（V012-BUG-002）：编辑直显，启停/删除按启停状态切换文案 */
function rowActions(r: unknown): ListAction[] {
  const row = r as IotTopic
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      onClick: () => openEdit(row),
    },
    {
      key: 'toggle',
      label: row.enabled === 1 ? t('common.disable') : t('common.enable'),
      onClick: () => void handleToggle(row),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      onClick: () => void handleDelete(row),
    },
  ]
}
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px">
      <h3 style="margin: 0">{{ t('iot.topicConfig') }}</h3>
      <el-button type="primary" @click="openCreate">{{ t('iot.newTopic') }}</el-button>
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
      <el-table-column
        prop="topic"
        :label="t('common.subject')"
        min-width="220"
        show-overflow-tooltip
      />
      <el-table-column prop="direction" :label="t('iot.direction')" width="80" />
      <el-table-column prop="qos" label="QoS" width="60" />
      <el-table-column prop="payloadType" :label="t('iot.payloadType')" width="120" />
      <el-table-column :label="t('common.toggle')" width="80">
        <template #default="{ row }">
          <el-tag :type="row.enabled === 1 ? 'success' : 'info'" size="small">{{
            row.enabled === 1 ? t('common.enable') : t('common.disable')
          }}</el-tag>
        </template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :width="150" />
    </el-table>
    <ListPagination
      :total="list.length"
      :page-num="pageNum"
      :page-size="pageSize"
      @update:page-num="handlePageNumChange"
      @update:page-size="handlePageSizeChange"
    />
    <el-empty v-if="isEmpty" :description="t('iot.noTopics')" />

    <el-dialog
      v-model="dialogVisible"
      :title="editingId ? t('iot.editTopic') : t('iot.newTopic')"
      width="560px"
    >
      <el-form label-width="90px">
        <el-form-item :label="t('iot.connect')" required>
          <el-select v-model="form.connId" :placeholder="t('iot.selectMqttConnection')">
            <el-option
              v-for="c in connections.filter((x) => x.connType === 'MQTT')"
              :key="c.id"
              :label="c.name"
              :value="c.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('iot.product')">
          <el-select
            v-model="form.productId"
            clearable
            :placeholder="t('iot.bindProductPlaceholder')"
          >
            <el-option v-for="p in products" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.subject')" required>
          <el-input v-model="form.topic" :placeholder="t('iot.topicPlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('iot.direction')">
          <el-select v-model="form.direction">
            <el-option :label="t('iot.directionUp')" value="UP" />
            <el-option :label="t('iot.directionDown')" value="DOWN" />
            <el-option :label="t('iot.directionBoth')" value="BOTH" />
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
        <el-form-item :label="t('iot.payloadType')">
          <el-select v-model="form.payloadType">
            <el-option :label="t('iot.payloadProperty')" value="PROPERTY" />
            <el-option :label="t('common.event')" value="EVENT" />
            <el-option :label="t('iot.payloadActionResult')" value="ACTION_RESULT" />
            <el-option :label="t('iot.payloadRaw')" value="RAW" />
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
