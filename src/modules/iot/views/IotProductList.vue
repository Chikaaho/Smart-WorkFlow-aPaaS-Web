<script setup lang="ts">
import { enumLabel } from '@/foundation/i18n/enum-label'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * IotProductList — 产品与物模型管理（P21 A3）。
 *
 * 产品 CRUD + 物模型（属性/事件/行为 JSON）草稿保存、结构校验（后端）、版本发布。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
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
/** 本次加载的失败原因；非空时页面显示错误态而不是空态。 */
const loadError = ref('')
const list = ref<IotProduct[]>([])

const dialogVisible = ref(false)
const form = reactive({ code: '', name: '', connType: 'MQTT', description: '' })

const modelVisible = ref(false)
const currentProduct = ref<IotProduct | null>(null)
const modelVersions = ref<IotThingModel[]>([])
const modelText = ref('')

const isEmpty = computed(
  () => !loading.value && !loadError.value && !loadError.value && list.value.length === 0,
)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    list.value = await listProducts()
  } catch (err) {
    loadError.value = err instanceof ApiError ? err.msg : t('common.loadFailed')
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
  ElMessage.success(t('iot.productCreatedDraft'))
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
  ElMessage.success(t('iot.modelDraftSaved'))
  modelVersions.value = await listThingModels(currentProduct.value.id)
}

async function publishModel() {
  if (!currentProduct.value) return
  await ElMessageBox.confirm(t('iot.publishModelConfirm'), t('iot.publishModel'), {
    type: 'warning',
  })
  await publishThingModel(currentProduct.value.id)
  ElMessage.success(t('iot.modelPublished'))
  modelVersions.value = await listThingModels(currentProduct.value.id)
  void load()
}

onMounted(() => void load())
</script>

<template>
  <div style="padding: 16px">
    <div style="display: flex; justify-content: space-between; margin-bottom: 12px">
      <h3 style="margin: 0">{{ t('iot.productsAndModels') }}</h3>
      <el-button type="primary" @click="openCreate">{{ t('iot.newProduct') }}</el-button>
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
      <el-table-column prop="code" :label="t('common.code')" min-width="120" />
      <el-table-column prop="name" :label="t('common.name')" min-width="140" />
      <el-table-column prop="connType" :label="t('iot.connectionType')" width="100" />
      <el-table-column :label="t('iot.thingModel')" width="110">
        <template #default="{ row }">
          <el-tag :type="row.modelStatus === 'PUBLISHED' ? 'success' : 'info'" size="small">{{
            enumLabel('IOT_RELEASE_STATE', row.modelStatus)
          }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="description"
        :label="t('common.description')"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column :label="t('common.actions')" width="120" fixed="right">
        <template #default="{ row }">
          <el-button size="small" type="primary" @click="openModels(row as IotProduct)">{{
            t('iot.thingModel')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-if="isEmpty" :description="t('iot.noProducts')" />

    <el-dialog v-model="dialogVisible" :title="t('iot.newProduct')" width="480px">
      <el-form label-width="90px">
        <el-form-item :label="t('common.code')" required
          ><el-input v-model="form.code"
        /></el-form-item>
        <el-form-item :label="t('common.name')" required
          ><el-input v-model="form.name"
        /></el-form-item>
        <el-form-item :label="t('iot.connectionType')">
          <el-select v-model="form.connType">
            <el-option :label="t('iot.mqttSelfBuilt')" value="MQTT" />
            <el-option :label="t('iot.tencentIot')" value="TENCENT" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.description')"
          ><el-input v-model="form.description"
        /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="modelVisible"
      :title="t('iot.thingModelDialogTitle', { name: currentProduct?.name ?? '' })"
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
          v{{ v.modelVersion }} · {{ enumLabel('IOT_RELEASE_STATE', v.status) }}
        </el-tag>
      </div>
      <el-input
        v-model="modelText"
        type="textarea"
        :rows="16"
        placeholder="properties/events/actions JSON"
      />
      <template #footer>
        <el-button @click="modelVisible = false">{{ t('common.close') }}</el-button>
        <el-button @click="saveModel">{{ t('common.saveDraft') }}</el-button>
        <el-button type="primary" @click="publishModel">{{ t('common.publish') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>
