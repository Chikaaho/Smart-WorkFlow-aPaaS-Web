<script setup lang="ts">
import { useI18n } from '@/locales'
import { useLocalizedMenuTree } from '@/layouts/menu-title'

const { t } = useI18n()
/**
 * RoleList — 角色管理列表页（页型B）。
 *
 * 使用 StandardListTemplate 槽位模板，数据外部进。
 * 筛选：name / code / status；操作：新建 / 编辑 / 删除。
 * 新建/编辑走 el-dialog 内嵌 StandardFormTemplate + 手写控件（高代码轨）。
 * 角色编码编辑时 disabled（不允许修改编码）。
 */
import { ref, reactive, onMounted, computed, nextTick, watch } from 'vue'
import { ElMessage, ElMessageBox, type TreeInstance } from 'element-plus'
import { ApiError } from '@/foundation/request'
import {
  pageRoles,
  getRole,
  createRole,
  updateRole,
  deleteRole,
  getRoleMenus,
  updateRoleMenus,
  getRoleMembers,
} from '@/modules/system/api/role'
import { loadMenu } from '@/foundation/menu'
import type { MenuNode } from '@/contracts/menu'
import { listDeptTree } from '@/modules/system/api/dept'
import type { SysRole, RoleFilter } from '@/modules/system/types/role'
import type { SysDept } from '@/modules/system/types/dept'
import type { PageQuery } from '@/contracts/common'
import { hasPerm } from '@/foundation/permission'
import { updateUserRoles, pageUsers, getUserRoles } from '@/modules/system/api/user'
import type { SysUser } from '@/modules/system/types/user'
import {
  StandardListTemplate,
  StandardFormTemplate,
  FormSection,
  FormGrid,
  ListActionsColumn,
} from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'

// ─── 列表状态 ───

const list = ref<SysRole[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const filter = reactive<RoleFilter>({
  name: '',
  code: '',
  status: undefined,
})

const currentFilter = reactive<RoleFilter>({ ...filter })

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageRoles(pageQuery, currentFilter)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('system.roleListLoadFailed')
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

// ─── 数据权限（DataScope） ───
// 数值与后端 DataScope 枚举 ordinal 对齐，当前按 0-4 顺序
// （ALL=0 / DEPT=1 / DEPT_AND_CHILD=2 / SELF=3 / CUSTOM=4），数值映射待联调确认。

const DATA_SCOPE_OPTIONS = [
  {
    get label() {
      return t('common.all')
    },
    value: 0,
  },
  {
    get label() {
      return t('workflow.scopeDept')
    },
    value: 1,
  },
  {
    get label() {
      return t('system.dataScopeDeptAndBelow')
    },
    value: 2,
  },
  {
    get label() {
      return t('system.dataScopeSelfOnly')
    },
    value: 3,
  },
  {
    get label() {
      return t('system.dataScopeCustom')
    },
    value: 4,
  },
] as const
const DATA_SCOPE_CUSTOM = 4
const DATA_SCOPE_DEFAULT = 1

const deptTree = ref<SysDept[]>([])
const deptTreeError = ref('')
const deptTreeRef = ref<TreeInstance | null>(null)
const permissionTreeRef = ref<TreeInstance | null>(null)
const permissionTreeRaw = ref<MenuNode[]>([])
/** 授权树绑定用：标题按当前语言解析（服务端标题作回退）。 */
const permissionTree = useLocalizedMenuTree(permissionTreeRaw)
const permissionIds = ref<string[]>([])

/** flat 数组 → 嵌套树转换（与 DeptList 同构） */
function buildDeptTree(list: SysDept[], parentId = '0'): SysDept[] {
  return list
    .filter((item) => item.parentId === parentId)
    .map((item) => ({
      ...item,
      children: buildDeptTree(list, item.id!),
    }))
}

async function loadDeptTree() {
  deptTreeError.value = ''
  try {
    deptTree.value = buildDeptTree(await listDeptTree())
  } catch {
    deptTreeError.value = t('system.deptTreeLoadFailed')
  }
}

async function loadPermissionTree() {
  try {
    permissionTreeRaw.value = await loadMenu()
  } catch {
    ElMessage.error(t('common.loadFailed'))
    // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
    permissionTreeRaw.value = []
  }
}

/** 用表单中的 deptIds 回填树勾选（树为全量加载，无需展开即可 setCheckedKeys） */
function applyDeptCheckedKeys() {
  if (form.dataScope !== DATA_SCOPE_CUSTOM) return
  deptTreeRef.value?.setCheckedKeys(form.deptIds ?? [])
}

function handleDeptTreeCheck() {
  form.deptIds = (deptTreeRef.value?.getCheckedKeys() ?? []) as string[]
}

// ─── 弹窗状态 ───

// ─── 成员维护弹窗（I1：角色成员反向视图） ───

const membersDialogVisible = ref(false)
const membersRole = ref<SysRole | null>(null)
const members = ref<SysUser[]>([])
const membersTotal = ref(0)
const membersPageNum = ref(1)
const membersPageSize = ref(10)
const membersLoading = ref(false)
const membersError = ref('')
const candidateUser = ref('')
const candidateOptions = ref<SysUser[]>([])

function openMembers(row: SysRole) {
  membersRole.value = row
  membersPageNum.value = 1
  membersDialogVisible.value = true
  void loadMembers()
  void loadCandidates()
}

function handleMembersPageSizeChange() {
  membersPageNum.value = 1
  loadMembers()
}

async function loadMembers() {
  if (!membersRole.value?.id) return
  membersLoading.value = true
  membersError.value = ''
  try {
    const result = await getRoleMembers(membersRole.value.id, {
      pageNum: membersPageNum.value,
      pageSize: membersPageSize.value,
    })
    members.value = result.list
    // 后端 Long → JSON string：el-pagination 的 total 必须为 number，否则分页条静默消失
    membersTotal.value = Number(result.total) || 0
  } catch (err) {
    membersError.value = err instanceof ApiError ? err.msg : t('system.roleMembersLoadFailed')
  } finally {
    membersLoading.value = false
  }
}

async function loadCandidates(keyword = '') {
  try {
    const result = await pageUsers({ pageNum: 1, pageSize: 50 }, { username: keyword, status: 0 })
    candidateOptions.value = result.list
  } catch {
    ElMessage.error(t('common.loadFailed'))
    // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
    candidateOptions.value = []
  }
}

/** 添加成员：读取用户现有角色，追加本角色后整量写回 */
async function addMember(user: SysUser) {
  if (!membersRole.value?.id || !user.id) return
  try {
    const existing = await getUserRoles(user.id)
    if (existing.includes(membersRole.value.id)) {
      ElMessage.info(t('system.userAlreadyRoleMember'))
      return
    }
    await updateUserRoles(user.id, [...existing, membersRole.value.id])
    ElMessage.success(t('system.memberAdded'))
    candidateUser.value = ''
    await loadMembers()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('system.memberAddFailed'))
  }
}

