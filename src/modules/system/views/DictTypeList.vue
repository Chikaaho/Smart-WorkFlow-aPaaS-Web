<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * DictTypeList — 字典类型列表页（页型B）。
 *
 * 使用 StandardListTemplate 槽位模板，数据外部进。
 * 筛选：name / code / status；操作：新建 / 编辑 / 删除 / 管理字典项。
 * 新建/编辑走 el-dialog 内嵌 StandardFormTemplate + 手写控件（高代码轨）。
 */
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import {
  pageDictTypes,
  getDictType,
  createDictType,
  updateDictType,
  deleteDictType,
} from '@/modules/system/api/dict'
import type { SysDictType, DictTypeFilter } from '@/modules/system/types/dict'
import type { PageQuery } from '@/contracts/common'
import {
  StandardListTemplate,
  StandardFormTemplate,
  FormSection,
  FormGrid,
} from '@/components/page-layout'

const router = useRouter()

// ─── 列表状态 ───

const list = ref<SysDictType[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const filter = reactive<DictTypeFilter>({
  name: '',
  code: '',
  status: undefined,
})

const currentFilter = reactive<DictTypeFilter>({ ...filter })

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageDictTypes(pageQuery, currentFilter)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('system.dictTypeListLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  Object.assign(currentFilter, {
    name: filter.name || undefined,
    code: filter.code || undefined,
    status: filter.status,
  })
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.name = ''
  filter.code = ''
  filter.status = undefined
  currentFilter.name = undefined
  currentFilter.code = undefined
  currentFilter.status = undefined
  pageNum.value = 1
  void loadList()
}

function handlePageNumChange(p: number) {
  pageNum.value = p
  void loadList()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
  void loadList()
}

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

// ─── 弹窗状态 ───

const dialogVisible = ref(false)
const dialogTitle = computed(() =>
  editingId.value ? t('system.editDictType') : t('system.newDictType'),
)
const editingId = ref<string | null>(null)
const submitting = ref(false)
const formError = ref('')

const form = reactive<SysDictType>({
  name: '',
  code: '',
  status: 0,
  description: '',
})

function resetForm() {
  form.name = ''
  form.code = ''
  form.status = 0
  form.description = ''
  editingId.value = null
  formError.value = ''
}

function openCreate() {
  resetForm()
  dialogVisible.value = true
}

async function openEdit(row: SysDictType) {
  resetForm()
  editingId.value = row.id ?? null
  try {
    const detail = await getDictType(row.id!)
    form.name = detail.name
    form.code = detail.code
    form.status = detail.status
    form.description = detail.description ?? ''
  } catch {
    formError.value = t('system.dictTypeDetailLoadFailed')
    return
  }
  dialogVisible.value = true
}

function closeDialog() {
  dialogVisible.value = false
}

async function handleSubmit() {
  if (!form.name.trim()) {
    formError.value = t('system.dictNameRequired')
    return
  }
  if (!form.code.trim()) {
    formError.value = t('system.dictCodeRequired')
    return
  }

  submitting.value = true
  formError.value = ''
  try {
    if (editingId.value) {
      await updateDictType({ ...form, id: editingId.value })
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await createDictType({ ...form })
      ElMessage.success(t('common.createSuccess'))
    }
    closeDialog()
    void loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      formError.value = err.msg
    } else {
      formError.value = t('common.saveFailed')
    }
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: SysDictType) {
  try {
    await ElMessageBox.confirm(
      t('system.deleteDictTypeConfirm', { name: row.name }),
      t('common.deleteConfirmTitle'),
      {
        get confirmButtonText() {
          return t('common.confirm')
        },
        get cancelButtonText() {
          return t('common.cancel')
        },
        type: 'warning',
      },
    )
  } catch {
    return // 用户取消
  }
  try {
    await deleteDictType(row.id!)
    ElMessage.success(t('common.deleteSuccess'))
    void loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error(t('common.deleteFailed'))
    }
  }
}

function handleManageData(row: SysDictType) {
  void router.push({
    path: '/dict-data',
    query: { dictCode: row.code, dictName: row.name },
  })
}

