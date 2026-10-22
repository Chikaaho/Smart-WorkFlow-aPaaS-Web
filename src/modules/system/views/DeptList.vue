<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * DeptList — 部门管理列表页（树形表格）。
 *
 * 部门列表使用 el-table 树形表格（row-key + tree-props），不分页。
 * 使用树形列表与名称、状态、租户筛选；超管全租户结果按归属分组。
 * 数据加载：listDeptTree() 返回 flat 数组 → 前端 buildTree() 转为嵌套结构。
 * 操作：新建 / 编辑 / 删除 + 上级部门选择（tree-select）。
 */
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import {
  listDeptTree,
  getDept,
  createDept,
  updateDept,
  deleteDept,
} from '@/modules/system/api/dept'
import type { SysDept, DeptQuery } from '@/modules/system/types/dept'
import type { SysUser } from '@/modules/system/types/user'
import { pageUsers } from '@/modules/system/api/user'
import { hasPerm } from '@/foundation/permission'
import {
  SYS_DEPT_STATUS,
  deptStatusOptions,
  deptStatusTagType,
  deptStatusLabel,
} from '@/modules/system/constants'
import {
  ListToolbar,
  StandardFormTemplate,
  FormSection,
  FormGrid,
  ListActionsColumn,
} from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'

import { useUserStore } from '@/stores/user'
import TenantSelect from '@/modules/system/components/TenantSelect.vue'
import TenantTargetDialog from '@/modules/system/components/TenantTargetDialog.vue'
import { useManagementTenant } from '@/modules/system/composables/useManagementTenant'
import type { TenantContextOption } from '@/modules/system/types/tenant'

const userStore = useUserStore()
const {
  filterTenant,
  appliedTenant,
  targetTenant,
  pickerVisible,
  choosing,
  chooseForCreate,
  selectTarget,
  closePicker,
  useObjectTarget,
  applyFilter,
  resetFilter,
} = useManagementTenant()
let editorGeneration = 0
let optionsGeneration = 0
const targetDeptOptions = ref<SysDept[]>([])
const formLeaderOptions = ref<SysUser[]>([])
const optionsLoading = ref(false)

// ─── 列表状态 ───

const treeData = ref<SysDept[]>([])
const flatData = ref<SysDept[]>([])
const loading = ref(false)
const errorMsg = ref('')

// ─── 筛选状态 ───

/**
 * 筛选条件。status 用 '' 表示「全部」（不传 status），
 * 正常=SYS_DEPT_STATUS.NORMAL(0)、停用=SYS_DEPT_STATUS.DISABLED(1)，严格对齐后端契约。
 */
const filter = reactive<{ name: string; status: number | '' }>({ name: '', status: '' })

/** 状态下拉：全部（不传 status）+ 复用 deptStatusOptions 的 正常(0)/停用(1) 语义 */
const statusFilterOptions: Array<{ label: string; value: number | '' }> = [
  {
    get label() {
      return t('common.all')
    },
    value: '',
  },
  ...deptStatusOptions.map((opt) => ({ label: opt.label, value: opt.value })),
]

/** 是否处于筛选状态（任一条件生效） */
const hasFilter = computed(
  () => filter.name.trim() !== '' || filter.status !== '' || Boolean(appliedTenant.value),
)

/** 组装查询条件；无有效条件返回 undefined（等价无参调用） */
function buildQuery(): DeptQuery | undefined {
  const name = filter.name.trim()
  if (!name && filter.status === '' && !appliedTenant.value) return undefined
  const query: DeptQuery = {}
  if (appliedTenant.value) query.tenantId = appliedTenant.value.id
  if (name) query.name = name
  if (filter.status !== '') query.status = filter.status
  return query
}

/** flat 数组 → 嵌套树转换（筛选结果已含祖先，buildTree 后树形完整） */
function buildTree(
  list: SysDept[],
  parentId = '0',
  tenantId?: string,
  ancestors = new Set<string>(),
): SysDept[] {
  return list
    .filter(
      (item) =>
        (item.parentId ?? '0') === parentId &&
        (tenantId === undefined || item.tenantId === tenantId) &&
        !ancestors.has(item.id!),
    )
    .map((item) => ({
      ...item,
      children: buildTree(list, item.id!, item.tenantId, new Set([...ancestors, item.id!])),
    }))
}

function groupTenantTrees(list: SysDept[]): SysDept[] {
  if (!userStore.superAdmin || appliedTenant.value || !list.some((item) => item.tenantId != null))
    return buildTree(list)
  const tenants = new Map(
    list.filter((row) => row.tenantId != null).map((row) => [row.tenantId!, row.tenantName]),
  )
  return [...tenants].map(([id, name]) => ({
    id: `tenant:${id}`,
    parentId: '0',
    name: name || t('common.unknown'),
    code: '',
    tenantId: id,
    tenantName: name,
    tenantGroup: true,
    children: buildTree(list, '0', id),
  }))
}

