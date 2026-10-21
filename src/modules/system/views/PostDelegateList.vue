<script setup lang="ts">
/**
 * PostDelegateList — 岗位委托管理页（P64 阶段Ⅱ A07，后台组织域通用配置）。
 *
 * 维护「源岗位 → 受托岗位」关系：适用范围 ORG（组织默认）/ DEPT（精确部门，优先于 ORG）；
 * 启停即生效/失效（已冻结的运行名单沿参与人快照不受影响）。
 * 自委托/循环/跨租户/越权/同优先级重叠由服务端拒绝并透出可诊断消息。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from '@/locales'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { hasPerm } from '@/foundation/permission'
import { pagePosts } from '@/modules/system/api/post'
import { listDeptTree } from '@/modules/system/api/dept'
import {
  pagePostDelegates,
  createPostDelegate,
  updatePostDelegate,
  changePostDelegateStatus,
  deletePostDelegate,
} from '@/modules/system/api/post-delegate'
import type { PostDelegateRow } from '@/contracts/p64'
import type { SysPost } from '@/modules/system/types/post'
import type { SysDept } from '@/modules/system/types/dept'
import { StandardListTemplate, ListActionsColumn, ListFilterItem } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'

const { t } = useI18n()

interface DeptFlat {
  id: string
  name: string
}

const loading = ref(false)
const rows = ref<PostDelegateRow[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const posts = ref<SysPost[]>([])
const depts = ref<DeptFlat[]>([])

const filter = reactive({ status: '', scopeType: '' })
const currentFilter = reactive<{ status?: string; scopeType?: string }>({})

const dialogVisible = ref(false)
const saving = ref(false)
const editingId = ref<number | string | null>(null)
const form = reactive<{
  sourcePostId: string | number | null
  targetPostId: string | number | null
  scopeType: 'ORG' | 'DEPT'
  deptId: string | null
  remark: string
}>({
  sourcePostId: null,
  targetPostId: null,
  scopeType: 'ORG',
  deptId: null,
  remark: '',
})

const isEmpty = computed(() => !loading.value && rows.value.length === 0)

function postName(id?: string | number | null): string {
  if (id == null) return '—'
  const post = posts.value.find((item) => item.id === id)
  return post ? `${post.name ?? ''}（${post.code ?? ''}）` : String(id)
}

function deptName(id?: string | number | null): string {
  if (id == null) return '—'
  const dept = depts.value.find((item) => item.id === id)
  return dept ? dept.name : String(id)
}

function flattenDepts(nodes: SysDept[], sink: DeptFlat[]) {
  for (const node of nodes) {
    if (node.id != null) {
      sink.push({ id: String(node.id), name: node.name ?? String(node.id) })
    }
    if (node.children && node.children.length > 0) {
      flattenDepts(node.children, sink)
    }
  }
}

async function loadOptions() {
  try {
    const page = await pagePosts({ pageNum: 1, pageSize: 200 }, { status: 1 })
    posts.value = page.list
  } catch {
    posts.value = []
  }
  try {
    const tree = await listDeptTree()
    const sink: DeptFlat[] = []
    flattenDepts(Array.isArray(tree) ? tree : [], sink)
    depts.value = sink
  } catch {
    depts.value = []
  }
}

async function loadList() {
  loading.value = true
  try {
    const page = await pagePostDelegates(pageNum.value, pageSize.value, currentFilter)
    rows.value = page.list
    // 后端 Long → JSON string：统一转 number，分页条才不会被判为缺省
    total.value = Number(page.total) || 0
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('system.postDelegateLoadFailed'))
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  currentFilter.status = filter.status || undefined
  currentFilter.scopeType = filter.scopeType || undefined
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.status = ''
  filter.scopeType = ''
  currentFilter.status = undefined
  currentFilter.scopeType = undefined
  pageNum.value = 1
  void loadList()
}

function handlePageNumChange(page: number) {
  pageNum.value = page
  void loadList()
}

function handlePageSizeChange(size: number) {
  pageSize.value = size
  pageNum.value = 1
  void loadList()
}

function openCreate() {
  editingId.value = null
  form.sourcePostId = null
  form.targetPostId = null
  form.scopeType = 'ORG'
  form.deptId = null
  form.remark = ''
  dialogVisible.value = true
}

function openEdit(row: PostDelegateRow) {
  editingId.value = row.id
  form.sourcePostId = row.sourcePostId
  form.targetPostId = row.targetPostId
  form.scopeType = row.scopeType === 'DEPT' ? 'DEPT' : 'ORG'
  form.deptId = row.deptId == null ? null : String(row.deptId)
  form.remark = row.remark ?? ''
  dialogVisible.value = true
}

async function submit() {
  if (form.sourcePostId == null || form.targetPostId == null) {
    ElMessage.warning(t('system.postDelegateSelectPosts'))
    return
  }
  if (form.scopeType === 'DEPT' && form.deptId == null) {
    ElMessage.warning(t('system.postDelegateSelectDept'))
    return
  }
  saving.value = true
  try {
    const payload = {
      sourcePostId: form.sourcePostId ?? '',
      targetPostId: form.targetPostId ?? '',
      scopeType: form.scopeType,
      deptId: form.scopeType === 'DEPT' ? (form.deptId ?? undefined) : undefined,
      status: 'ENABLED',
      remark: form.remark,
    }
    if (editingId.value == null) {
      await createPostDelegate(payload)
    } else {
      await updatePostDelegate({ ...payload, id: editingId.value })
    }
    ElMessage.success(t('common.saveSuccess'))
    dialogVisible.value = false
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.saveFailed'))
  } finally {
    saving.value = false
  }
}

async function toggleStatus(row: PostDelegateRow) {
  const next = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED'
  try {
    await changePostDelegateStatus(row.id, next)
    ElMessage.success(t('common.saveSuccess'))
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.saveFailed'))
  }
}

async function remove(row: PostDelegateRow) {
  try {
    await ElMessageBox.confirm(
      t('system.postDelegateDeleteConfirm', {
        names: `${postName(row.sourcePostId)} → ${postName(row.targetPostId)}`,
      }),
      t('common.confirm'),
      { type: 'warning' },
    )
  } catch {
    return
  }
  try {
    await deletePostDelegate(row.id)
    ElMessage.success(t('common.deleteSuccess'))
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.deleteFailed'))
  }
}

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数（对齐 PostList 先例）
function editRow(raw: unknown) {
  openEdit(raw as PostDelegateRow)
}
function toggleRow(raw: unknown) {
  void toggleStatus(raw as PostDelegateRow)
}
function removeRow(raw: unknown) {
  void remove(raw as PostDelegateRow)
}

function rowActions(raw: unknown): ListAction[] {
  const row = raw as PostDelegateRow
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      visible: hasPerm('system:postDelegate:update'),
      onClick: () => editRow(row),
    },
    {
      key: 'toggle',
      label: row.status === 'ENABLED' ? t('common.disable') : t('common.enable'),
      type: 'warning',
      visible: hasPerm('system:postDelegate:update'),
      onClick: () => toggleRow(row),
    },
    {
      key: 'delete',
      label: t('common.delete'),
      type: 'danger',
      visible: hasPerm('system:postDelegate:delete'),
      onClick: () => removeRow(row),
    },
  ]
}

onMounted(async () => {
  await loadOptions()
  await loadList()
})
</script>

<template>
  <StandardListTemplate
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #toolbar-actions>
      <el-button v-perm="'system:postDelegate:create'" type="primary" @click="openCreate">{{
        t('common.create')
      }}</el-button>
    </template>

    <template #filter>
      <ListFilterItem :label="t('common.status')">
        <el-select v-model="filter.status" :placeholder="t('common.all')" clearable>
          <el-option :label="t('common.enabled')" value="ENABLED" />
          <el-option :label="t('common.disabled')" value="DISABLED" />
        </el-select>
      </ListFilterItem>
      <ListFilterItem :label="t('system.postDelegateScope')">
        <el-select v-model="filter.scopeType" :placeholder="t('common.all')" clearable>
          <el-option :label="t('system.postDelegateScopeOrg')" value="ORG" />
          <el-option :label="t('system.postDelegateScopeDept')" value="DEPT" />
        </el-select>
      </ListFilterItem>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>

    <el-table v-loading="loading" :data="rows" stripe>
      <el-table-column :label="t('system.postDelegateSource')" min-width="200">
        <template #default="{ row }">{{ postName(row.sourcePostId) }}</template>
      </el-table-column>
      <el-table-column :label="t('system.postDelegateTarget')" min-width="200">
        <template #default="{ row }">{{ postName(row.targetPostId) }}</template>
      </el-table-column>
      <el-table-column :label="t('system.postDelegateScope')" min-width="180">
        <template #default="{ row }">
          {{
            row.scopeType === 'DEPT'
              ? `${t('system.postDelegateScopeDept')}：${deptName(row.deptId)}`
              : t('system.postDelegateScopeOrg')
          }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 'ENABLED' ? 'success' : 'info'">
            {{ row.status === 'ENABLED' ? t('common.enabled') : t('common.disabled') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="remark" :label="t('common.remark')" min-width="160" />
      <ListActionsColumn :actions="rowActions" :width="160" />
    </el-table>

    <template #empty-action>
      <el-button v-if="hasPerm('system:postDelegate:create')" type="primary" @click="openCreate">{{
        t('common.create')
      }}</el-button>
    </template>
  </StandardListTemplate>

  <el-dialog
    v-model="dialogVisible"
    :title="editingId == null ? t('system.postDelegateCreate') : t('system.postDelegateEdit')"
    width="520px"
    :close-on-click-modal="false"
    destroy-on-close
  >
    <el-form label-width="110px">
      <el-form-item :label="t('system.postDelegateSource')">
        <el-select v-model="form.sourcePostId" filterable style="width: 100%">
          <el-option
            v-for="post in posts"
            :key="post.id"
            :value="post.id ?? ''"
            :label="`${post.name}（${post.code}）`"
          />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('system.postDelegateTarget')">
        <el-select v-model="form.targetPostId" filterable style="width: 100%">
          <el-option
            v-for="post in posts"
            :key="post.id"
            :value="post.id ?? ''"
            :label="`${post.name}（${post.code}）`"
          />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('system.postDelegateScope')">
        <el-radio-group v-model="form.scopeType">
          <el-radio value="ORG">{{ t('system.postDelegateScopeOrg') }}</el-radio>
          <el-radio value="DEPT">{{ t('system.postDelegateScopeDept') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="form.scopeType === 'DEPT'" :label="t('system.postDelegateDept')">
        <el-select v-model="form.deptId" filterable style="width: 100%">
          <el-option v-for="dept in depts" :key="dept.id" :value="dept.id" :label="dept.name" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('common.remark')">
        <el-input v-model="form.remark" type="textarea" :rows="2" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="saving" @click="submit">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>
