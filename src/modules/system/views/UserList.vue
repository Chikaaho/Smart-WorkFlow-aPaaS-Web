<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * UserList — 用户管理列表页（页型B）。
 *
 * 使用 StandardListTemplate 槽位模板，数据外部进。
 * 筛选：username / status；操作：新建 / 编辑 / 删除。
 * 新建/编辑走 el-dialog 内嵌 StandardFormTemplate + 手写控件（高代码轨）。
 * 密码字段仅在新建模式显示（v-if="!editingId"）。
 */
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import {
  pageUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  getUserRoles,
  getUserPosts,
} from '@/modules/system/api/user'
import { pageRoles } from '@/modules/system/api/role'
import { listDeptTree } from '@/modules/system/api/dept'
import { pagePosts } from '@/modules/system/api/post'
import type { SysRole, RoleFilter } from '@/modules/system/types/role'
import type { SysDept } from '@/modules/system/types/dept'
import type { SysPost } from '@/modules/system/types/post'
import type {
  SysUser,
  UserFormRequest,
  UserFilter,
  PostAssociation,
} from '@/modules/system/types/user'
import type { PageQuery } from '@/contracts/common'
import { hasPerm } from '@/foundation/permission'
import { SYS_USER_STATUS, userStatusOptions, userStatusLabel } from '@/modules/system/constants'
import { ListFilterItem, StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import { useUserStore } from '@/stores/user'
import { InfoFilled, Plus, Search } from '@element-plus/icons-vue'

import DetailDialog from '@/components/DetailDialog.vue'
import TenantSelect from '@/modules/system/components/TenantSelect.vue'
import TenantTargetDialog from '@/modules/system/components/TenantTargetDialog.vue'
import { useManagementTenant } from '@/modules/system/composables/useManagementTenant'

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

// ─── 列表状态 ───

const list = ref<SysUser[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const filter = reactive<UserFilter>({
  username: '',
  status: undefined,
})

const currentFilter = reactive<UserFilter>({ ...filter })

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageUsers(pageQuery, currentFilter)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('system.userListLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  applyFilter()
  Object.assign(currentFilter, {
    username: filter.username || undefined,
    status: filter.status,
    tenantId: appliedTenant.value?.id,
  })
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  resetFilter()
  currentFilter.tenantId = undefined
  filter.username = ''
  filter.status = undefined
  currentFilter.username = undefined
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
const userStore = useUserStore()
const roleOptions = ref<SysRole[]>([])
const roleOptionsLoading = ref(false)
const roleIds = ref<string[]>([])
/** 本次配置角色所属租户：编辑取用户详情，新建取明确目标租户 */
const targetTenantId = ref<string | null>(null)
const roleDialogVisible = ref(false)
const roleDraft = ref<string[]>([])
const roleKeyword = ref('')

const selectedRoles = computed(() =>
  roleIds.value
    .map((id) => roleOptions.value.find((role) => role.id === id))
    .filter((role): role is SysRole => Boolean(role)),
)

const filteredRoleOptions = computed(() => {
  const keyword = roleKeyword.value.trim().toLowerCase()
  if (!keyword) return roleOptions.value
  return roleOptions.value.filter(
    (role) =>
      role.name.toLowerCase().includes(keyword) || role.code.toLowerCase().includes(keyword),
  )
})

const assignableRoles = computed(() =>
  filteredRoleOptions.value.filter((role) => !isRoleLocked(role)),
)
const postOptions = ref<SysPost[]>([])
/** 岗位任职勾选（postId 集合）+ 各岗位任职部门（缺省 = 用户主部门，I1） */
const postIds = ref<string[]>([])
const postDeptMap = reactive<Record<string, string>>({})
const deptOptions = ref<SysDept[]>([])

/** 勾选岗位时预填任职部门为当前表单主部门；取消勾选时清除映射 */
watch(postIds, (ids) => {
  const keys = ids.map(String)
  keys.forEach((key) => {
    if (!(key in postDeptMap)) postDeptMap[key] = form.deptId ?? ''
  })
  Object.keys(postDeptMap).forEach((key) => {
    if (!keys.includes(key)) delete postDeptMap[key]
  })
})

function toPostPayload(): PostAssociation[] {
  return postIds.value.map((postId) => ({
    postId,
    ...(postDeptMap[postId] ? { deptId: postDeptMap[postId] } : {}),
  }))
}

async function loadRoleOptions(tenantId: string | null) {
  const generation = ++optionsGeneration
  roleOptions.value = []
  postOptions.value = []
  deptOptions.value = []
  if (!tenantId) return
  roleOptionsLoading.value = true
  const results = await Promise.allSettled([
    pageRoles({ pageNum: 1, pageSize: 200 }, { tenantId } satisfies RoleFilter),
    pagePosts({ pageNum: 1, pageSize: 200 }, { tenantId }),
    listDeptTree({ tenantId }),
  ])
  if (generation !== optionsGeneration) return
  const [roles, posts, departments] = results
  if (roles.status === 'fulfilled')
    roleOptions.value = roles.value.list.filter((item) => String(item.tenantId) === tenantId)
  if (posts.status === 'fulfilled')
    postOptions.value = posts.value.list.filter(
      (item) =>
        String(item.tenantId) === tenantId && (item.status === undefined || item.status === 1),
    )
  if (departments.status === 'fulfilled')
    deptOptions.value = departments.value.filter((item) => String(item.tenantId) === tenantId)
  if (results.some((result) => result.status === 'rejected'))
    ElMessage.error(t('common.loadFailed'))
  roleOptionsLoading.value = false
}

// ─── 弹窗状态 ───

const protectedDetailsVisible = ref(false)
const protectedDetails = ref<SysUser | null>(null)
const dialogVisible = ref(false)
const dialogTitle = computed(() => (editingId.value ? t('system.editUser') : t('system.newUser')))
const editingId = ref<string | null>(null)
const roleDialogHint = computed(() =>
  editingId.value ? t('system.roleDialogHintEdit') : t('system.roleDialogHintCreate'),
)
const submitting = ref(false)
const formError = ref('')

const form = reactive<UserFormRequest>({
  username: '',
  realName: '',
  email: '',
  phone: '',
  sex: 0,
  status: SYS_USER_STATUS.NORMAL,
  deptId: '',
  plainPassword: '',
})

function resetForm() {
  editorGeneration++
  optionsGeneration++
  roleOptionsLoading.value = false
  targetTenant.value = null
  form.tenantId = undefined
  form.username = ''
  form.realName = ''
  form.email = ''
  form.phone = ''
  form.sex = 0
  form.status = SYS_USER_STATUS.NORMAL
  form.deptId = ''
  form.plainPassword = ''
  editingId.value = null
  formError.value = ''
  roleIds.value = []
  roleDraft.value = []
  roleKeyword.value = ''
  roleDialogVisible.value = false
  targetTenantId.value = null
  postIds.value = []
  Object.keys(postDeptMap).forEach((key) => delete postDeptMap[key])
}

async function openCreate() {
  if (submitting.value || choosing.value) return
  resetForm()
  const target = await chooseForCreate()
  if (!target) return
  targetTenantId.value = target.id
  form.tenantId = target.id
  dialogVisible.value = true
  await loadRoleOptions(target.id)
}

async function openEdit(row: SysUser) {
  if (submitting.value) return
  resetForm()
  const generation = editorGeneration
  editingId.value = row.id ?? null
  try {
    const [detail, roles, associations] = await Promise.all([
      getUser(row.id!),
      getUserRoles(row.id!),
      getUserPosts(row.id!),
    ])
    if (generation !== editorGeneration) return
    useObjectTarget(detail)
    form.username = detail.username
    form.realName = detail.realName ?? ''
    form.email = detail.email ?? ''
    form.phone = detail.phone ?? ''
    form.sex = detail.sex ?? 0
    form.status = detail.status
    form.deptId = detail.deptId ?? ''
    form.tenantId = targetTenant.value!.id
    targetTenantId.value = targetTenant.value!.id
    roleIds.value = roles
    postIds.value = associations.map((item) => item.postId)
    associations.forEach((item) => {
      if (item.deptId) postDeptMap[item.postId] = item.deptId
    })
    dialogVisible.value = true
    await loadRoleOptions(targetTenantId.value)
  } catch {
    if (generation === editorGeneration) ElMessage.error(t('system.userDetailLoadFailed'))
  }
}

function closeDialog() {
  if (submitting.value) return
  dialogVisible.value = false
}

function openRoleDialog() {
  roleKeyword.value = ''
  roleDraft.value = [...roleIds.value]
  roleDialogVisible.value = true
  if (!roleOptionsLoading.value && roleOptions.value.length === 0) {
    void loadRoleOptions(targetTenantId.value)
  }
}

/** 内置超管与停用角色仅对已绑定用户可操作，避免选到后端拒绝的角色 */
function isRoleLocked(role: SysRole): boolean {
  const assigned = role.id != null && roleIds.value.includes(role.id)
  if (assigned) return false
  return role.status === 0 || role.code === 'superadmin'
}

function selectAllRoles() {
  roleDraft.value = Array.from(
    new Set([...roleDraft.value, ...assignableRoles.value.map((role) => role.id!)]),
  )
}

function clearRoleDraft() {
  roleDraft.value = []
}

function removeRole(id: string) {
  roleIds.value = roleIds.value.filter((roleId) => roleId !== id)
}

function confirmRoleDialog() {
  roleIds.value = [...roleDraft.value]
  roleDialogVisible.value = false
}

async function handleSubmit() {
  if (submitting.value || roleOptionsLoading.value) return
  if (!targetTenant.value) {
    formError.value = t('tenantContext.choose')
    return
  }
  if (!form.username.trim()) {
    formError.value = t('system.usernameRequired')
    return
  }

  submitting.value = true
  formError.value = ''
  try {
    if (editingId.value) {
      // 编辑模式不传 plainPassword
      const { plainPassword: _, ...updateData } = form
      void _
      await updateUser({
        ...updateData,
        id: editingId.value,
        tenantId: targetTenant.value.id,
        roleIds: roleIds.value,
        posts: toPostPayload(),
      })
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await createUser({
        ...form,
        tenantId: targetTenant.value.id,
        roleIds: roleIds.value,
        posts: toPostPayload(),
      })
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
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

async function handleDelete(row: SysUser) {
  try {
    await ElMessageBox.confirm(
      t('system.confirmDeleteUser', { username: row.username }),
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
    await deleteUser(row.id!)
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

// el-table row slot 的 DefaultRow 类型不与 SysUser 兼容，通过包装函数桥接。
function editRow(r: unknown) {
  openEdit(r as SysUser)
}
function deleteRow(r: unknown) {
  handleDelete(r as SysUser)
}

/** 统一操作列（V012-BUG-002）：编辑/删除显隐由权限决定（服务端仍是最终权威） */
function rowActions(r: unknown): ListAction[] {
  if ((r as SysUser).protectedAccount)
    return [
      {
        key: 'view',
        label: t('common.view'),
        onClick: () => {
          protectedDetails.value = r as SysUser
          protectedDetailsVisible.value = true
        },
      },
    ]
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      visible: hasPerm('system:user:update'),
      onClick: () => editRow(r),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      visible: hasPerm('system:user:delete'),
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
    :title="t('system.userManagement')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：新建按钮 -->
    <template #toolbar-actions>
      <el-button v-perm="'system:user:create'" type="primary" @click="openCreate">{{
        t('system.newUser')
      }}</el-button>
    </template>

    <!-- 筛选区 -->
    <template #filter>
      <ListFilterItem v-if="userStore.superAdmin" :label="t('tenantContext.label')">
        <TenantSelect v-model="filterTenant" />
      </ListFilterItem>
      <ListFilterItem :label="t('common.username')">
        <el-input
          v-model="filter.username"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="handleQuery"
        />
      </ListFilterItem>
      <ListFilterItem :label="t('common.status')">
        <el-select v-model="filter.status" :placeholder="t('common.all')" clearable>
          <el-option
            v-for="opt in userStatusOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
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
    <el-table v-loading="loading" :data="list">
      <el-table-column
        v-if="userStore.superAdmin"
        prop="tenantName"
        :label="t('tenantContext.label')"
        min-width="140"
      />
      <el-table-column prop="username" :label="t('common.username')" min-width="120" />
      <el-table-column prop="realName" :label="t('system.fullName')" min-width="100" />
      <el-table-column
        prop="email"
        :label="t('system.email')"
        min-width="160"
        show-overflow-tooltip
      />
      <el-table-column prop="phone" :label="t('system.phone')" width="130" />
      <el-table-column prop="sex" :label="t('system.gender')" width="70">
        <template #default="{ row }">
          {{
            row.sex === 1
              ? t('common.male')
              : row.sex === 2
                ? t('common.female')
                : t('common.unknown')
          }}
        </template>
      </el-table-column>
      <el-table-column prop="status" :label="t('common.status')" width="80">
        <template #default="{ row }">
          <span class="sys-status-text">{{ userStatusLabel(row.status) }}</span>
        </template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :width="120" />
    </el-table>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button v-perm="'system:user:create'" type="primary" @click="openCreate">{{
        t('system.newUser')
      }}</el-button>
    </template>
  </StandardListTemplate>

  <!-- 新建/编辑弹窗 -->
  <el-dialog
    v-model="dialogVisible"
    class="system-user-editor sw-edit-dialog"
    align-center
    :title="dialogTitle"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    destroy-on-close
    width="760px"
    @closed="resetForm"
  >
    <el-alert
      v-if="formError"
      :title="formError"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <div class="sw-edit-grid">
      <div class="form-field tenant-owner-field">
        <label class="form-field__label">{{ t('tenantContext.label') }}</label>
        <el-input
          :model-value="targetTenant?.name ?? ''"
          :aria-label="t('tenantContext.label')"
          readonly
        />
      </div>
      <div class="form-field form-field--required">
        <label class="form-field__label">{{ t('common.username') }}</label>
        <el-input
          v-model="form.username"
          :placeholder="t('system.usernamePlaceholder')"
          maxlength="64"
          show-word-limit
        />
      </div>
      <div class="form-field">
        <label class="form-field__label">{{ t('system.fullName') }}</label>
        <el-input
          v-model="form.realName"
          :placeholder="t('system.fullNamePlaceholder')"
          maxlength="32"
        />
      </div>
      <div class="form-field">
        <label class="form-field__label">{{ t('system.email') }}</label>
        <el-input
          v-model="form.email"
          :placeholder="t('system.emailPlaceholder')"
          maxlength="128"
        />
      </div>
      <div class="form-field">
        <label class="form-field__label">{{ t('system.phone') }}</label>
        <el-input v-model="form.phone" :placeholder="t('system.phonePlaceholder')" maxlength="20" />
      </div>
      <div class="form-field">
        <label class="form-field__label">{{ t('system.gender') }}</label>
        <el-select v-model="form.sex" style="width: 100%">
          <el-option :label="t('common.unknown')" :value="0" />
          <el-option :label="t('common.male')" :value="1" />
          <el-option :label="t('common.female')" :value="2" />
        </el-select>
      </div>
      <div class="form-field">
        <label class="form-field__label">{{ t('common.status') }}</label>
        <el-select v-model="form.status" style="width: 100%">
          <el-option
            v-for="opt in userStatusOptions"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </div>
      <div class="form-field">
        <label class="form-field__label">{{ t('system.department') }}</label>
        <el-select v-model="form.deptId" :placeholder="t('system.selectDept')" style="width: 100%">
          <el-option
            v-for="dept in deptOptions"
            :key="dept.id"
            :label="dept.name"
            :value="dept.id ?? ''"
          />
        </el-select>
      </div>
      <div class="form-field">
        <label class="form-field__label">{{ t('system.postDeptShort') }}</label>
        <el-checkbox-group v-model="postIds">
          <div v-for="post in postOptions" :key="post.id" class="post-row">
            <el-checkbox :value="post.id">{{ post.name }}</el-checkbox>
            <el-select
              v-if="postIds.includes(post.id!)"
              v-model="postDeptMap[post.id!]"
              :placeholder="t('system.postDept')"
              clearable
              size="small"
              style="width: 200px"
            >
              <el-option
                v-for="dept in deptOptions"
                :key="dept.id"
                :label="dept.name"
                :value="dept.id ?? ''"
              />
            </el-select>
          </div>
        </el-checkbox-group>
      </div>
      <div class="form-field">
        <label class="form-field__label">{{ t('common.role') }}</label>
        <button
          v-if="roleIds.length === 0"
          type="button"
          class="role-picker role-picker--empty"
          @click="openRoleDialog"
        >
          <el-icon><Plus /></el-icon>
          <span>{{ t('system.configureRoles') }}</span>
        </button>
        <div v-else class="role-picker">
          <el-tag
            v-for="role in selectedRoles"
            :key="role.id"
            size="small"
            closable
            @close="removeRole(role.id!)"
          >
            {{ role.name }}
          </el-tag>
          <span v-if="selectedRoles.length < roleIds.length" class="role-picker__more">
            +{{ roleIds.length - selectedRoles.length }}
          </span>
          <button type="button" class="role-picker__add" @click="openRoleDialog">
            <el-icon><Plus /></el-icon>
            <span>{{ t('system.configureRoles') }}</span>
          </button>
        </div>
      </div>
      <div v-if="!editingId" class="form-field">
        <label class="form-field__label">{{ t('common.password') }}</label>
        <el-input
          v-model="form.plainPassword"
          type="password"
          :placeholder="t('system.passwordPlaceholder')"
          maxlength="64"
          show-password
        />
      </div>
    </div>
    <template #footer>
      <el-button @click="closeDialog">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">{{
        t('common.save')
      }}</el-button>
    </template>
  </el-dialog>

  <!-- 配置角色：只展示目标用户所属租户下的角色 -->
  <el-dialog
    v-model="roleDialogVisible"
    :title="t('system.configureRoles')"
    width="560px"
    append-to-body
    :close-on-click-modal="false"
    class="role-assign-dialog"
  >
    <div class="role-assign">
      <div class="role-assign__note">
        <el-icon><InfoFilled /></el-icon>
        <span>{{ roleDialogHint }}</span>
      </div>

      <div class="role-assign__toolbar">
        <el-input
          v-if="roleOptions.length > 5"
          v-model="roleKeyword"
          :placeholder="t('system.roleSearchPlaceholder')"
          clearable
          class="role-assign__search"
        >
          <template #prefix
            ><el-icon><Search /></el-icon
          ></template>
        </el-input>
        <span v-else class="role-assign__count">
          {{ t('system.roleTotal', { count: roleOptions.length }) }}
        </span>
        <div class="role-assign__bulk">
          <el-button
            link
            type="primary"
            :disabled="assignableRoles.length === 0"
            @click="selectAllRoles"
          >
            {{ t('system.roleSelectAll') }}
          </el-button>
          <el-button link :disabled="roleDraft.length === 0" @click="clearRoleDraft">
            {{ t('system.roleClearAll') }}
          </el-button>
        </div>
      </div>

      <div v-loading="roleOptionsLoading" class="role-assign__list">
        <el-empty
          v-if="!roleOptionsLoading && filteredRoleOptions.length === 0"
          :image-size="64"
          :description="
            roleOptions.length === 0 ? t('system.noRolesInTenant') : t('system.roleSearchEmpty')
          "
        />
        <el-checkbox-group v-else v-model="roleDraft" class="role-list">
          <el-checkbox
            v-for="role in filteredRoleOptions"
            :key="role.id"
            :value="role.id"
            :disabled="isRoleLocked(role)"
            class="role-row"
            :class="{ 'is-checked': roleDraft.includes(role.id!) }"
          >
            <span class="role-row__info">
              <span class="role-row__title">
                {{ role.name }}
                <el-tag v-if="role.builtIn" size="small" effect="plain">{{
                  t('system.roleBuiltIn')
                }}</el-tag>
                <el-tag v-if="role.status === 0" size="small" type="info">{{
                  t('common.statusDisabled')
                }}</el-tag>
              </span>
              <span class="role-row__code">{{ role.code }}</span>
            </span>
          </el-checkbox>
        </el-checkbox-group>
      </div>
    </div>

    <template #footer>
      <div class="role-assign__footer">
        <span class="role-assign__selected">{{
          t('system.roleSelectedCount', { count: roleDraft.length })
        }}</span>
        <div class="role-assign__footer-actions">
          <el-button @click="roleDialogVisible = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" @click="confirmRoleDialog">{{ t('common.confirm') }}</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
  <TenantTargetDialog
    :model-value="pickerVisible"
    @update:model-value="closePicker"
    @selected="selectTarget"
  />
  <DetailDialog
    v-model="protectedDetailsVisible"
    :title="t('tenantContext.userDetails')"
    appearance="design"
    width="760px"
  >
    <el-descriptions v-if="protectedDetails" :column="1" border>
      <el-descriptions-item :label="t('tenantContext.label')">{{
        protectedDetails.tenantName
      }}</el-descriptions-item>
      <el-descriptions-item :label="t('common.username')">{{
        protectedDetails.username
      }}</el-descriptions-item>
      <el-descriptions-item :label="t('system.fullName')">{{
        protectedDetails.realName
      }}</el-descriptions-item>
      <el-descriptions-item :label="t('system.email')">{{
        protectedDetails.email || '—'
      }}</el-descriptions-item>
      <el-descriptions-item :label="t('system.phone')">{{
        protectedDetails.phone || '—'
      }}</el-descriptions-item>
      <el-descriptions-item :label="t('common.status')">{{
        userStatusLabel(protectedDetails.status)
      }}</el-descriptions-item>
    </el-descriptions>
  </DetailDialog>
</template>

<style scoped>
.form-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-field__label {
  font-size: 14px;
  font-weight: var(--sw-font-weight-emphasis);
  line-height: 22px;
  color: var(--sw-text-regular);
}

.form-field--required .form-field__label::before {
  content: '* ';
  color: var(--sw-danger);
}

.role-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: var(--sw-control-height);
  padding: 5px 8px;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  box-sizing: border-box;
  background: var(--el-fill-color-blank);
  transition: border-color 0.2s;
}

.role-picker:hover {
  border-color: var(--el-color-primary);
}

.role-picker--empty {
  justify-content: flex-start;
  gap: 6px;
  border-style: dashed;
  color: var(--sw-text-secondary);
  font: inherit;
  font-size: var(--sw-font-body);
  cursor: pointer;
}

.role-picker--empty:hover {
  border-color: var(--el-color-primary);
  color: var(--el-color-primary);
}

.role-picker--empty .el-icon {
  font-size: 14px;
}

.role-picker__more {
  font-size: 12px;
  color: var(--sw-text-secondary);
}

.role-picker__add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--el-color-primary);
  font: inherit;
  font-size: var(--sw-font-body);
  cursor: pointer;
}

.role-picker__add:hover {
  color: var(--el-color-primary-light-3);
}

.role-assign {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.role-assign__note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
  color: var(--sw-text-secondary);
  font-size: 13px;
  line-height: 18px;
}

.role-assign__note .el-icon {
  flex: none;
  color: var(--el-color-primary);
  font-size: 15px;
}

.role-assign__toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 28px;
}

.role-assign__count {
  font-size: 13px;
  color: var(--sw-text-secondary);
}

.role-assign__search {
  max-width: 260px;
}

.role-assign__bulk {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}

.role-assign__bulk .el-button + .el-button {
  margin-left: 0;
}

.role-assign__list {
  min-height: 120px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 2px;
}

.role-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.role-row {
  display: flex;
  width: 100%;
  height: auto;
  margin: 0;
  padding: 9px 12px;
  border: 1px solid var(--sw-border-lighter);
  border-radius: var(--sw-radius-base);
  box-sizing: border-box;
  white-space: normal;
  transition:
    border-color 0.15s,
    background-color 0.15s;
}

.role-row:hover {
  border-color: var(--el-color-primary-light-7);
  background: var(--sw-fill-base);
}

.role-row.is-checked {
  border-color: var(--el-color-primary-light-5);
  background: var(--sw-color-primary-softer);
}

.role-row.is-disabled {
  background: var(--sw-fill-base);
}

.role-row :deep(.el-checkbox__input) {
  margin-top: 1px;
}

/* 全局 checkbox 为 28px（Owner 放大要求），角色行内用 20px 保持列表密度 */
.role-row :deep(.el-checkbox__inner) {
  width: 20px !important;
  height: 20px !important;
  border-radius: 5px;
}

.role-row :deep(.el-checkbox__inner::after) {
  top: 2px;
  left: 6px;
  width: 4px !important;
  height: 9px !important;
}

.role-row :deep(.el-checkbox__label) {
  display: flex;
  flex: 1;
  min-width: 0;
  margin-left: 8px;
  padding-left: 0;
  line-height: normal;
}

.role-row__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-width: 0;
}

.role-row__title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--sw-text-primary);
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
}

.role-row__code {
  color: var(--sw-text-secondary);
  font-size: 12px;
  line-height: 16px;
}

.role-row__title .el-tag {
  height: 18px;
  padding: 0 5px;
  border-radius: 4px;
  font-size: 11px;
}

.role-assign__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.role-assign__selected {
  color: var(--sw-text-secondary);
  font-size: 13px;
}

.role-assign__footer-actions {
  display: flex;
  gap: 8px;
}

.role-assign__footer-actions .el-button + .el-button {
  margin-left: 0;
}
</style>

<style scoped>
.tenant-owner-field {
  grid-column: 1 / -1;
}
</style>

<style scoped>
:global(.system-user-editor.el-dialog) {
  max-width: calc(100vw - 32px);
}
:global(.system-user-editor .el-dialog__body) {
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}
</style>
