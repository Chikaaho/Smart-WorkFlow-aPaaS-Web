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
  ListFilterItem,
  StandardListTemplate,
  StandardFormTemplate,
  FormSection,
  FormGrid,
  ListActionsColumn,
} from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'

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
    if (editingId.value) ElMessage.warning(t('system.dictNameRequired'))
    else formError.value = t('system.dictNameRequired')
    return
  }
  if (!form.code.trim()) {
    if (editingId.value) ElMessage.warning(t('system.dictCodeRequired'))
    else formError.value = t('system.dictCodeRequired')
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
    const message = err instanceof ApiError ? err.msg : t('common.saveFailed')
    if (editingId.value) ElMessage.error(message)
    else formError.value = message
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
    name: 'system-dict-data',
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

/** 统一操作列（V012-BUG-002）：编辑/管理字典项直显，删除收进「更多」 */
function rowActions(r: unknown): ListAction[] {
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      onClick: () => editRow(r),
    },
    {
      key: 'manage',
      label: t('system.manageDictItems'),
      onClick: () => manageRow(r),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      onClick: () => deleteRow(r),
    },
  ]
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    appearance="design"
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
      <el-button type="primary" @click="openCreate">{{ t('common.create') }}</el-button>
    </template>

    <!-- 筛选区 -->
    <template #filter>
      <ListFilterItem :label="t('system.dictName')">
        <el-input
          v-model="filter.name"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="handleQuery"
        />
      </ListFilterItem>
      <ListFilterItem :label="t('system.dictCode')">
        <el-input
          v-model="filter.code"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="handleQuery"
        />
      </ListFilterItem>
      <ListFilterItem :label="t('common.status')">
        <el-select v-model="filter.status" :placeholder="t('common.all')" clearable>
          <el-option :label="t('common.statusNormal')" :value="0" />
          <el-option :label="t('common.disable')" :value="1" />
        </el-select>
      </ListFilterItem>
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
          <el-tag :type="row.status === 0 ? 'success' : 'info'" size="small">
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
      <!-- BF20261013-038 全局巡检：150 装不下「编辑/管理字典项/删除」三格（实测中文 166、英文 181），
           末格被裁 48px；按四格标准放宽到 200 -->
      <ListActionsColumn :actions="rowActions" :width="200" />
    </el-table>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button type="primary" @click="openCreate">{{ t('common.create') }}</el-button>
    </template>
  </StandardListTemplate>

  <!-- 新建/编辑弹窗：编辑子态按 446:15178 收敛为 760×330 两列布局 -->
  <el-dialog
    v-model="dialogVisible"
    :title="dialogTitle"
    :close-on-click-modal="false"
    destroy-on-close
    :width="editingId ? '760px' : '680px'"
    :align-center="Boolean(editingId)"
    :class="['dict-type-dialog', { 'dict-type-dialog--edit': Boolean(editingId) }]"
    @closed="resetForm"
  >
    <div v-if="editingId" class="dict-edit" data-testid="dict-type-edit-body">
      <div class="form-field form-field--required">
        <label class="form-field__label">{{ t('system.dictName') }}</label>
        <el-input
          v-model="form.name"
          :placeholder="t('system.dictNamePlaceholder')"
          maxlength="64"
        />
      </div>
      <div class="form-field form-field--required">
        <label class="form-field__label">{{ t('system.dictCode') }}</label>
        <el-input
          v-model="form.code"
          :placeholder="t('system.dictCodePlaceholder')"
          maxlength="64"
          readonly
        />
      </div>
      <div class="form-field">
        <label class="form-field__label">{{ t('common.status') }}</label>
        <el-select v-model="form.status" style="width: 100%">
          <el-option :label="t('common.statusNormal')" :value="0" />
          <el-option :label="t('common.disable')" :value="1" />
        </el-select>
      </div>
      <div class="form-field">
        <label class="form-field__label">{{ t('common.remark') }}</label>
        <el-input
          v-model="form.description"
          class="dict-edit__remark"
          type="textarea"
          resize="none"
          :rows="3"
          :placeholder="t('common.remarkPlaceholder')"
          maxlength="256"
        />
      </div>
    </div>

    <StandardFormTemplate v-else embedded>
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

    <template v-if="editingId" #footer>
      <el-button @click="closeDialog">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">{{
        t('common.save')
      }}</el-button>
    </template>
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

/* 编辑子态：四字段两列、行距与备注 80px 固定表面（446:15178）。 */
.dict-edit {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 20px;
}
.dict-edit .form-field {
  gap: 6px;
}
.dict-edit .form-field__label {
  font-size: 14px;
  line-height: 22px;
}
.dict-edit__remark :deep(.el-textarea__inner) {
  box-sizing: border-box;
  height: 80px;
  min-height: 80px;
}
</style>

<style>
/* 设计节点 446:15178：编辑字典 760×330，两列四字段，右下按钮。 */
.dict-type-dialog--edit.el-dialog {
  box-sizing: border-box;
  display: flex;
  height: 330px;
  flex-direction: column;
  padding: 0;
  border: 1px solid var(--sw-border-light);
  border-radius: 8px;
  /* 本弹窗作用域默认细边框，不覆盖焦点/危险/禁用 */
  --el-border-color: #dde3ef;
  --el-input-border-color: #dde3ef;
}
.dict-type-dialog--edit .el-dialog__header {
  box-sizing: border-box;
  margin: 0 0 20px;
  padding: 28px 28px 0;
}
.dict-type-dialog--edit .el-dialog__title {
  color: var(--sw-text-primary);
  font-size: 16px;
  font-weight: var(--sw-font-weight-emphasis);
  line-height: 24px;
}
.dict-type-dialog--edit .el-dialog__headerbtn {
  top: 28px;
  right: 24px;
  width: 24px;
  height: 24px;
}
.dict-type-dialog--edit .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 24px;
}
.dict-type-dialog--edit .el-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  margin: 0;
  padding: 18px 25px 26px;
}
.dict-type-dialog--edit .el-dialog__footer .el-button {
  width: 80px;
  height: 32px;
  margin: 0;
}
</style>
