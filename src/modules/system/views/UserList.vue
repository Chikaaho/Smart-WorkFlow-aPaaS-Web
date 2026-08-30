<script setup lang="ts">
/**
 * UserList — 用户管理列表页（页型B）。
 *
 * 使用 StandardListTemplate 槽位模板，数据外部进。
 * 筛选：username / status；操作：新建 / 编辑 / 删除。
 * 新建/编辑走 el-dialog 内嵌 StandardFormTemplate + 手写控件（高代码轨）。
 * 密码字段仅在新建模式显示（v-if="!editingId"）。
 */
import { ref, reactive, onMounted, computed } from 'vue'
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
import type { SysUser, UserFormRequest, UserFilter } from '@/modules/system/types/user'
import type { PageQuery } from '@/contracts/common'
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
} from '@/components/page-layout'

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
      errorMsg.value = '加载用户列表失败'
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
const postIds = ref<string[]>([])
const deptOptions = ref<SysDept[]>([])

async function loadRoleOptions() {
  try {
    const result = await pageRoles({ pageNum: 1, pageSize: 200 }, {})
    roleOptions.value = result.list
  } catch {
    roleOptions.value = []
  }
  try {
    const result = await pagePosts({ pageNum: 1, pageSize: 200 }, {})
    postOptions.value = result.list.filter((item) => item.status === undefined || item.status === 1)
  } catch {
    postOptions.value = []
  }
  try {
    deptOptions.value = await listDeptTree()
  } catch {
    deptOptions.value = []
  }
}

// ─── 弹窗状态 ───

const dialogVisible = ref(false)
const dialogTitle = computed(() => (editingId.value ? '编辑用户' : '新建用户'))
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
    postIds.value = await getUserPosts(row.id!)
    // 编辑模式不设置 plainPassword
  } catch {
    formError.value = '加载用户详情失败'
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
    formError.value = '用户名不能为空'
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
      await updateUserPosts(editingId.value, postIds.value)
      ElMessage.success('更新成功')
    } else {
      const id = await createUser({ ...form })
      await updateUserRoles(id, roleIds.value)
      await updateUserPosts(id, postIds.value)
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

async function handleDelete(row: SysUser) {
  try {
    await ElMessageBox.confirm(`确定要删除用户"${row.username}"吗？删除后不可恢复。`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }
  try {
    await deleteUser(row.id!)
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

// el-table row slot 的 DefaultRow 类型不与 SysUser 兼容，通过包装函数桥接。
function editRow(r: unknown) {
  openEdit(r as SysUser)
}
function deleteRow(r: unknown) {
  handleDelete(r as SysUser)
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="用户管理"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：新建按钮 -->
    <template #toolbar-actions>
      <el-button type="primary" @click="openCreate">新建用户</el-button>
    </template>

    <!-- 筛选区 -->
    <template #filter>
      <el-input
        v-model="filter.username"
        placeholder="用户名"
        clearable
        style="width: 180px"
        @keyup.enter="handleQuery"
      />
      <el-select v-model="filter.status" placeholder="状态" clearable style="width: 120px">
        <el-option
          v-for="opt in userStatusOptions"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
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
      <el-table-column prop="username" label="用户名" min-width="120" />
      <el-table-column prop="realName" label="姓名" min-width="100" />
      <el-table-column prop="email" label="邮箱" min-width="160" show-overflow-tooltip />
      <el-table-column prop="phone" label="手机号" width="130" />
      <el-table-column prop="sex" label="性别" width="70">
        <template #default="{ row }">
          {{ row.sex === 1 ? '男' : row.sex === 2 ? '女' : '未知' }}
        </template>
      </el-table-column>
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="userStatusTagType(row.status)" size="small">
            {{ userStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="editRow(row)">编辑</el-button>
          <el-button size="small" link type="danger" @click="deleteRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button type="primary" @click="openCreate">新建用户</el-button>
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
            <label class="form-field__label">用户名</label>
            <el-input
              v-model="form.username"
              placeholder="请输入用户名"
              maxlength="64"
              show-word-limit
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">姓名</label>
            <el-input v-model="form.realName" placeholder="请输入姓名" maxlength="32" />
          </div>
          <div class="form-field">
            <label class="form-field__label">邮箱</label>
            <el-input v-model="form.email" placeholder="请输入邮箱" maxlength="128" />
          </div>
          <div class="form-field">
            <label class="form-field__label">手机号</label>
            <el-input v-model="form.phone" placeholder="请输入手机号" maxlength="20" />
          </div>
          <div class="form-field">
            <label class="form-field__label">性别</label>
            <el-select v-model="form.sex" style="width: 100%">
              <el-option label="未知" :value="0" />
              <el-option label="男" :value="1" />
              <el-option label="女" :value="2" />
            </el-select>
          </div>
          <div class="form-field">
            <label class="form-field__label">状态</label>
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
            <label class="form-field__label">所属部门</label>
            <el-select v-model="form.deptId" placeholder="请选择部门" style="width: 100%">
              <el-option
                v-for="dept in deptOptions"
                :key="dept.id"
                :label="dept.name"
                :value="dept.id ?? ''"
              />
            </el-select>
          </div>
          <div class="form-field">
            <label class="form-field__label">岗位</label>
            <el-checkbox-group v-model="postIds">
              <el-checkbox v-for="post in postOptions" :key="post.id" :value="post.id">{{
                post.name
              }}</el-checkbox>
            </el-checkbox-group>
          </div>
          <div class="form-field">
            <label class="form-field__label">角色</label>
            <el-checkbox-group v-model="roleIds">
              <el-checkbox v-for="role in roleOptions" :key="role.id" :value="role.id">
                {{ role.name }}
              </el-checkbox>
            </el-checkbox-group>
          </div>
          <div v-if="!editingId" class="form-field">
            <label class="form-field__label">密码</label>
            <el-input
              v-model="form.plainPassword"
              type="password"
              placeholder="请输入密码"
              maxlength="64"
              show-password
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