// el-table row slot 的 DefaultRow 类型不与 SysDictType 兼容，通过包装函数桥接。
function editRow(r: unknown) {
  openEdit(r as SysDictType)
}
function manageRow(r: unknown) {
  handleManageData(r as SysDictType)
}
function deleteRow(r: unknown) {
  handleDelete(r as SysDictType)
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('system.dictManagement')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：新建按钮 -->
    <template #toolbar-actions>
      <el-button type="primary" @click="openCreate">{{ t('system.newDictType') }}</el-button>
    </template>

    <!-- 筛选区 -->
    <template #filter>
      <el-input
        v-model="filter.name"
        :placeholder="t('system.dictName')"
        clearable
        style="width: 180px"
        @keyup.enter="handleQuery"
      />
      <el-input
        v-model="filter.code"
        :placeholder="t('system.dictCode')"
        clearable
        style="width: 180px"
        @keyup.enter="handleQuery"
      />
      <el-select
        v-model="filter.status"
        :placeholder="t('common.status')"
        clearable
        style="width: 120px"
      >
        <el-option :label="t('common.statusNormal')" :value="0" />
        <el-option :label="t('common.disable')" :value="1" />
      </el-select>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>

    <!-- 表格区 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="name" :label="t('system.dictName')" min-width="140" />
      <el-table-column prop="code" :label="t('system.dictCode')" min-width="140" />
      <el-table-column prop="status" :label="t('common.status')" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ row.status === 0 ? t('common.statusNormal') : t('common.disable') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="description"
        :label="t('common.remark')"
        min-width="160"
        show-overflow-tooltip
      />
      <el-table-column :label="t('common.actions')" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="editRow(row)">{{
            t('common.edit')
          }}</el-button>
          <el-button size="small" link type="primary" @click="manageRow(row)">{{
            t('system.manageDictItems')
          }}</el-button>
          <el-button size="small" link type="danger" @click="deleteRow(row)">{{
            t('common.delete')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button type="primary" @click="openCreate">{{ t('system.newDictType') }}</el-button>
    </template>
  </StandardListTemplate>

  <!-- 新建/编辑弹窗 -->
  <el-dialog
    v-model="dialogVisible"
    :title="dialogTitle"
    :close-on-click-modal="false"
    destroy-on-close
    width="680px"
    @closed="resetForm"
  >
    <StandardFormTemplate embedded>
      <template v-if="formError" #alert>
        <el-alert :title="formError" type="error" :closable="false" show-icon />
      </template>

      <FormSection :title="t('common.basicInfo')">
        <FormGrid :columns="2">
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('system.dictName') }}</label>
            <el-input
              v-model="form.name"
              :placeholder="t('system.dictNamePlaceholder')"
              maxlength="64"
              show-word-limit
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('system.dictCode') }}</label>
            <el-input
              v-model="form.code"
              :placeholder="t('system.dictCodePlaceholder')"
              :disabled="!!editingId"
              maxlength="64"
              show-word-limit
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('common.status') }}</label>
            <el-select v-model="form.status" style="width: 100%">
              <el-option :label="t('common.statusNormal')" :value="0" />
              <el-option :label="t('common.disable')" :value="1" />
            </el-select>
          </div>
        </FormGrid>
        <FormGrid :columns="1" style="margin-top: 0">
          <div class="form-field">
            <label class="form-field__label">{{ t('common.remark') }}</label>
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="3"
              :placeholder="t('common.remarkPlaceholder')"
              maxlength="256"
              show-word-limit
            />
          </div>
        </FormGrid>
      </FormSection>

      <template #actions>
        <el-button @click="closeDialog">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">{{
          t('common.save')
        }}</el-button>
      </template>
    </StandardFormTemplate>
  </el-dialog>
</template>

<style scoped>
.form-field {
  display: flex;
  flex-direction: column;
  gap: var(--sw-space-8);
}

.form-field__label {
  font-size: var(--sw-font-body);
  font-weight: var(--sw-font-weight-emphasis);
  color: var(--sw-text-primary);
}

.form-field--required .form-field__label::before {
  content: '* ';
  color: var(--sw-danger);
}
</style>
