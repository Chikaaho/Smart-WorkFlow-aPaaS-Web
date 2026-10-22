<script setup lang="ts">
/**
 * TenantList — 租户管理列表页（0.2.0 T020 / 设计节点 458:12660、458:12871、458:12943）。
 *
 * 只对租户 0 的系统超级管理员开放写操作（服务端二次校验）；
 * 租户 0 为保留对象，只提供查看。新建租户一次完成租户、根部门与首任管理员初始化，
 * 初始密码只在提交时使用，不在列表、详情或回执中回显。
 */
import { useI18n } from '@/locales'
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { useUserStore } from '@/stores/user'
import {
  pageTenants,
  createTenant,
  renameTenant,
  updateTenantStatus,
} from '@/modules/system/api/tenant'
import type { SysTenant, TenantFilter } from '@/modules/system/types/tenant'
import type { PageQuery } from '@/contracts/common'
import { ListFilterItem, StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'

const { t } = useI18n()
const userStore = useUserStore()
const canManage = computed(() => userStore.superAdmin)

// ─── 列表状态 ───

const list = ref<SysTenant[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

const filter = reactive<TenantFilter>({ name: '', status: undefined })
const currentFilter = reactive<TenantFilter>({ ...filter })

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageTenants(pageQuery, currentFilter)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    errorMsg.value = err instanceof ApiError ? err.msg : t('system.tenantListLoadFailed')
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  Object.assign(currentFilter, {
    name: filter.name || undefined,
    status: filter.status,
  })
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.name = ''
  filter.status = undefined
  currentFilter.name = undefined
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

// ─── 弹窗状态 ───

const dialogVisible = ref(false)
const editingId = ref<string | null>(null)
const submitting = ref(false)
const formError = ref('')

const dialogTitle = computed(() =>
  editingId.value ? t('system.editTenant') : t('system.newTenant'),
)

const form = reactive({
  name: '',
  adminUsername: '',
  adminPassword: '',
})

function resetForm() {
  form.name = ''
  form.adminUsername = ''
  form.adminPassword = ''
  editingId.value = null
  formError.value = ''
}

function openCreate() {
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: SysTenant) {
  resetForm()
  editingId.value = row.id ?? null
  form.name = row.name
  dialogVisible.value = true
}

const detailVisible = ref(false)
const detailRow = ref<SysTenant | null>(null)

function openDetail(row: SysTenant) {
  detailRow.value = row
  detailVisible.value = true
}

function closeDialog() {
  dialogVisible.value = false
}

async function handleSubmit() {
  if (!form.name.trim()) {
    formError.value = t('system.tenantNameRequired')
    return
  }
  if (!editingId.value) {
    if (!form.adminUsername.trim()) {
      formError.value = t('system.tenantAdminRequired')
      return
    }
    if (!form.adminPassword) {
      formError.value = t('system.tenantPasswordRequired')
      return
    }
  }

  submitting.value = true
  formError.value = ''
  try {
    if (editingId.value) {
      await renameTenant(editingId.value, form.name.trim())
      ElMessage.success(t('common.updateSuccess'))
    } else {
      await createTenant({
        name: form.name.trim(),
        adminUsername: form.adminUsername.trim(),
        adminPassword: form.adminPassword,
      })
      ElMessage.success(t('common.createSuccess'))
    }
    closeDialog()
    void loadList()
  } catch (err) {
    formError.value = err instanceof ApiError ? err.msg : t('common.saveFailed')
  } finally {
    submitting.value = false
  }
}

async function toggleStatus(row: SysTenant) {
  const next = row.status === 0 ? 1 : 0
  const action = next === 0 ? t('system.enableTenant') : t('system.disableTenant')
  try {
    await ElMessageBox.confirm(
      t('system.tenantStatusChangeConfirm', { action, name: row.name }),
      t('common.confirm'),
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
    await updateTenantStatus(row.id!, next)
    ElMessage.success(t('common.updateSuccess'))
    void loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.saveFailed'))
  }
}

function isRootTenant(row: SysTenant) {
  return row.id === '0'
}

/** 操作列：租户 0 只读；其余提供编辑与启停。 */
function rowActions(r: unknown): ListAction[] {
  const row = r as SysTenant
  if (isRootTenant(row)) {
    return [{ key: 'view', label: t('common.view'), onClick: () => openDetail(row) }]
  }
  return [
    {
      key: 'edit',
      label: t('common.edit'),
      visible: canManage.value,
      onClick: () => openEdit(row),
    },
    {
      key: 'status',
      label: row.status === 0 ? t('system.disableTenant') : t('system.enableTenant'),
      visible: canManage.value,
      type: row.status === 0 ? 'danger' : undefined,
      onClick: () => void toggleStatus(row),
    },
  ]
}

function statusLabel(status?: number) {
  return status === 0 ? t('common.statusNormal') : t('system.tenantStatusDisabled')
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('system.tenantList')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #filter>
      <ListFilterItem :label="t('system.tenantName')">
        <el-input
          v-model="filter.name"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="handleQuery"
        />
      </ListFilterItem>
      <ListFilterItem :label="t('common.status')">
        <el-select v-model="filter.status" :placeholder="t('common.all')" clearable>
          <el-option :label="t('common.statusNormal')" :value="0" />
          <el-option :label="t('system.tenantStatusDisabled')" :value="1" />
        </el-select>
      </ListFilterItem>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
      <el-button v-if="canManage" type="primary" @click="openCreate">{{
        t('system.newTenant')
      }}</el-button>
    </template>

    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="code" :label="t('system.tenantCode')" min-width="140" />
      <el-table-column prop="name" :label="t('system.tenantName')" min-width="160" />
      <el-table-column :label="t('system.tenantAdmin')" min-width="140">
        <template #default="{ row }">
          {{ row.adminUsername || t('system.tenantAdminUnset') }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 0 ? 'success' : 'info'" size="small">
            {{ statusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="createTime" :label="t('common.createTime')" min-width="170" />
      <ListActionsColumn :actions="rowActions" :width="150" />
    </el-table>

    <template #empty-action>
      <el-button v-if="canManage" type="primary" @click="openCreate">{{
        t('system.newTenant')
      }}</el-button>
    </template>
  </StandardListTemplate>

  <el-dialog v-model="dialogVisible" :title="dialogTitle" width="760px" @closed="resetForm">
    <el-alert
      v-if="formError"
      :title="formError"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <el-form label-width="96px">
      <el-form-item :label="t('system.tenantName')" required>
        <el-input v-model="form.name" :placeholder="t('common.pleaseInput')" maxlength="64" />
      </el-form-item>
      <el-row v-if="!editingId" :gutter="24">
        <el-col :span="12">
          <el-form-item :label="t('system.tenantAdmin')" required>
            <el-input
              v-model="form.adminUsername"
              :placeholder="t('common.pleaseInput')"
              maxlength="50"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('system.tenantPassword')" required>
            <el-input
              v-model="form.adminPassword"
              type="password"
              show-password
              :placeholder="t('common.pleaseInput')"
              maxlength="64"
            />
          </el-form-item>
        </el-col>
      </el-row>
      <div v-if="!editingId" class="tenant-create-hint">
        {{ t('system.tenantCreateHint') }}
      </div>
    </el-form>
    <template #footer>
      <el-button @click="closeDialog">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">{{
        t('common.save')
      }}</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="detailVisible" :title="t('system.tenantDetail')" width="560px">
    <el-descriptions v-if="detailRow" :column="1" border>
      <el-descriptions-item :label="t('system.tenantCode')">{{
        detailRow.code
      }}</el-descriptions-item>
      <el-descriptions-item :label="t('system.tenantName')">{{
        detailRow.name
      }}</el-descriptions-item>
      <el-descriptions-item :label="t('system.tenantAdmin')">
        {{ detailRow.adminUsername || t('system.tenantAdminUnset') }}
      </el-descriptions-item>
      <el-descriptions-item :label="t('common.status')">
        {{ statusLabel(detailRow.status) }}
      </el-descriptions-item>
      <el-descriptions-item :label="t('common.createTime')">
        {{ detailRow.createTime }}
      </el-descriptions-item>
    </el-descriptions>
    <div class="tenant-create-hint">{{ t('system.tenantRootReadonly') }}</div>
    <template #footer>
      <el-button @click="detailVisible = false">{{ t('common.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.tenant-create-hint {
  margin-top: 4px;
  padding-left: 96px;
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-caption);
  line-height: 20px;
}
</style>