async function loadTree() {
  loading.value = true
  errorMsg.value = ''
  try {
    const query = buildQuery()
    flatData.value = query ? await listDeptTree(query) : await listDeptTree()
    treeData.value = groupTenantTrees(flatData.value)
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('system.deptListLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

/** 查询：携带当前筛选条件重新加载 */
function handleQuery() {
  applyFilter()
  void loadTree()
}

/** 重置：清空筛选条件并恢复全量树 */
function handleReset() {
  resetFilter()
  filter.name = ''
  filter.status = ''
  void loadTree()
}

const isEmpty = computed(() => !loading.value && !errorMsg.value && treeData.value.length === 0)

/** 筛选条件下无匹配（区别于无筛选的空库空态，不显示新建入口） */
const isFilterEmpty = computed(() => hasFilter.value && isEmpty.value)

// ─── 弹窗状态 ───

const dialogVisible = ref(false)
const dialogTitle = computed(() => (editingId.value ? t('system.editDept') : t('system.newDept')))
const editingId = ref<string | null>(null)
const submitting = ref(false)
const formError = ref('')

const form = reactive<SysDept>({
  name: '',
  code: '',
  parentId: '0',
  sort: 0,
  status: SYS_DEPT_STATUS.NORMAL,
  leaderId: '',
})

/** 部门负责人候选（正常状态用户，I1）：页面加载一次供选择与姓名回显 */
const leaderOptions = ref<SysUser[]>([])

async function loadLeaderOptions() {
  try {
    const result = await pageUsers({ pageNum: 1, pageSize: 200 }, { status: 0 })
    leaderOptions.value = result.list
  } catch {
    ElMessage.error(t('common.loadFailed'))
    // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
    leaderOptions.value = []
  }
}

function leaderName(leaderId?: string): string {
  if (!leaderId) return ''
  return (
    leaderOptions.value.find((user) => user.id === leaderId)?.realName ||
    leaderOptions.value.find((user) => user.id === leaderId)?.username ||
    ''
  )
}

function resetForm() {
  editorGeneration++
  optionsGeneration++
  optionsLoading.value = false
  targetDeptOptions.value = []
  formLeaderOptions.value = []
  targetTenant.value = null
  form.tenantId = undefined
  form.name = ''
  form.code = ''
  form.parentId = '0'
  form.sort = 0
  form.status = SYS_DEPT_STATUS.NORMAL
  form.leaderId = ''
  editingId.value = null
  formError.value = ''
}

async function loadFormOptions(tenantId: string) {
  const generation = ++optionsGeneration
  targetDeptOptions.value = []
  formLeaderOptions.value = []
  optionsLoading.value = true
  const results = await Promise.allSettled([
    listDeptTree({ tenantId }),
    pageUsers({ pageNum: 1, pageSize: 200 }, { status: 0, tenantId }),
  ])
  if (generation !== optionsGeneration) return
  const [departments, users] = results
  if (departments.status === 'fulfilled')
    targetDeptOptions.value = departments.value.filter((row) => String(row.tenantId) === tenantId)
  if (users.status === 'fulfilled')
    formLeaderOptions.value = users.value.list.filter((row) => String(row.tenantId) === tenantId)
  if (results.some((result) => result.status === 'rejected'))
    ElMessage.error(t('common.loadFailed'))
  optionsLoading.value = false
}

async function openCreate(parentId?: string) {
  if (submitting.value || choosing.value) return
  resetForm()
  let preferred: TenantContextOption | null = appliedTenant.value
  if (parentId) {
    const parent = flatData.value.find((row) => row.id === parentId)
    if (!parent?.tenantId) {
      ElMessage.error(t('tenantContext.missingOwner'))
      return
    }
    preferred = {
      id: parent.tenantId,
      name: parent.tenantName || t('common.unknown'),
      code: '',
      writable: true,
    }
  }
  const target = await chooseForCreate(preferred)
  if (!target) return
  form.parentId = parentId ?? '0'
  form.tenantId = target.id
  dialogVisible.value = true
  await loadFormOptions(target.id)
}

async function openEdit(row: SysDept) {
  if (submitting.value) return
  resetForm()
  const generation = editorGeneration
  editingId.value = row.id ?? null
  try {
    const detail = await getDept(row.id!)
    if (generation !== editorGeneration) return
    useObjectTarget(detail)
    form.name = detail.name
    form.code = detail.code
    form.parentId = detail.parentId ?? '0'
    form.sort = detail.sort ?? 0
    form.status = detail.status
    form.leaderId = detail.leaderId ?? ''
    form.tenantId = targetTenant.value!.id
    dialogVisible.value = true
    await loadFormOptions(targetTenant.value!.id)
  } catch {
    if (generation === editorGeneration) ElMessage.error(t('system.deptDetailLoadFailed'))
  }
}

function closeDialog() {
  if (submitting.value) return
  dialogVisible.value = false
}

const parentDeptOptions = computed(() => {
  const excluded = new Set<string>()
  if (editingId.value) {
    const pending = [editingId.value]
    while (pending.length) {
      const id = pending.pop()!
      if (excluded.has(id)) continue
      excluded.add(id)
      targetDeptOptions.value
        .filter((row) => row.parentId === id)
        .forEach((row) => pending.push(row.id!))
    }
  }
  return [
    {
      id: '0',
      name: t('tenantContext.noParent'),
      code: '',
      children: buildTree(targetDeptOptions.value.filter((row) => !excluded.has(row.id!))),
    },
  ]
})

async function handleSubmit() {
  if (submitting.value || optionsLoading.value) return
  if (!targetTenant.value) {
    formError.value = t('tenantContext.choose')
    return
  }
  if (!form.name.trim()) {
    formError.value = t('system.deptNameRequired')
    return
  }
  if (!form.code.trim()) {
    formError.value = t('system.deptCodeRequired')
    return
  }

  submitting.value = true
  formError.value = ''
  try {
    if (editingId.value) {
      await updateDept({ ...form, id: editingId.value })
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await createDept({ ...form })
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
    void loadTree()
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

async function handleDelete(row: SysDept) {
  try {
    await ElMessageBox.confirm(
      t('system.deleteDeptConfirm', { name: row.name }),
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
    await deleteDept(row.id!)
    ElMessage.success(t('common.deleteSuccess'))
    void loadTree()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error(t('common.deleteFailed'))
    }
  }
}

// el-table row slot 的 DefaultRow 类型不与 SysDept 兼容，通过包装函数桥接。
function editRow(r: unknown) {
  openEdit(r as SysDept)
}
function deleteRow(r: unknown) {
  handleDelete(r as SysDept)
}
function addChildRow(r: unknown) {
  openCreate((r as SysDept).id)
}

/** 统一操作列（V012-BUG-002）：树形表格无分页；子部门/编辑/删除显隐由权限决定 */
function rowActions(r: unknown): ListAction[] {
  if ((r as SysDept).tenantGroup) return []
  return [
    {
      key: 'add-child',
      label: t('system.newSubDept'),
      visible: hasPerm('system:dept:create'),
      onClick: () => addChildRow(r),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      visible: hasPerm('system:dept:update'),
      onClick: () => editRow(r),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      visible: hasPerm('system:dept:delete'),
      type: 'danger',
      onClick: () => deleteRow(r),
    },
  ]
}

onMounted(() => {
  void loadTree()
  // 负责人列回显依赖候选用户表：挂载即加载，而非等到打开编辑对话框（I1 G1b）
  void loadLeaderOptions()
})
</script>

<template>
  <div class="dept-list">
    <!-- 工具栏（复用 ListToolbar） -->
    <ListToolbar :title="t('system.deptManagement')" :total="flatData.length">
      <template #actions>
        <el-button v-perm="'system:dept:create'" type="primary" @click="openCreate()">{{
          t('system.newDept')
        }}</el-button>
      </template>
    </ListToolbar>

    <!-- 筛选区：名称（Enter 触发查询）+ 状态（全部/正常/停用）+ 查询/重置 -->
    <div class="dept-list__filter">
      <TenantSelect
        v-if="userStore.superAdmin"
        v-model="filterTenant"
        class="dept-list__tenant-filter"
      />
      <el-input
        v-model="filter.name"
        :placeholder="t('system.deptName')"
        clearable
        style="width: 200px"
        @keyup.enter="handleQuery"
      />
      <el-select v-model="filter.status" style="width: 120px">
        <el-option
          v-for="opt in statusFilterOptions"
          :key="String(opt.value)"
          :label="opt.label"
          :value="opt.value"
        />
      </el-select>
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </div>

    <!-- 错误提示 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <!-- 表格区 -->
    <div class="dept-list__table-card">
      <el-table
        v-loading="loading"
        :data="treeData"
        row-key="id"
        stripe
        default-expand-all
        :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
      >
        <el-table-column prop="name" :label="t('system.deptName')" min-width="200" />
        <el-table-column
          v-if="userStore.superAdmin"
          :label="t('tenantContext.label')"
          min-width="140"
        >
          <template #default="{ row }">{{ row.tenantGroup ? '' : row.tenantName }}</template>
        </el-table-column>
        <el-table-column prop="code" :label="t('system.deptCode')" min-width="120" />
        <el-table-column :label="t('system.owner')" width="110">
          <template #default="{ row }">
            {{ row.leaderId ? row.leaderName || leaderName(row.leaderId) : '' }}
          </template>
        </el-table-column>
        <el-table-column prop="sort" :label="t('common.sort')" width="70" />
        <el-table-column prop="status" :label="t('common.status')" width="80">
          <template #default="{ row }">
            <el-tag v-if="!row.tenantGroup" :type="deptStatusTagType(row.status)" size="small">
              {{ deptStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <ListActionsColumn :actions="rowActions" :width="150" />
      </el-table>

      <!-- 空态：筛选条件下无匹配（提示重置，不回退全量树、不显示新建入口） -->
      <div v-if="isFilterEmpty" class="dept-list__empty">
        <span class="dept-list__empty-text">{{ t('system.noMatchingDept') }}</span>
        <el-button @click="handleReset">{{ t('common.resetFilters') }}</el-button>
      </div>
      <!-- 空态：无筛选条件且数据为空（新建部门入口） -->
      <div v-else-if="isEmpty" class="dept-list__empty">
        <el-button type="primary" @click="openCreate()">{{ t('system.newDept') }}</el-button>
      </div>
    </div>
  </div>

  <!-- 新建/编辑弹窗 -->
  <el-dialog
    v-model="dialogVisible"
    class="system-dept-editor"
    align-center
    :title="dialogTitle"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
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
          <div class="form-field tenant-owner-field">
            <label class="form-field__label">{{ t('tenantContext.label') }}</label>
            <el-input
              :model-value="targetTenant?.name ?? ''"
              :aria-label="t('tenantContext.label')"
              readonly
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('system.parentDept') }}</label>
            <el-tree-select
              v-model="form.parentId"
              :data="parentDeptOptions"
              node-key="id"
              :props="{ label: 'name', children: 'children' }"
              :placeholder="t('system.parentDeptPlaceholder')"
              clearable
              style="width: 100%"
              check-strictly
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('system.deptName') }}</label>
            <el-input
              v-model="form.name"
              :placeholder="t('system.deptNamePlaceholder')"
              maxlength="64"
              show-word-limit
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('system.deptCode') }}</label>
            <el-input
              v-model="form.code"
              :placeholder="t('system.deptCodePlaceholder')"
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
              <el-option
                v-for="opt in deptStatusOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div class="form-field">
            <label class="form-field__label">{{ t('system.deptLeader') }}</label>
            <el-select
              v-model="form.leaderId"
              :placeholder="t('system.leaderPlaceholder')"
              clearable
              filterable
              style="width: 100%"
            >
              <el-option
                v-for="user in formLeaderOptions"
                :key="user.id"
                :label="
                  user.realName && user.realName !== user.username
                    ? t('common.nameWithCode', { name: user.realName, code: user.username })
                    : user.username
                "
                :value="user.id ?? ''"
              />
            </el-select>
          </div>
        </FormGrid>
      </FormSection>
    </StandardFormTemplate>
    <template #footer>
      <el-button @click="closeDialog">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">{{
        t('common.save')
      }}</el-button>
    </template>
  </el-dialog>
  <TenantTargetDialog
    :model-value="pickerVisible"
    @update:model-value="closePicker"
    @selected="selectTarget"
  />
</template>

<style scoped>
.dept-list {
  padding: var(--sw-space-24);
}

/* BF20261013-038 全局巡检：卡片不再包住表格留 16px 内距（表头灰底与行分隔线随卡片圆角铺满，
   左右不留白）；空态自带内距，不贴卡片边缘。 */
.dept-list__table-card {
  background: var(--sw-bg-white, #fff);
  border-radius: var(--sw-radius-card);
  box-shadow: var(--sw-shadow-card);
  overflow: hidden;
  padding: 0;
}

.dept-list__filter {
  display: flex;
  align-items: center;
  gap: var(--sw-space-12);
  margin-bottom: var(--sw-space-16);
}

.dept-list__empty {
  text-align: center;
  padding: var(--sw-space-40) var(--sw-space-16);
  color: var(--sw-text-tertiary);
}

.dept-list__empty-text {
  display: block;
  margin-bottom: var(--sw-space-12);
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

<style scoped>
.tenant-owner-field {
  grid-column: 1 / -1;
}
.dept-list__tenant-filter {
  max-width: 240px;
}
</style>

<style scoped>
:global(.system-dept-editor.el-dialog) {
  max-width: calc(100vw - 32px);
}
:global(.system-dept-editor .el-dialog__body) {
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}
</style>
