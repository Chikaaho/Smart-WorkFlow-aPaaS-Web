<script setup lang="ts">
/**
 * UserGroupList — 用户组管理列表页（D112：P28/I36）。
 *
 * 使用 StandardListTemplate 槽位模板，数据外部进。
 * 筛选：业务标识 / 名称 / 状态；操作：新建 / 编辑 / 启停 / 删除。
 * 新建/编辑走 el-dialog 内嵌 StandardFormTemplate + 手写控件（高代码轨）。
 * 成员选择：候选用户多选（仅启用用户 + 数据范围），保存时整量替换；详情回填。
 * 失效成员展示：详情回显时展示全部（含停用用户）并标记不可用。
 * 权限：查看 system:userGroup:list，管理 system:userGroup:manage（后端强制，前端 hasPerm 仅 UX）。
 */
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { usePermission } from '@/foundation/permission'
import {
  pageUserGroups,
  getUserGroup,
  createUserGroup,
  updateUserGroup,
  deleteUserGroup,
  disableUserGroup,
  enableUserGroup,
  getUserGroupMembers,
  updateUserGroupMembers,
  getUserGroupCandidates,
} from '@/modules/system/api/userGroup'
import type {
  SysUserGroup,
  UserGroupFormRequest,
  UserGroupFilter,
} from '@/modules/system/types/userGroup'
import type { SysUser } from '@/modules/system/types/user'
import type { PageQuery } from '@/contracts/common'
import {
  StandardListTemplate,
  StandardFormTemplate,
  FormSection,
  FormGrid,
} from '@/components/page-layout'

// ─── 权限 ──────────────────────────────────────────────

const { hasPerm } = usePermission()
const canManage = computed(() => hasPerm('system:userGroup:manage'))

// ─── 列表状态 ──────────────────────────────────────────

const list = ref<SysUserGroup[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const filter = reactive<UserGroupFilter>({
  groupCode: '',
  groupName: '',
  status: undefined,
})

const currentFilter = reactive<UserGroupFilter>({ ...filter })

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageUserGroups(pageQuery, currentFilter)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = '加载用户组列表失败'
    }
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  Object.assign(currentFilter, {
    groupCode: filter.groupCode || undefined,
    groupName: filter.groupName || undefined,
    status: filter.status,
  })
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.groupCode = ''
  filter.groupName = ''
  filter.status = undefined
  currentFilter.groupCode = undefined
  currentFilter.groupName = undefined
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

// ─── 成员候选（仅启用用户 + 数据范围） ──────────────────

const candidateOptions = ref<SysUser[]>([])

async function loadCandidates() {
  try {
    const result = await getUserGroupCandidates({ pageNum: 1, pageSize: 200 })
    candidateOptions.value = result.list
  } catch {
    candidateOptions.value = []
  }
}

// ─── 弹窗状态 ──────────────────────────────────────────

const dialogVisible = ref(false)
const dialogTitle = computed(() => (editingId.value ? '编辑用户组' : '新建用户组'))
const editingId = ref<string | null>(null)
const submitting = ref(false)
const formError = ref('')

const form = reactive<UserGroupFormRequest>({
  groupCode: '',
  groupName: '',
  status: 0,
  remark: '',
})

/** 勾选中的成员用户 ID（string 集合） */
const memberIds = ref<string[]>([])

/** 失效成员（停用/锁定/逻辑删除）回显：详情里存在但不在候选中的用户 */
const staleMembers = ref<SysUser[]>([])

function resetForm() {
  form.groupCode = ''
  form.groupName = ''
  form.status = 0
  form.remark = ''
  editingId.value = null
  formError.value = ''
  memberIds.value = []
  staleMembers.value = []
}

function openCreate() {
  resetForm()
  void loadCandidates()
  dialogVisible.value = true
}

async function openEdit(row: SysUserGroup) {
  resetForm()
  editingId.value = row.id ?? null
  try {
    const detail = await getUserGroup(row.id!)
    form.groupCode = detail.groupCode
    form.groupName = detail.groupName
    form.status = detail.status ?? 0
    form.remark = detail.remark ?? ''
    const members = await getUserGroupMembers(row.id!)
    memberIds.value = [...members]
    // 失效成员回显：仅当详情成员不在候选（启用可见）中时标记为失效展示
    staleMembers.value = []
    if (members.length > 0) {
      const visible = new Set(candidateOptions.value.map((u) => u.id))
      for (const uid of members) {
        if (!visible.has(uid)) {
          const cand = candidateOptions.value.find((u) => u.id === uid)
          staleMembers.value.push(
            cand ?? { id: uid, username: `用户#${uid}`, realName: '（已停用或不可见）', status: 1 },
          )
        }
      }
    }
  } catch {
    formError.value = '加载用户组详情失败'
    return
  }
  dialogVisible.value = true
  await loadCandidates()
}

function closeDialog() {
  dialogVisible.value = false
}

