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
  updateUserRoles,
  getUserPosts,
  updateUserPosts,
} from '@/modules/system/api/user'
import { pageRoles } from '@/modules/system/api/role'
import { listDeptTree } from '@/modules/system/api/dept'
import { pagePosts } from '@/modules/system/api/post'
import type { SysRole } from '@/modules/system/types/role'
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
import {
  SYS_USER_STATUS,
  userStatusOptions,
  userStatusTagType,
  userStatusLabel,
} from '@/modules/system/constants'
import {
  StandardListTemplate,
  StandardFormTemplate,
  FormSection,
  FormGrid,
  ListActionsColumn,
} from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'

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
  Object.assign(currentFilter, {
    username: filter.username || undefined,
    status: filter.status,
  })
  pageNum.value = 1
  void loadList()
}

function handleReset() {
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
const roleOptions = ref<SysRole[]>([])
const roleIds = ref<string[]>([])
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

async function loadRoleOptions() {
  try {
    const result = await pageRoles({ pageNum: 1, pageSize: 200 }, {})
    roleOptions.value = result.list
  } catch {
    ElMessage.error(t('common.loadFailed'))
    // R2b：请求层只抛 ApiError、不做全局提示，catch 不说话用户就什么都看不到
    roleOptions.value = []
  }
  try {
    const result = await pagePosts({ pageNum: 1, pageSize: 200 }, {})
    postOptions.value = result.list.filter((item) => item.status === undefined || item.status === 1)
  } catch {
    ElMessage.error(t('common.loadFailed'))
    postOptions.value = []
  }
  try {
    deptOptions.value = await listDeptTree()
  } catch {
    ElMessage.error(t('common.loadFailed'))
    deptOptions.value = []
  }
}

// ─── 弹窗状态 ───

const dialogVisible = ref(false)
const dialogTitle = computed(() => (editingId.value ? t('system.editUser') : t('system.newUser')))
const editingId = ref<string | null>(null)
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
  postIds.value = []
  Object.keys(postDeptMap).forEach((key) => delete postDeptMap[key])
}

function openCreate() {
  resetForm()
  void loadRoleOptions()
  dialogVisible.value = true
}

async function openEdit(row: SysUser) {
  resetForm()
  editingId.value = row.id ?? null
  try {
    const detail = await getUser(row.id!)
    form.username = detail.username
    form.realName = detail.realName ?? ''
    form.email = detail.email ?? ''
    form.phone = detail.phone ?? ''
    form.sex = detail.sex ?? 0
    form.status = detail.status
    form.deptId = detail.deptId ?? ''
    roleIds.value = await getUserRoles(row.id!)
    const associations = await getUserPosts(row.id!)
    postIds.value = associations.map((item) => item.postId)
    associations.forEach((item) => {
      if (item.deptId) postDeptMap[item.postId] = item.deptId
    })
    // 编辑模式不设置 plainPassword
  } catch {
    formError.value = t('system.userDetailLoadFailed')
    return
  }
  dialogVisible.value = true
  await loadRoleOptions()
}

function closeDialog() {
  dialogVisible.value = false
}

async function handleSubmit() {
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
      await updateUser({ ...updateData, id: editingId.value })
      await updateUserRoles(editingId.value, roleIds.value)
      await updateUserPosts(editingId.value, toPostPayload())
      ElMessage.success(t('common.updateSuccess'))
    } else {
      const id = await createUser({ ...form })
      await updateUserRoles(id, roleIds.value)
      await updateUserPosts(id, toPostPayload())
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
      <el-input
        v-model="filter.username"
        :placeholder="t('common.username')"
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
        <el-option
          v-for="opt in userStatusOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
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
          <el-tag :type="userStatusTagType(row.status)" size="small">
            {{ userStatusLabel(row.status) }}
          </el-tag>
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
            <el-input
              v-model="form.phone"
              :placeholder="t('system.phonePlaceholder')"
              maxlength="20"
            />
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
            <el-select
              v-model="form.deptId"
              :placeholder="t('system.selectDept')"
              style="width: 100%"
            >
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
            <el-checkbox-group v-model="roleIds">
              <el-checkbox v-for="role in roleOptions" :key="role.id" :value="role.id">
                {{ role.name }}
              </el-checkbox>
            </el-checkbox-group>
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