/** 移除成员：读取用户现有角色，剔除本角色后整量写回 */
async function removeMember(user: SysUser) {
  if (!membersRole.value?.id || !user.id) return
  try {
    await ElMessageBox.confirm(
      t('system.confirmRemoveRoleMember', { name: membersRole.value.name }),
      t('system.removeConfirmTitle'),
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
    return
  }
  try {
    const existing = await getUserRoles(user.id)
    await updateUserRoles(
      user.id,
      existing.filter((id) => id !== membersRole.value!.id),
    )
    ElMessage.success(t('system.memberRemoved'))
    await loadMembers()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('system.memberRemoveFailed'))
  }
}

// el-table row slot 的 DefaultRow 类型不与 SysUser 兼容，通过包装函数桥接。
function removeMemberRow(r: unknown) {
  removeMember(r as SysUser)
}

const dialogVisible = ref(false)
const dialogTitle = computed(() => (editingId.value ? t('system.editRole') : t('system.newRole')))
const editingId = ref<string | null>(null)
const submitting = ref(false)
const formError = ref('')

const form = reactive<SysRole>({
  name: '',
  code: '',
  sort: 0,
  status: 1,
  dataScope: DATA_SCOPE_DEFAULT,
  deptIds: [],
  description: '',
})

// 用户切换为“自定义部门”时重建/恢复树勾选（弹窗 destroy-on-close 会销毁树实例）。
// 必须声明在 form 之后，watch 的 getter 在 setup 阶段即被求值。
watch(
  () => form.dataScope,
  async () => {
    await nextTick()
    applyDeptCheckedKeys()
  },
)

function resetForm() {
  form.name = ''
  form.code = ''
  form.sort = 0
  form.status = 1
  form.dataScope = DATA_SCOPE_DEFAULT
  form.deptIds = []
  form.description = ''
  form.builtIn = false
  permissionIds.value = []
  editingId.value = null
  formError.value = ''
}

async function openCreate() {
  resetForm()
  await loadDeptTree()
  await loadPermissionTree()
  dialogVisible.value = true
}

