<script setup lang="ts">
/* global crypto */
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
  queryTenantAdministrators,
  assignTenantAdministrator,
  createTenantAdministrator,
} from '@/modules/system/api/tenant'
import type { SysTenant, TenantFilter, TenantAdminCandidate } from '@/modules/system/types/tenant'
import type { PageQuery } from '@/contracts/common'
import { ListFilterItem, StandardListTemplate, ListActionsColumn } from '@/components/page-layout'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import DetailDialog from '@/components/DetailDialog.vue'

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
const creationRequestId = ref('')

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
  creationRequestId.value = crypto.randomUUID()
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
  if (submitting.value) return
  dialogVisible.value = false
}

async function handleSubmit() {
  if (submitting.value) return
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
        requestId: creationRequestId.value,
      })
      ElMessage.success(t('common.createSuccess'))
    }
    dialogVisible.value = false
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

const adminDialogVisible = ref(false)
const adminTenant = ref<SysTenant | null>(null)
const adminCandidates = ref<TenantAdminCandidate[]>([])
const adminLoading = ref(false)
const adminSubmitting = ref(false)
const adminError = ref('')
const adminMode = ref<'existing' | 'create'>('existing')
const administrator = reactive({ id: '', username: '', password: '' })
let adminLoadGeneration = 0

function resetAdminForm() {
  adminLoadGeneration++
  administrator.id = ''
  administrator.username = ''
  administrator.password = ''
  adminCandidates.value = []
  adminTenant.value = null
  adminError.value = ''
}

async function openAdministrator(row: SysTenant) {
  if (!canManage.value || isRootTenant(row)) return
  resetAdminForm()
  adminTenant.value = row
  administrator.id = row.adminUserId ?? ''
  adminMode.value = 'existing'
  adminDialogVisible.value = true
  adminLoading.value = true
  const generation = ++adminLoadGeneration
  try {
    const candidates = await queryTenantAdministrators(row.id!)
    if (generation !== adminLoadGeneration) return
    adminCandidates.value = candidates
    if (administrator.id && !candidates.some((candidate) => candidate.id === administrator.id)) {
      administrator.id = ''
    }
    if (!row.adminUserId && !candidates.length) adminMode.value = 'create'
  } catch (err) {
    if (generation === adminLoadGeneration) {
      adminError.value = err instanceof ApiError ? err.msg : t('tenantAdmin.loadFailed')
    }
  } finally {
    if (generation === adminLoadGeneration) adminLoading.value = false
  }
}

async function saveAdministrator() {
  if (adminSubmitting.value || adminLoading.value || !adminTenant.value?.id) return
  const tenantId = adminTenant.value.id
  if (adminMode.value === 'existing' && !administrator.id) {
    adminError.value = t('tenantAdmin.chooseRequired')
    return
  }
  if (adminMode.value === 'create' && (!administrator.username.trim() || !administrator.password)) {
    adminError.value = t('tenantAdmin.credentialsRequired')
    return
  }
  adminSubmitting.value = true
  adminError.value = ''
  try {
    if (adminMode.value === 'existing') {
      await assignTenantAdministrator(tenantId, administrator.id)
    } else {
      await createTenantAdministrator(
        tenantId,
        administrator.username.trim(),
        administrator.password,
      )
    }
    adminDialogVisible.value = false
    ElMessage.success(t('common.updateSuccess'))
    void loadList()
  } catch (err) {
    adminError.value = err instanceof ApiError ? err.msg : t('common.saveFailed')
  } finally {
    adminSubmitting.value = false
  }
}

