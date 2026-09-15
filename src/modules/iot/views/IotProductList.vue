<script setup lang="ts">
/**
 * IotProductList — 产品与物模型管理（P21 A3）。
 *
 * 产品 CRUD + 物模型（属性/事件/行为 JSON）草稿保存、结构校验（后端）、版本发布。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  listProducts,
  createProduct,
  listThingModels,
  saveThingModelDraft,
  publishThingModel,
  type IotProduct,
  type IotThingModel,
} from '../api'

const loading = ref(false)
const list = ref<IotProduct[]>([])

const dialogVisible = ref(false)
const form = reactive({ code: '', name: '', connType: 'MQTT', description: '' })

const modelVisible = ref(false)
const currentProduct = ref<IotProduct | null>(null)
const modelVersions = ref<IotThingModel[]>([])
const modelText = ref('')

const isEmpty = computed(() => !loading.value && list.value.length === 0)

async function load() {
  loading.value = true
  try {
    list.value = await listProducts()
  } finally {
    loading.value = false
  }
}

function openCreate() {
  Object.assign(form, { code: '', name: '', connType: 'MQTT', description: '' })
  dialogVisible.value = true
}

async function save() {
  await createProduct({ ...form })
  ElMessage.success('产品已创建（物模型 v1 草稿可在详情中维护）')
  dialogVisible.value = false
  void load()
}

async function openModels(row: IotProduct) {
  currentProduct.value = row
  modelVersions.value = await listThingModels(row.id)
  modelText.value = modelVersions.value[0]?.contentJson
    ? JSON.stringify(JSON.parse(modelVersions.value[0].contentJson), null, 2)
    : JSON.stringify(
        {
          properties: [{ id: 'temperature', name: '温度', dataType: 'double' }],
          events: [],
          actions: [],
        },
        null,
        2,
      )
  modelVisible.value = true
}

async function saveModel() {
  if (!currentProduct.value) return
  const model = JSON.parse(modelText.value)
  await saveThingModelDraft(currentProduct.value.id, model)
  ElMessage.success('物模型草稿已保存')
  modelVersions.value = await listThingModels(currentProduct.value.id)
}

async function publishModel() {
  if (!currentProduct.value) return
  await ElMessageBox.confirm('发布当前草稿物模型？设备将绑定该版本。', '发布物模型', {
    type: 'warning',
  })
  await publishThingModel(currentProduct.value.id)
  ElMessage.success('物模型已发布')
  modelVersions.value = await listThingModels(currentProduct.value.id)
  void load()
}

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px">
      <h3 style="margin: 0">产品与物模型</h3>
      <el-button type="primary" @click="openCreate">新增产品</el-button>
    </div>

    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="code" label="编码" min-width="120" />
      <el-table-column prop="name" label="名称" min-width="140" />
      <el-table-column prop="connType" label="连接类型" width="100" />
      <el-table-column label="物模型" width="110">
        <template #default="{ row }">
          <el-tag :type="row.modelStatus === 'PUBLISHED' ? 'success' : 'info'" size="small">{{
            row.modelStatus
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="说明" min-width="180" show-overflow-tooltip />
      <el-table-column label="操作" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openModels(row as IotProduct)"
            >物模型</el-button
          >
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="isEmpty" description="暂无产品" />

    <el-dialog v-model="dialogVisible" title="新增产品" width="480px">
      <el-form label-width="90px">
        <el-form-item label="编码" required><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="名称" required><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="连接类型">
          <el-select v-model="form.connType">
            <el-option label="自建 MQTT" value="MQTT" />
            <el-option label="腾讯 IoT" value="TENCENT" />
          </el-select>
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="modelVisible"
      :title="`物模型 — ${currentProduct?.name ?? ''}`"
      width="760px"
    >
      <div style="margin-bottom: 8px">
        <el-tag
          v-for="v in modelVersions"
          :key="v.id"
          :type="v.status === 'PUBLISHED' ? 'success' : v.status === 'DRAFT' ? 'warning' : 'info'"
          size="small"
          style="margin-right: 6px"
        >
          v{{ v.modelVersion }} · {{ v.status }}
        </el-tag>
      </div>
      <el-input
        v-model="modelText"
        type="textarea"
        :rows="16"
        placeholder="properties/events/actions JSON"
      />
      <template #footer>
        <el-button @click="modelVisible = false">关闭</el-button>
        <el-button @click="saveModel">保存草稿</el-button>
        <el-button type="primary" @click="publishModel">发布</el-button>
      </template>
    </el-dialog>
  </div>
</template>