async function openEdit(row: SysRole) {
  resetForm()
  editingId.value = row.id ?? null
  try {
    const detail = await getRole(row.id!)
    form.name = detail.name
    form.code = detail.code
    form.sort = detail.sort ?? 0
    form.status = detail.status
    // 回填 builtIn：isProtectedRole（code=superadmin + builtIn）依赖此字段，
    // 缺失会让 superadmin 编辑态权限树/保存按钮失去禁用保护（既有缺口，最小修复）
    form.builtIn = detail.builtIn ?? false
    form.dataScope = detail.dataScope ?? DATA_SCOPE_DEFAULT
    form.deptIds = detail.deptIds ?? []
    form.description = detail.description ?? ''
    permissionIds.value = await getRoleMenus(row.id!)
  } catch {
    formError.value = t('system.roleDetailLoadFailed')
    return
  }
  dialogVisible.value = true
  await loadDeptTree()
  await loadPermissionTree()
  await nextTick()
  applyDeptCheckedKeys()
  // 级联勾选模式下只回填叶子节点：父目录节点由树勾选状态自动推导（半选/全选），
  // 直接 set 父节点会把未授权的兄弟子节点一并勾上，造成视觉过授权。
  const parentIds = collectParentIds(permissionTree.value ?? [])
  permissionTreeRef.value?.setCheckedKeys(
    permissionIds.value.filter((id) => !parentIds.has(String(id))),
  )
}

/** 收集树中所有含子节点的节点 id（用于区分目录/菜单与叶子按钮）。 */
function collectParentIds(nodes: Array<{ id: unknown; children?: unknown[] }>): Set<string> {
  const parents = new Set<string>()
  const walk = (list: Array<{ id: unknown; children?: unknown[] }>) => {
    for (const node of list) {
      if (node.children && node.children.length > 0) {
        parents.add(String(node.id))
        walk(node.children as Array<{ id: unknown; children?: unknown[] }>)
      }
    }
  }
  walk(nodes)
  return parents
}

function closeDialog() {
  dialogVisible.value = false
}