/** 操作列：租户 0 只读；其余提供编辑与启停。 */
function rowActions(r: unknown): ListAction[] {
  const row = r as SysTenant
  if (isRootTenant(row)) {
    return [{ key: 'view', label: t('common.view'), onClick: () => openDetail(row) }]
  }
  return [
    {
      key: 'administrator',
      label: t('tenantAdmin.manage'),
      visible: canManage.value,
      onClick: () => void openAdministrator(row),
    },
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

function displayTime(value?: string) {
  return value ? value.replace('T', ' ').slice(0, 19) : '—'
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    class="tenant-list"
    appearance="design"
    filter-layout="inline"
    :title="t('system.tenantList')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <template #filter>
      <ListFilterItem class="tenant-list__name-filter" :label="t('system.tenantName')">
        <el-input
          v-model="filter.name"
          :placeholder="t('common.pleaseInput')"
          clearable
          @keyup.enter="handleQuery"
        />
      </ListFilterItem>
      <ListFilterItem class="tenant-list__status-filter" :label="t('common.status')">
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
        t('system.addTenant')
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
    <el-table v-loading="loading" :data="list">
      <el-table-column prop="code" :label="t('system.tenantCode')" width="166" />
      <el-table-column prop="name" :label="t('system.tenantName')" width="356" />
      <el-table-column :label="t('system.tenantAdmin')" width="276">
        <template #default="{ row }">
          {{ row.adminUsername || t('system.tenantAdminUnset') }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="176">
        <template #default="{ row }">
          {{ statusLabel(row.status) }}
        </template>
      </el-table-column>
      <el-table-column :label="t('common.createTime')" width="296">
        <template #default="{ row }">{{ displayTime(row.createTime) }}</template>
      </el-table-column>
      <ListActionsColumn :actions="rowActions" :width="372" />
    </el-table>

    <template #empty-action>
      <el-button v-if="canManage" type="primary" @click="openCreate">{{
        t('system.newTenant')
      }}</el-button>
    </template>
  </StandardListTemplate>

  <DetailDialog
    v-model="dialogVisible"
    class="tenant-dialog"
    appearance="design"
    :title="dialogTitle"
    width="760px"
    :error="formError"
    :show-close="!submitting"
    :close-on-press-escape="!submitting"
    :close-on-click-modal="false"
    @closed="resetForm"
  >
    <el-form label-position="top">
      <el-form-item :label="t('system.tenantName')" required>
        <el-input v-model="form.name" :placeholder="t('common.pleaseInput')" maxlength="64" />
      </el-form-item>
      <el-row v-if="!editingId" :gutter="20">
        <el-col :span="12">
          <el-form-item :label="t('system.tenantAdminAccount')" required>
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
    </el-form>
    <template #footer>
      <el-button :disabled="submitting" @click="closeDialog">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">{{
        t('common.save')
      }}</el-button>
    </template>
  </DetailDialog>

  <DetailDialog
    v-model="adminDialogVisible"
    class="tenant-dialog"
    appearance="design"
    :title="t('tenantAdmin.manage')"
    width="760px"
    :error="adminError"
    :loading="adminLoading"
    :show-close="!adminSubmitting"
    :close-on-press-escape="!adminSubmitting"
    :close-on-click-modal="false"
    @closed="resetAdminForm"
  >
    <el-form label-position="top">
      <el-form-item :label="t('system.tenantName')"
        ><el-input :model-value="adminTenant?.name ?? ''" readonly
      /></el-form-item>
      <el-form-item :label="t('tenantAdmin.mode')">
        <el-radio-group v-model="adminMode" :disabled="adminSubmitting">
          <el-radio-button value="existing">{{ t('tenantAdmin.existing') }}</el-radio-button>
          <el-radio-button value="create" :disabled="!!adminTenant?.adminUserId">{{
            t('tenantAdmin.create')
          }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <el-form-item v-if="adminMode === 'existing'" :label="t('system.tenantAdmin')" required>
        <el-select
          v-model="administrator.id"
          filterable
          :placeholder="t('tenantAdmin.chooseRequired')"
          :no-data-text="t('tenantAdmin.none')"
          :disabled="adminSubmitting"
        >
          <el-option
            v-for="candidate in adminCandidates"
            :key="candidate.id"
            :value="candidate.id"
            :label="
              candidate.realName && candidate.realName !== candidate.username
                ? `${candidate.realName} (${candidate.username})`
                : candidate.username
            "
          />
        </el-select>
      </el-form-item>
      <el-row v-else :gutter="20">
        <el-col :span="12"
          ><el-form-item :label="t('system.tenantAdminAccount')" required>
            <el-input
              v-model="administrator.username"
              maxlength="50"
              :disabled="adminSubmitting"
            /> </el-form-item
        ></el-col>
        <el-col :span="12"
          ><el-form-item :label="t('system.tenantPassword')" required>
            <el-input
              v-model="administrator.password"
              type="password"
              show-password
              maxlength="64"
              :disabled="adminSubmitting"
            /> </el-form-item
        ></el-col>
      </el-row>
    </el-form>
    <template #footer>
      <el-button :disabled="adminSubmitting" @click="adminDialogVisible = false">{{
        t('common.cancel')
      }}</el-button>
      <el-button
        type="primary"
        :loading="adminSubmitting"
        :disabled="adminLoading"
        @click="saveAdministrator"
        >{{ t('common.save') }}</el-button
      >
    </template>
  </DetailDialog>

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
        {{ displayTime(detailRow.createTime) }}
      </el-descriptions-item>
    </el-descriptions>
    <div class="tenant-create-hint">{{ t('system.tenantRootReadonly') }}</div>
    <template #footer>
      <el-button @click="detailVisible = false">{{ t('common.close') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.tenant-list :deep(.list-filter-bar__fields) {
  flex-wrap: nowrap;
  gap: var(--sw-space-8);
}
.tenant-list :deep(.list-filter-bar__actions) {
  margin-left: auto;
}
.tenant-list :deep(.list-filter-bar__actions .el-button) {
  width: 72px;
}
.tenant-list :deep(.list-filter-item) {
  display: flex;
  flex: 0 0 auto;
}
.tenant-list :deep(.list-filter-item__label) {
  color: var(--sw-text-regular);
  font-size: var(--sw-font-body);
  line-height: 22px;
}
.tenant-list :deep(.tenant-list__name-filter) {
  width: 310px;
}
.tenant-list :deep(.tenant-list__name-filter .list-filter-item__control) {
  width: 220px;
}
.tenant-list :deep(.tenant-list__status-filter .list-filter-item__control) {
  width: 100px;
}
.tenant-list :deep(.list-actions) {
  justify-content: flex-start;
}
@media (max-width: 1100px) {
  .tenant-list :deep(.list-filter-bar__fields) {
    flex-wrap: wrap;
  }
}
.tenant-create-hint {
  margin-top: 4px;
  padding-left: 96px;
  color: var(--sw-text-secondary);
  font-size: var(--sw-font-caption);
  line-height: 20px;
}
</style>

<style>
.tenant-dialog.el-dialog {
  box-sizing: border-box;
  max-width: calc(100vw - var(--sw-space-32));
  padding: var(--sw-space-24);
  border: 1px solid var(--sw-border-light);
}
.tenant-dialog .el-dialog__header {
  box-sizing: border-box;
  height: 32px;
  padding: 4px 32px 4px 0;
  margin: 0 0 var(--sw-space-16);
}
.tenant-dialog .el-dialog__title {
  font-size: var(--sw-font-h2);
  font-weight: var(--sw-font-weight-emphasis);
  line-height: var(--sw-space-24);
}
.tenant-dialog .el-dialog__headerbtn {
  top: var(--sw-space-24);
  right: var(--sw-space-24);
  width: 32px;
  height: 32px;
}
.tenant-dialog .el-dialog__body {
  padding: 0;
  overflow-x: hidden;
}
.tenant-dialog .el-form-item {
  margin-bottom: var(--sw-space-12);
}
.tenant-dialog .el-form > .el-form-item:last-child,
.tenant-dialog .el-row .el-form-item {
  margin-bottom: 0;
}
.tenant-dialog .el-form-item__label {
  height: 22px;
  line-height: 22px;
  margin-bottom: 6px;
  padding: 0;
  color: var(--sw-text-regular);
}
.tenant-dialog .el-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sw-space-8);
  height: 36px;
  margin-top: var(--sw-space-16);
  padding: 0;
}
.tenant-dialog .el-dialog__footer .el-button {
  width: 80px;
  margin: 0;
}
</style>