async function handleSubmit() {
  if (!form.groupCode.trim()) {
    formError.value = '业务标识不能为空'
    return
  }
  if (!form.groupName.trim()) {
    formError.value = '组名称不能为空'
    return
  }

  submitting.value = true
  formError.value = ''
  try {
    if (editingId.value) {
      await updateUserGroup({ ...form, id: editingId.value })
      // 成员走整量替换端点（与主记录解耦但保持事务一致）
      await updateUserGroupMembers(editingId.value, memberIds.value)
      ElMessage.success('更新成功')
    } else {
      await createUserGroup({ ...form, memberIds: memberIds.value })
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

async function handleToggleStatus(row: SysUserGroup) {
  const id = row.id!
  try {
    if (row.status === 1) {
      await enableUserGroup(id)
      ElMessage.success('已启用')
    } else {
      await disableUserGroup(id)
      ElMessage.success('已停用（保留配置与成员）')
    }
    void loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      ElMessage.error(err.msg)
    } else {
      ElMessage.error('操作失败')
    }
  }
}

async function handleDelete(row: SysUserGroup) {
  try {
    await ElMessageBox.confirm(
      `确定要删除用户组"${row.groupName}"吗？删除后成员关系一并移除。`,
      '删除确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return // 用户取消
  }
  try {
    await deleteUserGroup(row.id!)
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

// el-table row slot 的 DefaultRow 类型不与 SysUserGroup 兼容，通过包装函数桥接。
function editRow(r: unknown) {
  openEdit(r as SysUserGroup)
}
function deleteRow(r: unknown) {
  handleDelete(r as SysUserGroup)
}
function toggleRow(r: unknown) {
  handleToggleStatus(r as SysUserGroup)
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="用户组管理"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：新建按钮（管理权限） -->
    <template #toolbar-actions>
      <el-button v-if="canManage" type="primary" @click="openCreate">新建用户组</el-button>
    </template>

    <!-- 筛选区 -->
    <template #filter>
      <el-input
        v-model="filter.groupCode"
        placeholder="业务标识"
        clearable
        style="width: 140px"
        @keyup.enter="handleQuery"
      />
      <el-input
        v-model="filter.groupName"
        placeholder="组名称"
        clearable
        style="width: 160px"
        @keyup.enter="handleQuery"
      />
      <el-select v-model="filter.status" placeholder="状态" clearable style="width: 120px">
        <el-option label="启用" :value="0" />
        <el-option label="停用" :value="1" />
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
      <el-table-column prop="groupCode" label="业务标识" min-width="110" />
      <el-table-column prop="groupName" label="组名称" min-width="140" />
      <el-table-column prop="remark" label="说明" min-width="180" show-overflow-tooltip />
      <el-table-column prop="status" label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'info' : 'success'" size="small">
            {{ row.status === 1 ? '停用' : '启用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="editRow(row)">编辑</el-button>
          <el-button v-if="canManage" size="small" link type="warning" @click="toggleRow(row)">
            {{ row.status === 1 ? '启用' : '停用' }}
          </el-button>
          <el-button v-if="canManage" size="small" link type="danger" @click="deleteRow(row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button v-if="canManage" type="primary" @click="openCreate">新建用户组</el-button>
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
            <label class="form-field__label">业务标识</label>
            <el-input
              v-model="form.groupCode"
              placeholder="请输入业务标识，租户内唯一"
              :disabled="!!editingId"
              maxlength="64"
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">组名称</label>
            <el-input v-model="form.groupName" placeholder="请输入组名称" maxlength="64" />
          </div>
          <div class="form-field">
            <label class="form-field__label">状态</label>
            <el-select v-model="form.status" style="width: 100%">
              <el-option label="启用" :value="0" />
              <el-option label="停用" :value="1" />
            </el-select>
          </div>
          <div class="form-field">
            <label class="form-field__label">说明</label>
            <el-input v-model="form.remark" placeholder="请输入说明" maxlength="255" />
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="成员">
        <div class="member-hint">
          仅展示数据范围内且启用的用户；停用/不可见成员在回显时单独标记。
        </div>
        <el-checkbox-group v-model="memberIds">
          <el-checkbox v-for="user in candidateOptions" :key="user.id" :value="user.id">
            {{ user.realName || user.username }}（{{ user.username }}）
          </el-checkbox>
        </el-checkbox-group>
        <div v-if="staleMembers.length" class="stale-members">
          <el-tag v-for="u in staleMembers" :key="u.id" type="info" size="small" class="stale-tag">
            {{ u.realName || u.username }}（已停用或不可见）
          </el-tag>
        </div>
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

.member-hint {
  font-size: var(--sw-font-body);
  color: var(--sw-text-secondary);
  margin-bottom: var(--sw-space-8);
}

.stale-members {
  margin-top: var(--sw-space-8);
}

.stale-tag {
  margin-right: var(--sw-space-8);
  margin-bottom: var(--sw-space-4);
}
</style>
