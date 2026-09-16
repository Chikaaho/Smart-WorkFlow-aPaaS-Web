<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * PostList — 岗位管理列表页（页型B）。
 *
 * 使用 StandardListTemplate 槽位模板，数据外部进。
 * 筛选：code / name / status；操作：新建 / 编辑 / 删除。
 * 新建/编辑走 el-dialog 内嵌 StandardFormTemplate + 手写控件（高代码轨）。
 * 最标准 CRUD，最接近 DictTypeList 模式。
 */
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'
import { pagePosts, getPost, createPost, updatePost, deletePost } from '@/modules/system/api/post'
import type { SysPost, PostFilter } from '@/modules/system/types/post'
import type { PageQuery } from '@/contracts/common'
import {
  StandardListTemplate,
  StandardFormTemplate,
  FormSection,
  FormGrid,
} from '@/components/page-layout'

// ─── 列表状态 ───

const list = ref<SysPost[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const filter = reactive<PostFilter>({
  code: '',
  name: '',
  status: undefined,
})

const currentFilter = reactive<PostFilter>({ ...filter })

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pagePosts(pageQuery, currentFilter)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('system.postListLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  Object.assign(currentFilter, {
    code: filter.code || undefined,
    name: filter.name || undefined,
    status: filter.status,
  })
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.code = ''
  filter.name = ''
  filter.status = undefined
  currentFilter.code = undefined
  currentFilter.name = undefined
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
const dialogTitle = computed(() => (editingId.value ? t('system.editPost') : t('system.newPost')))
const editingId = ref<string | null>(null)
const submitting = ref(false)
const formError = ref('')

const form = reactive<SysPost>({
  code: '',
  name: '',
  sort: 0,
  status: 1,
  description: '',
})

function resetForm() {
  form.code = ''
  form.name = ''
  form.sort = 0
  form.status = 1
  form.description = ''
  editingId.value = null
  formError.value = ''
}

function openCreate() {
  resetForm()
  dialogVisible.value = true
}

async function openEdit(row: SysPost) {
  resetForm()
  editingId.value = row.id ?? null
  try {
    const detail = await getPost(row.id!)
    form.code = detail.code
    form.name = detail.name
    form.sort = detail.sort ?? 0
    form.status = detail.status
    form.description = detail.description ?? ''
  } catch {
    formError.value = t('system.postDetailLoadFailed')
    return
  }
  dialogVisible.value = true
}

function closeDialog() {
  dialogVisible.value = false
}

async function handleSubmit() {
  if (!form.code.trim()) {
    formError.value = t('system.postCodeRequired')
    return
  }
  if (!form.name.trim()) {
    formError.value = t('system.postNameRequired')
    return
  }

  submitting.value = true
  formError.value = ''
  try {
    if (editingId.value) {
      await updatePost({ ...form, id: editingId.value })
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await createPost({ ...form })
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

async function handleDelete(row: SysPost) {
  try {
    await ElMessageBox.confirm(
      t('system.deletePostConfirm', { name: row.name }),
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
    await deletePost(row.id!)
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

// el-table row slot 的 DefaultRow 类型不与 SysPost 兼容，通过包装函数桥接。
function editRow(r: unknown) {
  openEdit(r as SysPost)
}
function deleteRow(r: unknown) {
  handleDelete(r as SysPost)
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('system.postManagement')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：新建按钮 -->
    <template #toolbar-actions>
      <el-button v-perm="'system:post:create'" type="primary" @click="openCreate">{{
        t('system.newPost')
      }}</el-button>
    </template>

    <!-- 筛选区 -->
    <template #filter>
      <el-input
        v-model="filter.code"
        :placeholder="t('system.postCode')"
        clearable
        style="width: 180px"
        @keyup.enter="handleQuery"
      />
      <el-input
        v-model="filter.name"
        :placeholder="t('system.postName')"
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
        <el-option :label="t('common.statusNormal')" :value="1" />
        <el-option :label="t('common.disable')" :value="0" />
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
      <el-table-column prop="code" :label="t('system.postCode')" min-width="120" />
      <el-table-column prop="name" :label="t('system.postName')" min-width="140" />
      <el-table-column prop="sort" :label="t('common.sort')" width="70" />
      <el-table-column prop="status" :label="t('common.status')" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ row.status === 1 ? t('common.statusNormal') : t('common.disable') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="180" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="hasPerm('system:post:update')"
            size="small"
            link
            type="primary"
            @click="editRow(row)"
            >{{ t('common.edit') }}</el-button
          >
          <el-button
            v-if="hasPerm('system:post:delete')"
            size="small"
            link
            type="danger"
            @click="deleteRow(row)"
            >{{ t('common.delete') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button v-if="hasPerm('system:post:create')" type="primary" @click="openCreate">{{
        t('system.newPost')
      }}</el-button>
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
            <label class="form-field__label">{{ t('system.postCode') }}</label>
            <el-input
              v-model="form.code"
              :placeholder="t('system.postCodePlaceholder')"
              maxlength="64"
              show-word-limit
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('system.postName') }}</label>
            <el-input
              v-model="form.name"
              :placeholder="t('system.postNamePlaceholder')"
              maxlength="64"
              show-word-limit
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('common.sort') }}</label>
            <el-input-number v-model="form.sort" :min="0" :max="9999" style="width: 100%" />
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('common.status') }}</label>
            <el-select v-model="form.status" style="width: 100%">
              <el-option :label="t('common.statusNormal')" :value="1" />
              <el-option :label="t('common.disable')" :value="0" />
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
