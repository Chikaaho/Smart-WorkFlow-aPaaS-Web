<script setup lang="ts">
/**
 * DictDataList — 某字典类型下的字典项列表页（页型B）。
 *
 * 从路由参数取 dictCode，筛选固定该 code。
 * 使用 StandardListTemplate 槽位模板，数据外部进。
 * 新建/编辑走 el-dialog 内嵌 StandardFormTemplate + 手写控件（高代码轨）。
 */
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import {
  pageDictData,
  getDictData,
  createDictData,
  updateDictData,
  deleteDictData,
} from '@/modules/system/api/dict'
import type { SysDictData, DictDataFilter } from '@/modules/system/types/dict'
import type { PageQuery } from '@/contracts/common'
import {
  StandardListTemplate,
  StandardFormTemplate,
  FormSection,
  FormGrid,
} from '@/components/page-layout'

const route = useRoute()
const router = useRouter()

// ─── 路由参数 ───

const dictCode = String(route.query.dictCode ?? '')
const dictName = String(route.query.dictName ?? '')

// ─── 列表状态 ───

const list = ref<SysDictData[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

interface FilterState {
  label: string
  dictValue: string
  status: number | undefined
}

const filter = reactive<FilterState>({
  label: '',
  dictValue: '',
  status: undefined,
})

interface AppliedFilter {
  label?: string
  dictValue?: string
  status?: number
}

const currentFilter = reactive<AppliedFilter>({
  label: undefined,
  dictValue: undefined,
  status: undefined,
})

function buildFilter(): DictDataFilter {
  const f: DictDataFilter = { dictCode }
  if (currentFilter.label) f.label = currentFilter.label
  if (currentFilter.dictValue) f.dictValue = currentFilter.dictValue
  if (currentFilter.status !== undefined) f.status = currentFilter.status
  return f
}

async function loadList() {
  if (!dictCode) {
    errorMsg.value = '缺少字典编码参数'
    return
  }

  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageDictData(pageQuery, buildFilter())
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载字典项列表失败'
    }
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  Object.assign(currentFilter, {
    label: filter.label || undefined,
    dictValue: filter.dictValue || undefined,
    status: filter.status,
  })
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.label = ''
  filter.dictValue = ''
  filter.status = undefined
  currentFilter.label = undefined
  currentFilter.dictValue = undefined
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

// el-switch 需要 boolean v-model，桥接 form.isDefault (0/1)
const switchDefault = computed({
  get: () => form.isDefault === 1,
  set: (v: boolean) => {
    form.isDefault = v ? 1 : 0
  },
})

// ─── 弹窗状态 ───

const dialogVisible = ref(false)
const dialogTitle = computed(() => (editingId.value ? '编辑字典项' : '新建字典项'))
const editingId = ref<string | null>(null)
const submitting = ref(false)
const formError = ref('')

const form = reactive<SysDictData>({
  dictCode,
  label: '',
  dictValue: '',
  sort: 0,
  status: 1,
  isDefault: 0,
  cssClass: '',
  listClass: '',
  description: '',
})

function resetForm() {
  form.dictCode = dictCode
  form.label = ''
  form.dictValue = ''
  form.sort = 0
  form.status = 1
  form.isDefault = 0
  form.cssClass = ''
  form.listClass = ''
  form.description = ''
  editingId.value = null
  formError.value = ''
}

function openCreate() {
  resetForm()
  dialogVisible.value = true
}

async function openEdit(row: SysDictData) {
  resetForm()
  editingId.value = row.id ?? null
  try {
    const detail = await getDictData(row.id!)
    form.dictCode = detail.dictCode
    form.label = detail.label
    form.dictValue = detail.dictValue
    form.sort = detail.sort
    form.status = detail.status
    form.isDefault = detail.isDefault
    form.cssClass = detail.cssClass ?? ''
    form.listClass = detail.listClass ?? ''
    form.description = detail.description ?? ''
  } catch {
    formError.value = '加载字典项详情失败'
    return
  }
  dialogVisible.value = true
}

function closeDialog() {
  dialogVisible.value = false
}

async function handleSubmit() {
  if (!form.label.trim()) {
    formError.value = '字典标签不能为空'
    return
  }
  if (!form.dictValue.trim()) {
    formError.value = '字典键值不能为空'
    return
  }

  submitting.value = true
  formError.value = ''
  try {
    if (editingId.value) {
      await updateDictData({ ...form, id: editingId.value })
      ElMessage.success('更新成功')
    } else {
      await createDictData({ ...form })
      ElMessage.success('创建成功')
    }
    closeDialog()
    void loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      formError.value = err.msg
    } else {
      formError.value = '保存失败'
    }
  } finally {
    submitting.value = false
  }
}

