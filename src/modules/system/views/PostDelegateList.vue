<script setup lang="ts">
/**
 * PostDelegateList — 岗位委托管理页（P64 阶段Ⅱ A07，后台组织域通用配置）。
 *
 * 维护「源岗位 → 受托岗位」关系：适用范围 ORG（组织默认）/ DEPT（精确部门，优先于 ORG）；
 * 启停即生效/失效（已冻结的运行名单沿参与人快照不受影响）。
 * 自委托/循环/跨租户/越权/同优先级重叠由服务端拒绝并透出可诊断消息。
 */
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from '@/locales'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
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
    const page = await pagePostDelegates(pageNum.value, pageSize.value)
    rows.value = page.list
    total.value = page.total
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('system.postDelegateLoadFailed'))
  } finally {
    loading.value = false
  }
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

onMounted(async () => {
  await loadOptions()
  await loadList()
})
</script>

<template>
  <div class="post-delegate-page">
    <el-card shadow="never">
      <template #header>
        <div class="page-header">
          <span>{{ t('system.postDelegateTitle') }}</span>
          <el-button type="primary" @click="openCreate">{{ t('common.create') }}</el-button>
        </div>
      </template>
      <el-alert
        class="page-hint"
        type="info"
        :closable="false"
        :title="t('system.postDelegateHint')"
      />
      <el-table v-loading="loading" :data="rows" border>
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column :label="t('system.postDelegateSource')" min-width="200">
          <template #default="{ row }">{{ postName(row.sourcePostId) }}</template>
        </el-table-column>
        <el-table-column :label="t('system.postDelegateTarget')" min-width="200">
          <template #default="{ row }">{{ postName(row.targetPostId) }}</template>
        </el-table-column>
        <el-table-column :label="t('system.postDelegateScope')" width="160">
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
        <el-table-column :label="t('common.actions')" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row as PostDelegateRow)">{{
              t('common.edit')
            }}</el-button>
            <el-button link type="warning" @click="toggleStatus(row as PostDelegateRow)">
              {{ row.status === 'ENABLED' ? t('common.disable') : t('common.enable') }}
            </el-button>
            <el-button link type="danger" @click="remove(row as PostDelegateRow)">{{
              t('common.delete')
            }}</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        class="page-pagination"
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="pageNum"
        @current-change="
          (page: number) => {
            pageNum = page
            loadList()
          }
        "
      />
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="editingId == null ? t('system.postDelegateCreate') : t('system.postDelegateEdit')"
      width="520px"
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
            <el-option
              v-for="dept in depts"
              :key="dept.id"
              :value="String(dept.id)"
              :label="dept.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.remark')">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="submit">{{
          t('common.save')
        }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.post-delegate-page {
  padding: 16px;
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.page-hint {
  margin-bottom: 12px;
}
.page-pagination {
  margin-top: 12px;
  justify-content: flex-end;
}
</style>
