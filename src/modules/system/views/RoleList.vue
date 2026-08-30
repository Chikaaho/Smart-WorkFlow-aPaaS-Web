<script setup lang="ts">
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
} from '@/modules/system/api/role'
import { loadMenu } from '@/foundation/menu'
import type { MenuNode } from '@/contracts/menu'
import { listDeptTree } from '@/modules/system/api/dept'
import type { SysRole, RoleFilter } from '@/modules/system/types/role'
import type { SysDept } from '@/modules/system/types/dept'
import type { PageQuery } from '@/contracts/common'
import {
  StandardListTemplate,
  StandardFormTemplate,
  FormSection,
  FormGrid,
} from '@/components/page-layout'

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
      errorMsg.value = '加载角色列表失败'
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
  { label: '全部', value: 0 },
  { label: '本部门', value: 1 },
  { label: '本部门及以下', value: 2 },
  { label: '仅本人', value: 3 },
  { label: '自定义部门', value: 4 },
] as const
const DATA_SCOPE_CUSTOM = 4
const DATA_SCOPE_DEFAULT = 1

const deptTree = ref<SysDept[]>([])
const deptTreeError = ref('')
const deptTreeRef = ref<TreeInstance | null>(null)
const permissionTreeRef = ref<TreeInstance | null>(null)
const permissionTree = ref<MenuNode[]>([])
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
    deptTreeError.value = '加载部门树失败'
  }
}

async function loadPermissionTree() {
  try {
    permissionTree.value = await loadMenu()
  } catch {
    permissionTree.value = []
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

const dialogVisible = ref(false)
const dialogTitle = computed(() => (editingId.value ? '编辑角色' : '新建角色'))
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
    formError.value = '加载角色详情失败'
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
    formError.value = '角色名称不能为空'
    return
  }
  if (!form.code.trim()) {
    formError.value = '角色编码不能为空'
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
      ElMessage.success('更新成功')
    } else {
      const id = await createRole(data)
      await updateRoleMenus(id, permissionIds.value)
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
    await ElMessageBox.confirm(`确定要删除角色"${row.name}"吗？删除后不可恢复。`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return // 用户取消
  }
  try {
    await deleteRole(row.id!)
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

// el-table row slot 的 DefaultRow 类型不与 SysRole 兼容，通过包装函数桥接。
function editRow(r: unknown) {
  openEdit(r as SysRole)
}
function deleteRow(r: unknown) {
  handleDelete(r as SysRole)
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="角色管理"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：新建按钮 -->
    <template #toolbar-actions>
      <el-button type="primary" @click="openCreate">新建角色</el-button>
    </template>

    <!-- 筛选区 -->
    <template #filter>
      <el-input
        v-model="filter.name"
        placeholder="角色名称"
        clearable
        style="width: 180px"
        @keyup.enter="handleQuery"
      />
      <el-input
        v-model="filter.code"
        placeholder="角色编码"
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
      <el-table-column prop="name" label="角色名称" min-width="140" />
      <el-table-column prop="code" label="角色编码" min-width="120" />
      <el-table-column prop="sort" label="排序" width="70" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'" size="small">
            {{ row.status === 1 ? '正常' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="builtIn" label="内置" width="70">
        <template #default="{ row }">
          <el-tag :type="row.builtIn ? 'danger' : 'info'" size="small">
            {{ row.builtIn ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button
            size="small"
            link
            type="primary"
            :disabled="!canEditRole(row)"
            @click="editRow(row)"
            >编辑</el-button
          >
          <el-button
            size="small"
            link
            type="danger"
            :disabled="!canEditRole(row)"
            @click="deleteRow(row)"
            >删除</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button type="primary" @click="openCreate">新建角色</el-button>
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
            <label class="form-field__label">角色名称</label>
            <el-input
              v-model="form.name"
              placeholder="请输入角色名称"
              maxlength="64"
              show-word-limit
            />
          </div>
          <div class="form-field form-field--required">
            <label class="form-field__label">角色编码</label>
            <el-input
              v-model="form.code"
              placeholder="请输入角色编码"
              :disabled="!!editingId || isProtectedRole"
              maxlength="64"
              show-word-limit
            />
          </div>
          <div class="form-field">
            <label class="form-field__label">排序</label>
            <el-input-number v-model="form.sort" :min="0" :max="9999" style="width: 100%" />
          </div>
          <div class="form-field">
            <label class="form-field__label">状态</label>
            <el-select v-model="form.status" style="width: 100%" :disabled="isProtectedRole">
              <el-option label="正常" :value="1" />
              <el-option label="停用" :value="0" />
            </el-select>
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

      <FormSection title="数据权限">
        <FormGrid :columns="1">
          <div class="form-field">
            <label class="form-field__label">数据范围</label>
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
            <label class="form-field__label">自定义部门</label>
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
            <div v-else class="dept-tree-box dept-tree-box--tip">暂无部门数据</div>
          </div>
        </FormGrid>
      </FormSection>

      <FormSection title="菜单与按钮权限">
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
        <el-button @click="closeDialog">取消</el-button>
        <el-button
          v-if="!isProtectedRole"
          type="primary"
          :loading="submitting"
          @click="handleSubmit"
          >保存</el-button
        >
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