async function handleDelete(row: SysDictData) {
  try {
    await ElMessageBox.confirm(`确定要删除字典项"${row.label}"吗？`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }
  try {
    await deleteDictData(row.id!)
    ElMessage.success('删除成功')
    void loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('删除失败')
    }
  }
}

function handleGoBack() {
  void router.push({ path: '/dict-type' })
}

// el-table row slot 的 DefaultRow 类型不与 SysDictData 兼容，通过包装函数桥接。
function editRow(r: unknown) {
  openEdit(r as SysDictData)
}
function deleteRow(r: unknown) {
  handleDelete(r as SysDictData)
}

onMounted(loadList)
</script>

<template>
  <!-- 返回导航 + 字典类型信息 -->
  <div class="dict-data-header">
    <el-button link type="primary" @click="handleGoBack"> ← 返回字典类型列表 </el-button>
    <span class="dict-data-header__info">
      <template v-if="dictName">字典类型：{{ dictName }}（{{ dictCode }}）</template>
      <template v-else>字典编码：{{ dictCode }}</template>
    </span>
  </div>

  <StandardListTemplate
    :title="`字典项管理`"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：新建按钮 -->
    <template #toolbar-actions>
      <el-button type="primary" @click="openCreate">新建字典项</el-button>
    </template>

    <!-- 筛选区 -->
    <template #filter>
      <el-input
        v-model="filter.label"
        placeholder="字典标签"
        clearable
        style="width: 180px"
        @keyup.enter="handleQuery"
      />
      <el-input
        v-model="filter.dictValue"
        placeholder="字典键值"
        clearable
        style="width: 180px"
        @keyup.enter="handleQuery"
      />
      <el-select v-model="filter.status" placeholder="状态" clearable style="width: 120px">
        <el-option label="正常" :value="1" />
        <el-option label="停用" :value="0" />
      </el-select>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
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
      <el-table-column prop="label" label="字典标签" min-width="140" />
      <el-table-column prop="dictValue" label="字典键值" min-width="120" />
      <el-table-column prop="sort" label="排序" width="80" align="center" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ row.status === 1 ? '正常' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="isDefault" label="默认" width="70" align="center">
        <template #default="{ row }">
          <el-tag :type="row.isDefault === 1 ? 'warning' : 'info'" size="small">
            {{ row.isDefault === 1 ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="editRow(row)">编辑</el-button>
          <el-button size="small" link type="danger" @click="deleteRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button type="primary" @click="openCreate">新建字典项</el-button>
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

      <FormSection title="基本信息">
        <FormGrid :columns="2">
          <div class="form-field form-field--required">
            <label class="form-field__label">字典标签</label>
            <el-input
              v-model="form.label"
              placeholder="请输入字典标签"
              maxlength="128"
              show-word-limit
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">字典键值</label>
            <el-input
              v-model="form.dictValue"
              placeholder="请输入字典键值"
              maxlength="128"
              show-word-limit
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">排序</label>
            <el-input-number
              v-model="form.sort"
              :min="0"
              :max="9999"
              placeholder="排序号"
              style="width: 100%"
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">状态</label>
            <el-select v-model="form.status" style="width: 100%">
              <el-option label="正常" :value="1" />
              <el-option label="停用" :value="0" />
            </el-select>
          </div>
          <div class="form-field">
            <label class="form-field__label">是否默认</label>
            <el-switch v-model="switchDefault" active-text="是" inactive-text="否" />
          </div>
          <div class="form-field">
            <label class="form-field__label">CSS 类名</label>
            <el-input v-model="form.cssClass" placeholder="表格回显样式类" maxlength="64" />
          </div>
          <div class="form-field">
            <label class="form-field__label">列表样式</label>
            <el-input v-model="form.listClass" placeholder="下拉列表样式类" maxlength="64" />
          </div>
        </FormGrid>
        <FormGrid :columns="1" style="margin-top: 0">
          <div class="form-field">
            <label class="form-field__label">备注</label>
            <el-input
              v-model="form.description"
              type="textarea"
              :rows="3"
              placeholder="请输入备注"
              maxlength="256"
              show-word-limit
            />
          </div>
        </FormGrid>
      </FormSection>

      <template #actions>
        <el-button @click="closeDialog">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="handleSubmit">保存</el-button>
      </template>
    </StandardFormTemplate>
  </el-dialog>
</template>

<style scoped>
.dict-data-header {
  display: flex;
  align-items: center;
  gap: var(--sw-space-16);
  padding: var(--sw-space-16) var(--sw-space-24);
  margin-bottom: var(--sw-space-8);
}

.dict-data-header__info {
  font-size: var(--sw-font-secondary);
  color: var(--sw-text-secondary);
}

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
