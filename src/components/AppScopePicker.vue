<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from '@/locales'
import UserRemoteSelect from '@/components/UserRemoteSelect.vue'
import { listDeptTree } from '@/modules/system/api/dept'
import { pageRoles } from '@/modules/system/api/role'
import { pagePosts } from '@/modules/system/api/post'
import { listTenantOptions } from '@/modules/form/api/app-center'
import type { SysDept } from '@/modules/system/types/dept'
import type { SysRole } from '@/modules/system/types/role'
import type { SysPost } from '@/modules/system/types/post'

/**
 * 应用可见范围多维度选择器（0.1.7 #1）。
 *
 * 维度：用户 / 部门 / 角色 / 岗位 / 租户，任一维度命中即可见；
 * 部门按主属部门命中、角色按 code、岗位按 sys_user_post、租户整租户可见。
 * 本组件只负责候选装载与选择交互，判定全部在服务端（FormAppScopeMatcher）。
 * 候选装载失败（如缺系统查看权限）时该维度候选为空，不影响其它维度保存。
 */
export interface AppScopeValue {
  userIds: Array<number | string>
  deptIds: number[]
  roleCodes: string[]
  postIds: number[]
  tenantIds: number[]
}

const props = defineProps<{ modelValue: AppScopeValue }>()
const emit = defineEmits<{ 'update:modelValue': [value: AppScopeValue] }>()

const { t } = useI18n()

const activeTab = ref('user')
const scope = computed(() => props.modelValue)

function patch(part: Partial<AppScopeValue>) {
  emit('update:modelValue', { ...props.modelValue, ...part })
}

/** 部门树（el-tree-select 数据：value 用数值 id 与契约对齐）。 */
interface DeptTreeNode {
  value: number
  label: string
  children?: DeptTreeNode[]
}

function toTree(nodes: SysDept[]): DeptTreeNode[] {
  const idNum = (raw: string | number | undefined): number => Number(raw ?? 0)
  const byParent = new Map<string, DeptTreeNode[]>()
  for (const dept of nodes) {
    const node: DeptTreeNode = { value: idNum(dept.id), label: dept.name }
    const key = String(dept.parentId ?? '0')
    byParent.set(key, [...(byParent.get(key) ?? []), node])
  }
  const attach = (parentKey: string): DeptTreeNode[] =>
    (byParent.get(parentKey) ?? []).map((node) => ({
      ...node,
      children: attach(String(node.value)),
    }))
  const roots = attach('0')
  // 兜底：parent 不在结果集中的节点挂到根（tree 端点只回命中节点+祖先）
  const linked = new Set<string>()
  const walk = (list: DeptTreeNode[]) => {
    for (const node of list) {
      linked.add(String(node.value))
      walk(node.children ?? [])
    }
  }
  walk(roots)
  for (const [parentKey, children] of byParent) {
    if (parentKey === '0') continue
    if (!linked.has(parentKey)) roots.push(...children)
  }
  return roots
}

const deptTree = ref<DeptTreeNode[]>([])
const roleOptions = ref<SysRole[]>([])
const postOptions = ref<SysPost[]>([])
const tenantOptions = ref<{ id: number; name: string }[]>([])

onMounted(async () => {
  void listDeptTree()
    .then((depts) => {
      deptTree.value = toTree(depts)
    })
    .catch(() => {
      deptTree.value = []
    })
  void pageRoles({ pageNum: 1, pageSize: 200 }, {})
    .then((page) => {
      roleOptions.value = page.list
    })
    .catch(() => {
      roleOptions.value = []
    })
  void pagePosts({ pageNum: 1, pageSize: 200 }, {})
    .then((page) => {
      postOptions.value = page.list
    })
    .catch(() => {
      postOptions.value = []
    })
  void listTenantOptions()
    .then((items) => {
      tenantOptions.value = items
    })
    .catch(() => {
      tenantOptions.value = []
    })
})

const scopeEmpty = computed(
  () =>
    scope.value.userIds.length === 0 &&
    scope.value.deptIds.length === 0 &&
    scope.value.roleCodes.length === 0 &&
    scope.value.postIds.length === 0 &&
    scope.value.tenantIds.length === 0,
)
</script>

<template>
  <div class="app-scope-picker">
    <el-tabs v-model="activeTab">
      <el-tab-pane :label="t('form.appCenter.scopeDimUser')" name="user">
        <UserRemoteSelect
          :model-value="scope.userIds"
          multiple
          @update:model-value="
            (v: string | string[] | null) => patch({ userIds: Array.isArray(v) ? v : [] })
          "
        />
      </el-tab-pane>
      <el-tab-pane :label="t('form.appCenter.scopeDimDept')" name="dept">
        <el-tree-select
          :model-value="scope.deptIds"
          :data="deptTree"
          multiple
          check-strictly
          clearable
          filterable
          style="width: 100%"
          @update:model-value="(v: number[]) => patch({ deptIds: v ?? [] })"
        />
      </el-tab-pane>
      <el-tab-pane :label="t('form.appCenter.scopeDimRole')" name="role">
        <el-select
          :model-value="scope.roleCodes"
          multiple
          clearable
          filterable
          style="width: 100%"
          @update:model-value="(v: string[]) => patch({ roleCodes: v ?? [] })"
        >
          <el-option v-for="r in roleOptions" :key="r.code" :label="r.name" :value="r.code" />
        </el-select>
      </el-tab-pane>
      <el-tab-pane :label="t('form.appCenter.scopeDimPost')" name="post">
        <el-select
          :model-value="scope.postIds"
          multiple
          clearable
          filterable
          style="width: 100%"
          @update:model-value="(v: number[]) => patch({ postIds: v ?? [] })"
        >
          <el-option
            v-for="p in postOptions"
            :key="String(p.id)"
            :label="p.name"
            :value="Number(p.id)"
          />
        </el-select>
      </el-tab-pane>
      <el-tab-pane :label="t('form.appCenter.scopeDimTenant')" name="tenant">
        <el-select
          :model-value="scope.tenantIds"
          multiple
          clearable
          filterable
          style="width: 100%"
          @update:model-value="(v: number[]) => patch({ tenantIds: v ?? [] })"
        >
          <el-option v-for="op in tenantOptions" :key="op.id" :label="op.name" :value="op.id" />
        </el-select>
      </el-tab-pane>
    </el-tabs>
    <div v-if="scopeEmpty" class="app-scope-picker__hint">
      {{ t('form.appCenter.scopeEmptyHint') }}
    </div>
  </div>
</template>

<style scoped>
.app-scope-picker__hint {
  margin-top: 6px;
  font-size: 12px;
  color: #e6a23c;
}
</style>