async function handleSubmit() {
  if (!form.name.trim()) {
    formError.value = t('system.roleNameRequired')
    return
  }
  if (!form.code.trim()) {
    formError.value = t('system.roleCodeRequired')
    return
  }

  submitting.value = true
  formError.value = ''
  // 非 CUSTOM 时 deptIds 传空数组
  const data = { ...form, deptIds: form.dataScope === DATA_SCOPE_CUSTOM ? form.deptIds : [] }
  try {
    if (editingId.value) {
      await updateRole({ ...data, id: editingId.value })
      if (!isProtectedRole.value) await updateRoleMenus(editingId.value, permissionIds.value)
      ElMessage.success(t('common.updateSuccess'))
    } else {
      const id = await createRole(data)
      await updateRoleMenus(id, permissionIds.value)
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

function handlePermissionCheck() {
  // 全选节点 + 半选父节点一并保存：目录节点是子菜单导航的必要载体，
  // 只存叶子会导致父目录丢失，子菜单在菜单树组装时被丢弃（授权与导航不一致）。
  const checked = (permissionTreeRef.value?.getCheckedKeys() ?? []) as string[]
  const halfChecked = (permissionTreeRef.value?.getHalfCheckedKeys() ?? []) as string[]
  permissionIds.value = [...new Set([...checked, ...halfChecked])]
}

const isProtectedRole = computed(() => form.builtIn === true && form.code === 'superadmin')
function canEditRole(input: unknown) {
  const row = input as SysRole
  return !(row.builtIn === true && row.code === 'superadmin')
}

async function handleDelete(row: SysRole) {
  try {
    await ElMessageBox.confirm(
      t('system.deleteRoleConfirm', { name: row.name }),
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
    await deleteRole(row.id!)
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

/** 统一操作列（V012-BUG-002）：成员入口权限用 visible 表达，superadmin 保护用 disabled 表达 */
function rowActions(r: unknown): ListAction[] {
  const row = r as SysRole
  return [
    {
      key: 'members',
      label: t('system.members'),
      visible: hasPerm('system:role:list'),
      onClick: () => openMembers(row),
    },
    {
      key: 'edit',
      label: t('common.edit'),
      disabled: !canEditRole(row),
      onClick: () => openEdit(row),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      disabled: !canEditRole(row),
      onClick: () => handleDelete(row),
    },
  ]
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('system.roleManagement')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：新建按钮 -->
    <template #toolbar-actions>
      <el-button v-perm="'system:role:create'" type="primary" @click="openCreate">{{
        t('system.newRole')
      }}</el-button>
    </template>

    <!-- 筛选区 -->
    <template #filter>
      <el-input
        v-model="filter.name"
        :placeholder="t('system.roleName')"
        clearable
        style="width: 180px"
        @keyup.enter="handleQuery"
      />
      <el-input
        v-model="filter.code"
        :placeholder="t('system.roleCode')"
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
      <el-table-column prop="name" :label="t('system.roleName')" min-width="140" />
      <el-table-column prop="code" :label="t('system.roleCode')" min-width="120" />
      <el-table-column prop="sort" :label="t('common.sort')" width="70" />
      <el-table-column prop="status" :label="t('common.status')" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ row.status === 1 ? t('common.statusNormal') : t('common.disable') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="builtIn" :label="t('system.builtIn')" width="70">
        <template #default="{ row }">
          <el-tag :type="row.builtIn ? 'danger' : 'info'" size="small">
            {{ row.builtIn ? t('common.yes') : t('common.no') }}
          </el-tag>
        </template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :width="150" />
    </el-table>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button v-perm="'system:role:create'" type="primary" @click="openCreate">{{
        t('system.newRole')
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
            <label class="form-field__label">{{ t('system.roleName') }}</label>
            <el-input
              v-model="form.name"
              :placeholder="t('system.roleNamePlaceholder')"
              maxlength="64"
              show-word-limit
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">{{ t('system.roleCode') }}</label>
            <el-input
              v-model="form.code"
              :placeholder="t('system.roleCodePlaceholder')"
              :disabled="!!editingId || isProtectedRole"
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
            <el-select v-model="form.status" style="width: 100%" :disabled="isProtectedRole">
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

      <FormSection :title="t('system.dataScope')">
        <FormGrid :columns="1">
          <div class="form-field">
            <label class="form-field__label">{{ t('system.dataScopeField') }}</label>
            <el-select v-model="form.dataScope" style="width: 100%" :disabled="isProtectedRole">
              <el-option
                v-for="opt in DATA_SCOPE_OPTIONS"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
          </div>
          <div v-if="form.dataScope === DATA_SCOPE_CUSTOM" class="form-field">
            <label class="form-field__label">{{ t('system.dataScopeCustom') }}</label>
            <div v-if="deptTreeError" class="dept-tree-box dept-tree-box--tip">
              {{ deptTreeError }}
            </div>
            <div v-else-if="deptTree.length" class="dept-tree-box">
              <el-tree
                ref="deptTreeRef"
                :data="deptTree"
                node-key="id"
                show-checkbox
                check-strictly
                default-expand-all
                :props="{ label: 'name', children: 'children' }"
                @check="handleDeptTreeCheck"
              />
            </div>
            <div v-else class="dept-tree-box dept-tree-box--tip">{{ t('system.noDeptData') }}</div>
          </div>
        </FormGrid>
      </FormSection>

      <FormSection :title="t('system.menuPermissions')">
        <el-tree
          ref="permissionTreeRef"
          :data="permissionTree"
          node-key="id"
          show-checkbox
          default-expand-all
          :props="{ label: 'title', children: 'children' }"
          :disabled="isProtectedRole"
          @check="handlePermissionCheck"
        />
      </FormSection>

      <template #actions>
        <el-button @click="closeDialog">{{ t('common.cancel') }}</el-button>
        <el-button
          v-if="!isProtectedRole"
          type="primary"
          :loading="submitting"
          @click="handleSubmit"
          >{{ t('common.save') }}</el-button
        >
      </template>
    </StandardFormTemplate>
  </el-dialog>
  <!-- 成员维护弹窗（I1） -->
  <el-dialog
    v-model="membersDialogVisible"
    :title="t('system.roleMembersDialogTitle', { name: membersRole?.name ?? '' })"
    width="640px"
  >
    <el-alert
      v-if="membersError"
      :title="membersError"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <div style="display: flex; gap: 8px; margin-bottom: 12px">
      <el-select
        v-model="candidateUser"
        filterable
        remote
        clearable
        :placeholder="t('system.searchUserPlaceholder')"
        :remote-method="loadCandidates"
        style="flex: 1"
      >
        <el-option
          v-for="user in candidateOptions"
          :key="user.id"
          :label="
            user.realName
              ? t('common.nameWithCode', { name: user.realName, code: user.username })
              : user.username
          "
          :value="user.id ?? ''"
        />
      </el-select>
      <el-button
        type="primary"
        :disabled="!candidateUser"
        @click="addMember(candidateOptions.find((u) => u.id === candidateUser)!)"
        >{{ t('common.add') }}</el-button
      >
    </div>
    <el-table v-loading="membersLoading" :data="members" stripe size="small">
      <el-table-column prop="username" :label="t('common.username')" min-width="120" />
      <el-table-column prop="realName" :label="t('system.fullName')" min-width="100" />
      <el-table-column :label="t('common.actions')" width="90">
        <template #default="{ row }">
          <el-button size="small" link type="danger" @click="removeMemberRow(row)">{{
            t('common.remove')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-model:current-page="membersPageNum"
      v-model:page-size="membersPageSize"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      :total="membersTotal"
      @current-change="loadMembers"
      @size-change="handleMembersPageSizeChange"
    />
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

.dept-tree-box {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-card);
  padding: var(--sw-space-8);
}

.dept-tree-box--tip {
  font-size: var(--sw-font-body);
  color: var(--sw-text-tertiary);
}
</style>
